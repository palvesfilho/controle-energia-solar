/**
 * Confere a geração diária CALCULADA a partir das amostras de 15 min contra a
 * que já está registrada em `MonitoringLog` (vinda do sync oficial de cada
 * plataforma).
 *
 * É a prova de que o coletor novo pode assumir a geração diária: se as duas
 * contas divergem muito, o erro é da nossa integral — e escrever por cima
 * estragaria o histórico do cliente sem nenhum alarme.
 *
 * NÃO ESCREVE NADA. Só lê e compara.
 *
 * Uso:
 *   npx tsx scripts/diag-intraday-vs-monitoringlog.ts --dia=2026-08-07
 *   npx tsx scripts/diag-intraday-vs-monitoringlog.ts --dia=2026-08-07 --coletar --limite=4
 */
import { prisma } from "../src/lib/prisma";
import { coletarIntradia, PLATAFORMAS_INTRADIA } from "../src/lib/intraday-collector";
import { calcularGeracaoDoDia, dataDoLog } from "../src/lib/intraday-generation";

function arg(nome: string): string | undefined {
  const flag = `--${nome}=`;
  const a = process.argv.find((x) => x.startsWith(flag));
  return a ? a.slice(flag.length) : undefined;
}

async function main() {
  const diaStr = arg("dia");
  if (!diaStr || !/^\d{4}-\d{2}-\d{2}$/.test(diaStr)) {
    console.error("Informe --dia=YYYY-MM-DD");
    process.exit(1);
  }
  const [y, m, d] = diaStr.split("-").map(Number);
  const inicioDia = new Date(Date.UTC(y, m - 1, d));
  const fimDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);
  const limite = Number(arg("limite") ?? 4);

  // Amostra: as primeiras N usinas de cada plataforma que JÁ têm MonitoringLog
  // nesse dia — sem log oficial não há com o que comparar.
  const comLog = await prisma.monitoringLog.findMany({
    where: { data: dataDoLog(inicioDia), geracaoDiaria: { gt: 0 }, origem: "API" },
    select: { clientId: true, geracaoDiaria: true },
  });
  const oficial = new Map(comLog.map((l) => [l.clientId, l.geracaoDiaria]));

  const usinas = await prisma.brasilSolarClient.findMany({
    where: { id: { in: [...oficial.keys()] }, active: true, monitoramentoPlantId: { not: null } },
    select: { id: true, nome: true, plataformaMonitoramento: true },
  });

  const amostra: typeof usinas = [];
  const contagem = new Map<string, number>();
  for (const u of usinas) {
    const p = u.plataformaMonitoramento ?? "?";
    const n = contagem.get(p) ?? 0;
    if (n < limite) {
      amostra.push(u);
      contagem.set(p, n + 1);
    }
  }
  console.log(
    `Dia ${diaStr} · ${amostra.length} usinas na amostra (${[...contagem].map(([p, n]) => `${p}=${n}`).join(" ")})`,
  );
  if (amostra.length === 0) return;

  if (process.argv.includes("--coletar")) {
    // Coleta o dia inteiro (8h–23h UTC = 5h–20h BRT) dessas usinas.
    const fimJanela = new Date(inicioDia.getTime() + 23 * 60 * 60 * 1000);
    const minutos = Math.round((fimJanela.getTime() - (inicioDia.getTime() + 8 * 3600 * 1000)) / 60000);
    console.log(`Coletando o dia inteiro dessas usinas (${minutos} min de janela)…`);
    const r = await coletarIntradia({
      plataformas: PLATAFORMAS_INTRADIA,
      clientIds: amostra.map((u) => u.id),
      minutos,
      agora: fimJanela,
      ignorarJanelaSolar: true,
    });
    for (const p of r.plataformas) {
      if (p.usinas > 0) console.log(`  ${p.plataforma}: ${p.slotsGravados} slots, ${p.erros.length} erros`);
    }
  }

  const amostras = await prisma.inverterSample.findMany({
    where: { clientId: { in: amostra.map((u) => u.id) }, timeStamp: { gte: inicioDia, lt: fimDia } },
    select: { clientId: true, psKey: true, timeStamp: true, p1Wh: true, pAcW: true },
  });
  const calculado = calcularGeracaoDoDia(amostras);

  console.log(
    `\n${"USINA".padEnd(38)} ${"PLATAF.".padEnd(10)} ${"OFICIAL".padStart(9)} ${"CALCULADO".padStart(10)} ${"DIF".padStart(8)}  MÉTODO`,
  );
  const desvios: number[] = [];
  for (const u of amostra.sort((a, b) =>
    (a.plataformaMonitoramento ?? "").localeCompare(b.plataformaMonitoramento ?? ""),
  )) {
    const of = oficial.get(u.id) ?? 0;
    const calc = calculado.get(u.id);
    if (!calc) {
      console.log(`${u.nome.slice(0, 37).padEnd(38)} ${(u.plataformaMonitoramento ?? "").padEnd(10)} ${of.toFixed(2).padStart(9)} ${"—".padStart(10)} ${"sem amostra".padStart(8)}`);
      continue;
    }
    const dif = of > 0 ? ((calc.kwh - of) / of) * 100 : 0;
    desvios.push(Math.abs(dif));
    const marca = Math.abs(dif) > 10 ? " ⚠" : "";
    console.log(
      `${u.nome.slice(0, 37).padEnd(38)} ${(u.plataformaMonitoramento ?? "").padEnd(10)} ` +
        `${of.toFixed(2).padStart(9)} ${calc.kwh.toFixed(2).padStart(10)} ${`${dif >= 0 ? "+" : ""}${dif.toFixed(1)}%`.padStart(8)}  ${calc.metodo}${marca}`,
    );
  }

  if (desvios.length > 0) {
    const medio = desvios.reduce((s, v) => s + v, 0) / desvios.length;
    const acima10 = desvios.filter((d) => d > 10).length;
    console.log(
      `\nDesvio absoluto médio: ${medio.toFixed(1)}% · ${acima10}/${desvios.length} usinas acima de 10%`,
    );
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
