import { prisma } from "../src/lib/prisma";
import { getDailyGeneration as froniusDaily } from "../src/lib/fronius";
import { getDailyGeneration as huaweiDaily } from "../src/lib/huawei";
import { getDailyGeneration as sungrowDaily } from "../src/lib/sungrow";
import { getDailyGeneration as solaredgeDaily } from "../src/lib/solaredge";

/**
 * Fecha buracos de `MonitoringLog` continuamente, sem ninguém pedir.
 *
 * Por que precisa existir: o relatório Brasil Solar soma
 * `MonitoringLog.geracaoDiaria` do ciclo de leitura da fatura, e
 * `sumGenerationForPeriod` só recorre à API em cache miss TOTAL. Um mês com
 * 1 dia gravado passa por completo — o relatório mostra menos do que a usina
 * gerou e ainda carimba "geração reportada incompleta", culpando o inversor
 * por uma lacuna nossa. Foi o que aconteceu com JOÃO ALBERTO CORREA em
 * 08/2025 (127,7 kWh no lugar de 339,4).
 *
 * Como evita queimar a API à toa:
 *  - Mês cujo banco já tem todos os dias do calendário é pulado SEM chamar a
 *    API (a maioria dos casos).
 *  - Só os meses deficitários viram chamada. Se a API devolver menos dias que
 *    o calendário, tudo bem: dia que o inversor não reportou não existe em
 *    lugar nenhum e não conta como lacuna.
 *  - Orçamento de tempo por execução (--max-minutos). Ao estourar, grava um
 *    cursor em AppSetting e a execução seguinte continua de onde parou.
 *  - Usinas com proprietário primeiro: são as únicas que podem virar relatório.
 *
 * Grava sempre em meio-dia UTC (ver feedback_monitoring_log_date_utc) e é
 * idempotente — upsert por (clientId, data).
 *
 * Uso:
 *   tsx scripts/backfill-monitoring-gaps.ts                      (dry-run, 3 meses)
 *   tsx scripts/backfill-monitoring-gaps.ts --apply
 *   tsx scripts/backfill-monitoring-gaps.ts --apply --meses=13 --max-minutos=90
 *   tsx scripts/backfill-monitoring-gaps.ts --apply --plataforma=FRONIUS
 *   tsx scripts/backfill-monitoring-gaps.ts --apply --todos   (inclui usinas sem proprietário)
 */

const CURSOR_KEY = "backfill.monitoring.cursor";
const RESUMO_KEY = "backfill.monitoring.ultimoResumo";

function arg(nome: string): string | null {
  const p = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return p ? p.slice(nome.length + 3) : null;
}
function argNum(nome: string, padrao: number): number {
  const v = arg(nome);
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

const APPLY = process.argv.includes("--apply");
const TODOS = process.argv.includes("--todos");
const MESES = argNum("meses", 3);
const MAX_MINUTOS = argNum("max-minutos", 45);
const PLATAFORMA = arg("plataforma")?.toUpperCase() ?? null;

const inicioExecucao = Date.now();
const estourouTempo = () => Date.now() - inicioExecucao > MAX_MINUTOS * 60_000;

function diasNoMes(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

async function buscarDias(plataforma: string, plantId: string, ano: number, mes: number) {
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
  const agora = new Date();
  const janelas: { ano: number; mes: number }[] = [];
  for (let i = MESES - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1));
    janelas.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
  }
  const desde = new Date(Date.UTC(janelas[0].ano, janelas[0].mes - 1, 1));

  console.log(
    `backfill-monitoring-gaps ${APPLY ? "" : "(DRY-RUN) "}| ${MESES} meses ` +
      `(${janelas[0].ano}-${String(janelas[0].mes).padStart(2, "0")} a ` +
      `${janelas[MESES - 1].ano}-${String(janelas[MESES - 1].mes).padStart(2, "0")}) ` +
      `| orçamento ${MAX_MINUTOS} min${PLATAFORMA ? ` | só ${PLATAFORMA}` : ""}`,
  );

  const clients = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      monitoramentoPlantId: { not: null },
      plataformaMonitoramento: PLATAFORMA
        ? { equals: PLATAFORMA, mode: "insensitive" }
        : { not: null },
      ...(TODOS ? {} : { proprietarioId: { not: null } }),
    },
    select: {
      id: true,
      nome: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      geracaoMediaEsperada: true,
      dataInstalacao: true,
      proprietarioId: true,
    },
    // Ordem estável: o cursor depende dela pra retomar no lugar certo.
    orderBy: [{ proprietarioId: "asc" }, { id: "asc" }],
  });
  console.log(`Candidatas: ${clients.length}${TODOS ? "" : " (só com proprietário — use --todos pra varrer a base inteira)"}`);

  // Uma query pra toda a cobertura da janela.
  const rows = await prisma.$queryRawUnsafe<
    { client_id: string; ano: number; mes: number; dias: bigint }[]
  >(
    `SELECT client_id,
            EXTRACT(YEAR FROM data)::int AS ano,
            EXTRACT(MONTH FROM data)::int AS mes,
            COUNT(DISTINCT date_trunc('day', data))::bigint AS dias
     FROM monitoring_logs
     WHERE data >= $1
     GROUP BY 1,2,3`,
    desde,
  );
  const cobertura = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const k = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
    if (!cobertura.has(r.client_id)) cobertura.set(r.client_id, new Map());
    cobertura.get(r.client_id)!.set(k, Number(r.dias));
  }

  // Retoma de onde a execução anterior parou.
  const cursorRow = await prisma.appSetting.findUnique({ where: { key: CURSOR_KEY } });
  const cursor = cursorRow?.value ?? null;
  let comeco = 0;
  if (cursor) {
    const idx = clients.findIndex((c) => c.id === cursor);
    if (idx >= 0) comeco = idx + 1;
  }
  if (comeco >= clients.length) comeco = 0;
  console.log(`Retomando do índice ${comeco}${cursor ? ` (após ${cursor})` : ""}\n`);

  let visitados = 0;
  let pulados = 0;
  let comChamada = 0;
  let criados = 0;
  let atualizados = 0;
  const erros: string[] = [];
  let ultimoId: string | null = cursor;

  for (let n = 0; n < clients.length; n++) {
    if (estourouTempo()) {
      console.log(`\n⏱ Orçamento de ${MAX_MINUTOS} min esgotado — parando e salvando cursor.`);
      break;
    }
    const c = clients[(comeco + n) % clients.length];
    visitados++;
    ultimoId = c.id;

    const plataforma = c.plataformaMonitoramento?.toUpperCase() ?? null;
    if (!plataforma || !c.monitoramentoPlantId) continue;
    const mapa = cobertura.get(c.id) ?? new Map<string, number>();

    // Só os meses em que o banco tem MENOS dias que o calendário viram chamada.
    const deficitarios = janelas.filter((j) => {
      if (c.dataInstalacao && new Date(Date.UTC(j.ano, j.mes, 0)) < c.dataInstalacao) return false;
      const k = `${j.ano}-${String(j.mes).padStart(2, "0")}`;
      const gravados = mapa.get(k) ?? 0;
      const ehMesCorrente =
        j.ano === agora.getUTCFullYear() && j.mes === agora.getUTCMonth() + 1;
      const teto = ehMesCorrente ? Math.max(0, agora.getUTCDate() - 1) : diasNoMes(j.ano, j.mes);
      return teto > 0 && gravados < teto;
    });

    if (deficitarios.length === 0) {
      pulados++;
      continue;
    }
    comChamada++;

    for (const j of deficitarios) {
      if (estourouTempo()) break;
      let dias: { day: number; energyKwh: number }[];
      try {
        dias = await buscarDias(plataforma, c.monitoramentoPlantId, j.ano, j.mes);
      } catch (e) {
        erros.push(`${c.nome} ${j.ano}-${j.mes}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
        continue;
      }
      if (dias.length === 0) continue;

      const k = `${j.ano}-${String(j.mes).padStart(2, "0")}`;
      const jaTem = mapa.get(k) ?? 0;
      // A API é a verdade: se ela tem os mesmos dias que o banco, o "déficit"
      // era só dia que o inversor nunca reportou — não há nada a preencher.
      if (dias.length <= jaTem) continue;

      if (!APPLY) {
        console.log(`  [dry] ${c.nome} [${plataforma}] ${k}: banco ${jaTem}d -> API ${dias.length}d`);
        continue;
      }

      for (const d of dias) {
        const data = new Date(Date.UTC(j.ano, j.mes - 1, d.day, 12, 0, 0));
        const antes = await prisma.monitoringLog.findUnique({
          where: { clientId_data: { clientId: c.id, data } },
          select: { id: true },
        });
        await prisma.monitoringLog.upsert({
          where: { clientId_data: { clientId: c.id, data } },
          // origem: "API" derruba lançamento manual do dia — dado medido vence.
          update: { origem: "API", geracaoDiaria: d.energyKwh },
          create: {
            clientId: c.id,
            data,
            geracaoDiaria: d.energyKwh,
            geracaoEsperada: c.geracaoMediaEsperada ? c.geracaoMediaEsperada / 30 : null,
          },
        });
        if (antes) atualizados++;
        else criados++;
      }
      console.log(`  ${c.nome} [${plataforma}] ${k}: banco ${jaTem}d -> API ${dias.length}d`);
    }
  }

  const minutos = ((Date.now() - inicioExecucao) / 60000).toFixed(1);
  const resumo =
    `visitados=${visitados} pulados=${pulados} comChamada=${comChamada} ` +
    `criados=${criados} atualizados=${atualizados} erros=${erros.length} minutos=${minutos}`;
  console.log(`\n=== ${APPLY ? "APLICADO" : "DRY-RUN"} ===`);
  console.log(`  ${resumo}`);
  if (erros.length) {
    console.log(`\n  Primeiros erros:`);
    for (const e of erros.slice(0, 10)) console.log(`    ${e}`);
  }

  if (APPLY && ultimoId) {
    await prisma.appSetting.upsert({
      where: { key: CURSOR_KEY },
      update: { value: ultimoId },
      create: { key: CURSOR_KEY, value: ultimoId },
    });
    await prisma.appSetting.upsert({
      where: { key: RESUMO_KEY },
      update: { value: `${new Date().toISOString()} ${resumo}` },
      create: { key: RESUMO_KEY, value: `${new Date().toISOString()} ${resumo}` },
    });
    console.log(`\n  Cursor salvo em ${ultimoId} — a próxima execução continua daí.`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
