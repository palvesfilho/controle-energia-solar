/**
 * Recalcula a geração diária (`MonitoringLog`) de dias passados a partir da
 * curva intradiária das plataformas.
 *
 * POR QUE: o sync antigo rodava no meio da tarde e congelava o total daquele
 * instante — a usina MIO3K ficou registrada com 20,76 kWh num dia que fechou
 * em 123,07. Quem foi sincronizado depois do dia terminar bate exato; quem foi
 * sincronizado às 15h ficou com o dia pela metade, sem nenhum sinal de erro.
 *
 * As amostras NÃO são gravadas (`persistir: false`): 39 dias × frota daria da
 * ordem de 4 milhões de linhas de curva só pra corrigir os totais diários.
 * Grava apenas `MonitoringLog` e os campos desnormalizados da usina.
 *
 * Uso:
 *   npx tsx scripts/backfill-geracao-diaria.ts --de=2026-07-01 --ate=2026-08-07
 *   npx tsx scripts/backfill-geracao-diaria.ts --de=2026-07-01 --ate=2026-07-05 --dry
 *   npx tsx scripts/backfill-geracao-diaria.ts --de=... --plataformas=FRONIUS
 */
import { prisma } from "../src/lib/prisma";
import { coletarIntradia, type PlataformaIntradia } from "../src/lib/intraday-collector";
import { atualizarGeracaoDoDia, calcularGeracaoDoDia } from "../src/lib/intraday-generation";

/**
 * Huawei fica de fora por padrão: a API dela recusa acesso frequente
 * (failCode 407) e um backfill de dezenas de dias só queimaria a cota sem
 * trazer dado. Ela se preenche pelo cron, dia a dia.
 */
const PLATAFORMAS_PADRAO: PlataformaIntradia[] = ["SUNGROW", "SOLAREDGE", "FRONIUS"];

function arg(nome: string): string | undefined {
  const flag = `--${nome}=`;
  const a = process.argv.find((x) => x.startsWith(flag));
  return a ? a.slice(flag.length) : undefined;
}

function parseDia(s: string | undefined, rotulo: string): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    console.error(`Informe --${rotulo}=YYYY-MM-DD`);
    process.exit(1);
  }
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function main() {
  const de = parseDia(arg("de"), "de");
  const ate = parseDia(arg("ate"), "ate");
  const dry = process.argv.includes("--dry");
  const plataformas = (arg("plataformas")?.split(",").map((p) => p.trim().toUpperCase()) ??
    PLATAFORMAS_PADRAO) as PlataformaIntradia[];

  const dias: Date[] = [];
  for (let t = de.getTime(); t <= ate.getTime(); t += 24 * 60 * 60 * 1000) dias.push(new Date(t));

  console.log(
    `[backfill] ${dias.length} dia(s) de ${arg("de")} a ${arg("ate")} · ${plataformas.join(", ")}` +
      `${dry ? " · SIMULAÇÃO (não grava)" : ""}`,
  );

  const inicio = Date.now();
  let totalLogs = 0;

  for (const [i, dia] of dias.entries()) {
    const ymd = dia.toISOString().slice(0, 10);
    const t0 = Date.now();

    // Janela = dia solar inteiro (8h–23h UTC = 5h–20h BRT), ancorada no fim.
    const fimDoDia = new Date(dia.getTime() + 23 * 60 * 60 * 1000);
    const coleta = await coletarIntradia({
      plataformas,
      minutos: 15 * 60,
      agora: fimDoDia,
      ignorarJanelaSolar: true,
      persistir: false,
    });

    const amostras = (coleta.slots ?? []).map((s) => ({
      clientId: s.clientId,
      psKey: s.psKey,
      timeStamp: s.slotInicio,
      p1Wh: s.energiaDiaWh,
      pAcW: s.potenciaMediaW,
    }));

    const erros = coleta.plataformas.reduce((s, p) => s + p.erros.length, 0);

    if (dry) {
      const calc = calcularGeracaoDoDia(amostras);
      const soma = [...calc.values()].reduce((s, g) => s + g.kwh, 0);
      console.log(
        `  ${ymd}  ${String(calc.size).padStart(4)} usinas · ${soma.toFixed(0).padStart(7)} kWh · ` +
          `${((Date.now() - t0) / 1000).toFixed(0)}s · ${erros} erros  [simulação]`,
      );
      continue;
    }

    const g = await atualizarGeracaoDoDia({ dia, plataformas, amostras });
    totalLogs += g.logsGravados;

    const restantes = dias.length - i - 1;
    const mediaMs = (Date.now() - inicio) / (i + 1);
    console.log(
      `  ${ymd}  ${String(g.logsGravados).padStart(4)} logs · ${((Date.now() - t0) / 1000).toFixed(0)}s · ` +
        `${erros} erros · faltam ${restantes} dia(s) (~${Math.round((restantes * mediaMs) / 60000)} min)`,
    );
  }

  console.log(
    `[backfill] fim em ${((Date.now() - inicio) / 60000).toFixed(1)} min · ${totalLogs} MonitoringLog gravados`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("[backfill] FALHA:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
