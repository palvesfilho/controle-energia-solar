import { prisma } from "../src/lib/prisma";
import { getDailyGeneration as froniusDaily } from "../src/lib/fronius";
import { getDailyGeneration as huaweiDaily } from "../src/lib/huawei";
import { getDailyGeneration as sungrowDaily } from "../src/lib/sungrow";
import { getDailyGeneration as solaredgeDaily } from "../src/lib/solaredge";

/**
 * Preenche lacunas de `MonitoringLog` a partir da API do inversor.
 *
 * Por que existe: o relatório Brasil Solar soma `MonitoringLog.geracaoDiaria`
 * do ciclo de leitura da fatura. Mês sem log vira geração `null` (ou parcial,
 * pior ainda — um ciclo meio preenchido mostra menos do que a usina gerou).
 * `sumGenerationForPeriod` só bate na API nos 12 meses exibidos e apenas em
 * cache miss TOTAL: se o mês tem 1 dia gravado, ele acredita no cache.
 *
 * Grava sempre em meio-dia UTC — ver [[feedback_monitoring_log_date_utc]].
 * Idempotente: upsert por (clientId, data).
 *
 * Uso:
 *   tsx scripts/backfill-monitoring-log.ts --client=<id> --de=2025-01 --ate=2025-07
 *   tsx scripts/backfill-monitoring-log.ts --client=<id> --de=2025-01 --ate=2025-07 --apply
 */

function arg(nome: string): string | null {
  const p = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return p ? p.slice(nome.length + 3) : null;
}

const APPLY = process.argv.includes("--apply");
const CLIENT_ID = arg("client");
const DE = arg("de");
const ATE = arg("ate");

function parseMes(s: string, rotulo: string): { ano: number; mes: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`--${rotulo} deve ser YYYY-MM (recebido: ${s})`);
  return { ano: Number(m[1]), mes: Number(m[2]) };
}

async function buscarDias(
  plataforma: string,
  plantId: string,
  ano: number,
  mes: number,
) {
  switch (plataforma) {
    case "FRONIUS":
      return froniusDaily(plantId, ano, mes);
    case "HUAWEI":
      return huaweiDaily(plantId, ano, mes);
    case "SUNGROW":
      return sungrowDaily(plantId, ano, mes);
    case "SOLAREDGE": {
      const siteId = parseInt(plantId, 10);
      if (Number.isNaN(siteId)) throw new Error("SolarEdge siteId inválido");
      return solaredgeDaily(siteId, ano, mes);
    }
    default:
      throw new Error(`plataforma '${plataforma}' não suportada`);
  }
}

async function main() {
  if (!CLIENT_ID || !DE || !ATE) {
    console.error(
      `Uso: tsx scripts/backfill-monitoring-log.ts --client=<id> --de=YYYY-MM --ate=YYYY-MM [--apply]`,
    );
    process.exit(1);
  }
  const de = parseMes(DE, "de");
  const ate = parseMes(ATE, "ate");

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id: CLIENT_ID },
    select: {
      id: true,
      nome: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      geracaoMediaEsperada: true,
    },
  });
  if (!client) throw new Error(`cliente ${CLIENT_ID} não encontrado`);
  const plataforma = client.plataformaMonitoramento?.toUpperCase() ?? null;
  if (!plataforma || !client.monitoramentoPlantId) {
    throw new Error(`${client.nome} não tem plataforma/plantId de monitoramento`);
  }
  console.log(
    `${client.nome} [${plataforma}] plantId=${client.monitoramentoPlantId}\n` +
      `Periodo: ${DE} a ${ATE}${APPLY ? "" : "   (DRY-RUN)"}\n`,
  );

  let criados = 0;
  let atualizados = 0;
  let semDado = 0;

  for (let ano = de.ano; ano <= ate.ano; ano++) {
    const mesIni = ano === de.ano ? de.mes : 1;
    const mesFim = ano === ate.ano ? ate.mes : 12;
    for (let mes = mesIni; mes <= mesFim; mes++) {
      let dias: { day: number; energyKwh: number }[];
      try {
        dias = await buscarDias(plataforma, client.monitoramentoPlantId!, ano, mes);
      } catch (e) {
        console.log(`  ${ano}-${String(mes).padStart(2, "0")}: ERRO ${e instanceof Error ? e.message.slice(0, 60) : e}`);
        continue;
      }
      if (dias.length === 0) {
        semDado++;
        console.log(`  ${ano}-${String(mes).padStart(2, "0")}: sem dado na API`);
        continue;
      }

      const existentes = await prisma.monitoringLog.count({
        where: {
          clientId: client.id,
          data: { gte: new Date(Date.UTC(ano, mes - 1, 1)), lt: new Date(Date.UTC(ano, mes, 1)) },
        },
      });
      const totalKwh = dias.reduce((s, d) => s + d.energyKwh, 0);
      console.log(
        `  ${ano}-${String(mes).padStart(2, "0")}: API ${dias.length}d / ${totalKwh.toFixed(1)} kWh | banco ${existentes}d`,
      );

      if (!APPLY) continue;

      for (const d of dias) {
        const data = new Date(Date.UTC(ano, mes - 1, d.day, 12, 0, 0));
        const antes = await prisma.monitoringLog.findUnique({
          where: { clientId_data: { clientId: client.id, data } },
          select: { id: true },
        });
        await prisma.monitoringLog.upsert({
          where: { clientId_data: { clientId: client.id, data } },
          update: { geracaoDiaria: d.energyKwh },
          create: {
            clientId: client.id,
            data,
            geracaoDiaria: d.energyKwh,
            geracaoEsperada: client.geracaoMediaEsperada
              ? client.geracaoMediaEsperada / 30
              : null,
          },
        });
        if (antes) atualizados++;
        else criados++;
      }
    }
  }

  console.log(
    `\n${APPLY ? "APLICADO" : "DRY-RUN"} — criados: ${criados} | atualizados: ${atualizados} | meses sem dado: ${semDado}`,
  );
  if (!APPLY) console.log(`Rode com --apply para gravar.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
