/**
 * Sondagem (somente leitura) da curva intradiária em Fronius e SolarEdge.
 *
 * Objetivo: descobrir, ANTES de escrever o coletor de 15 min, se existe
 * endpoint em LOTE (frota inteira numa chamada) e qual a resolução real
 * devolvida. Sem isso, 1.274 usinas Fronius × 96 rodadas/dia = 122 mil
 * chamadas/dia, o que nenhuma cota aguenta.
 *
 * Uso: npx tsx scripts/probe-intraday-fronius-solaredge.ts
 */
import { prisma } from "../src/lib/prisma";

const FRONIUS_BASE = "https://api.solarweb.com/swqapi";
const SOLAREDGE_BASE = "https://monitoringapi.solaredge.com";

function froniusHeaders(): Record<string, string> {
  return {
    AccessKeyId: process.env.FRONIUS_ACCESS_KEY_ID ?? "",
    AccessKeyValue: process.env.FRONIUS_ACCESS_KEY_VALUE ?? "",
    Accept: "application/json",
  };
}

/** Recorte de ONTEM (BRT) das 12:00 às 13:00 — dia fechado, garante dado real. */
function janelaProbe(): { fromZ: string; toZ: string; localFrom: string; localTo: string } {
  const agora = new Date();
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  const y = brt.getUTCFullYear();
  const m = String(brt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(brt.getUTCDate()).padStart(2, "0");
  return {
    // UTC 15:00-16:00 = 12:00-13:00 BRT
    fromZ: `${y}-${m}-${d}T15:00:00Z`,
    toZ: `${y}-${m}-${d}T16:00:00Z`,
    localFrom: `${y}-${m}-${d} 12:00:00`,
    localTo: `${y}-${m}-${d} 13:00:00`,
  };
}

async function probe(nome: string, url: string, headers?: Record<string, string>) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: headers ?? { Accept: "application/json" }, cache: "no-store" });
    const txt = await res.text();
    const ms = Date.now() - t0;
    console.log(`\n── ${nome}`);
    console.log(`   ${res.status} ${res.statusText} em ${ms}ms · ${txt.length} bytes`);
    const cota = ["x-ratelimit-limit", "x-ratelimit-remaining", "retry-after", "x-quota-remaining"]
      .map((h) => [h, res.headers.get(h)] as const)
      .filter(([, v]) => v != null);
    if (cota.length) console.log(`   cota: ${cota.map(([k, v]) => `${k}=${v}`).join(" ")}`);
    console.log(`   ${txt.slice(0, 1200)}`);
    return { ok: res.ok, body: txt };
  } catch (e) {
    console.log(`\n── ${nome}\n   ✗ ${e instanceof Error ? e.message : e}`);
    return { ok: false, body: "" };
  }
}

async function main() {
  const w = janelaProbe();
  console.log(`Janela de sondagem: ${w.fromZ} → ${w.toZ} (UTC) | ${w.localFrom} → ${w.localTo} (local)`);

  const fronius = await prisma.brasilSolarClient.findFirst({
    where: { active: true, plataformaMonitoramento: "FRONIUS", monitoramentoPlantId: { not: null }, proprietarioId: { not: null } },
    select: { nome: true, monitoramentoPlantId: true },
  });
  const solaredge = await prisma.brasilSolarClient.findMany({
    where: { active: true, plataformaMonitoramento: "SOLAREDGE", monitoramentoPlantId: { not: null } },
    select: { nome: true, monitoramentoPlantId: true },
    take: 3,
  });

  console.log(`\n=========== FRONIUS (${fronius?.nome ?? "nenhuma usina"}) ===========`);
  if (fronius?.monitoramentoPlantId) {
    const id = fronius.monitoramentoPlantId;
    const janela = `from=${encodeURIComponent(w.fromZ)}&to=${encodeURIComponent(w.toZ)}&timezone=zulu`;

    // 1. Sem `channel`: descobre quais canais a API entrega por usina.
    await probe("GET /pvsystems/{id}/histdata (sem channel — descobre os canais)",
      `${FRONIUS_BASE}/pvsystems/${id}/histdata?${janela}&limit=3`, froniusHeaders());

    // 2. Frota inteira numa chamada — é isto que viabiliza 1.274 usinas.
    await probe("GET /pvsystems/histdata (frota inteira)",
      `${FRONIUS_BASE}/pvsystems/histdata?${janela}&limit=3`, froniusHeaders());

    // 3. Variante de rota da frota citada na SWQAPI.
    await probe("GET /histdata (frota, rota alternativa)",
      `${FRONIUS_BASE}/histdata?${janela}&limit=3`, froniusHeaders());

    // 4. Nível de dispositivo (o inversor, não a usina).
    await probe("GET /pvsystems/{id}/devices (lista de dispositivos)",
      `${FRONIUS_BASE}/pvsystems/${id}/devices`, froniusHeaders());
  }

  console.log(`\n=========== SOLAREDGE (${solaredge.length} usinas na amostra) ===========`);
  if (solaredge.length > 0) {
    const key = process.env.SOLAREDGE_API_KEY ?? "";
    const um = solaredge[0].monitoramentoPlantId!;
    const janelaLocal = `startTime=${encodeURIComponent(w.localFrom)}&endTime=${encodeURIComponent(w.localTo)}`;

    // 1. powerDetails de um site, em dia fechado — confirma que vem valor.
    await probe(`GET /site/${um}/powerDetails (um site, ontem)`,
      `${SOLAREDGE_BASE}/site/${um}/powerDetails?api_key=${key}&${janelaLocal}&meters=PRODUCTION`);

    // 2. /power — mesma resolução, payload menor (sem o wrapper de meters).
    await probe(`GET /site/${um}/power (um site, ontem)`,
      `${SOLAREDGE_BASE}/site/${um}/power?api_key=${key}&${janelaLocal}`);

    // 3. Bulk por /power (o /powerDetails em lote deu 403).
    const ids = solaredge.map((s) => s.monitoramentoPlantId).join(",");
    await probe(`GET /sites/${ids}/power (bulk ${solaredge.length} sites)`,
      `${SOLAREDGE_BASE}/sites/${ids}/power?api_key=${key}&${janelaLocal}`);

    // 4. A chave é de conta ou de site? Define se o bulk é possível.
    await probe("GET /sites/list (a chave enxerga a conta inteira?)",
      `${SOLAREDGE_BASE}/sites/list?api_key=${key}&size=1`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
