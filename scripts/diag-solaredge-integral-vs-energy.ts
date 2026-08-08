/**
 * A integral da curva de 15 min do SolarEdge bate com a energia diária que a
 * própria SolarEdge reporta?
 *
 * Só lê. Existe porque o `MonitoringLog` está quase vazio (1–3 usinas/dia), e
 * sem uma referência independente não dá pra saber se a nossa conta subestima.
 *
 * Uso: npx tsx scripts/diag-solaredge-integral-vs-energy.ts --dia=2026-08-07 --limite=10
 */
import { prisma } from "../src/lib/prisma";

const BASE = "https://monitoringapi.solaredge.com";

function arg(nome: string): string | undefined {
  const flag = `--${nome}=`;
  const a = process.argv.find((x) => x.startsWith(flag));
  return a ? a.slice(flag.length) : undefined;
}

async function main() {
  const dia = arg("dia");
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    console.error("Informe --dia=YYYY-MM-DD");
    process.exit(1);
  }
  const limite = Number(arg("limite") ?? 10);
  const key = process.env.SOLAREDGE_API_KEY;
  if (!key) throw new Error("SOLAREDGE_API_KEY ausente");

  const usinas = await prisma.brasilSolarClient.findMany({
    where: { active: true, plataformaMonitoramento: "SOLAREDGE", monitoramentoPlantId: { not: null } },
    select: { nome: true, monitoramentoPlantId: true },
    take: limite,
    orderBy: { nome: "asc" },
  });

  const ids = usinas.map((u) => u.monitoramentoPlantId!);

  // 1. Energia do dia, direto da SolarEdge (bulk, timeUnit=DAY).
  const energiaUrl =
    `${BASE}/sites/${ids.join(",")}/energy?api_key=${key}` +
    `&timeUnit=DAY&startDate=${dia}&endDate=${dia}`;
  const eRes = await fetch(energiaUrl, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!eRes.ok) throw new Error(`/energy HTTP ${eRes.status}: ${(await eRes.text()).slice(0, 200)}`);
  const eBody = (await eRes.json()) as {
    sitesEnergy?: {
      siteEnergyList?: Array<{ siteId: number; energyValues?: { values?: Array<{ value: number | null }> } }>;
    };
  };
  const oficialWh = new Map<string, number>();
  for (const s of eBody.sitesEnergy?.siteEnergyList ?? []) {
    const v = s.energyValues?.values?.[0]?.value;
    if (v != null) oficialWh.set(String(s.siteId), v);
  }

  // 2. Curva de 15 min do mesmo dia (05h–20h BRT), integrada.
  const pRes = await fetch(
    `${BASE}/sites/${ids.join(",")}/power?api_key=${key}` +
      `&startTime=${encodeURIComponent(`${dia} 05:00:00`)}&endTime=${encodeURIComponent(`${dia} 20:00:00`)}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  if (!pRes.ok) throw new Error(`/power HTTP ${pRes.status}: ${(await pRes.text()).slice(0, 200)}`);
  const pBody = (await pRes.json()) as {
    powerDateValuesList?: {
      siteEnergyList?: Array<{
        siteId: number;
        powerDataValueSeries?: { values?: Array<{ date: string; value?: number | null }> };
      }>;
    };
  };
  const integralWh = new Map<string, { wh: number; pontos: number }>();
  for (const s of pBody.powerDateValuesList?.siteEnergyList ?? []) {
    let wh = 0;
    let pontos = 0;
    for (const v of s.powerDataValueSeries?.values ?? []) {
      if (v.value == null) continue;
      wh += v.value * 0.25; // W médio no quarto de hora → Wh
      pontos++;
    }
    integralWh.set(String(s.siteId), { wh, pontos });
  }

  console.log(`\nSolarEdge · ${dia}\n`);
  console.log(`${"USINA".padEnd(36)} ${"OFICIAL kWh".padStart(12)} ${"INTEGRAL kWh".padStart(13)} ${"DIF".padStart(8)} ${"PTS".padStart(4)}`);
  const difs: number[] = [];
  for (const u of usinas) {
    const id = u.monitoramentoPlantId!;
    const of = oficialWh.get(id);
    const inte = integralWh.get(id);
    if (of == null || of <= 0 || !inte) {
      console.log(`${u.nome.slice(0, 35).padEnd(36)} ${(of != null ? (of / 1000).toFixed(2) : "—").padStart(12)} ${"—".padStart(13)}`);
      continue;
    }
    const dif = ((inte.wh - of) / of) * 100;
    difs.push(dif);
    console.log(
      `${u.nome.slice(0, 35).padEnd(36)} ${(of / 1000).toFixed(2).padStart(12)} ${(inte.wh / 1000).toFixed(2).padStart(13)} ` +
        `${`${dif >= 0 ? "+" : ""}${dif.toFixed(1)}%`.padStart(8)} ${String(inte.pontos).padStart(4)}`,
    );
  }

  if (difs.length > 0) {
    const medio = difs.reduce((s, v) => s + v, 0) / difs.length;
    console.log(
      `\nViés médio: ${medio >= 0 ? "+" : ""}${medio.toFixed(1)}% em ${difs.length} usinas ` +
        `(negativo = a integral subestima)`,
    );
  }
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
