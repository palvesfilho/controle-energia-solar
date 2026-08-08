/**
 * Sondagem #2 (somente leitura): existe endpoint de FROTA no Fronius, e qual a
 * vazão real da API quando disparamos muitas chamadas?
 *
 * O coletor de 15 min precisa varrer 1.274 usinas Fronius por rodada. Sem
 * endpoint de frota, isso vira 1.274 chamadas — dá pra fazer, desde que a
 * vazão medida aqui feche dentro da janela e a API não devolva 429.
 *
 * Uso: npx tsx scripts/probe-intraday-frota.ts
 */
import { prisma } from "../src/lib/prisma";

const FRONIUS_BASE = "https://api.solarweb.com/swqapi";

function froniusHeaders(): Record<string, string> {
  return {
    AccessKeyId: process.env.FRONIUS_ACCESS_KEY_ID ?? "",
    AccessKeyValue: process.env.FRONIUS_ACCESS_KEY_VALUE ?? "",
    Accept: "application/json",
  };
}

async function probe(nome: string, url: string) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: froniusHeaders(), cache: "no-store" });
    const txt = await res.text();
    console.log(`\n── ${nome}\n   ${res.status} ${res.statusText} em ${Date.now() - t0}ms · ${txt.length} bytes`);
    console.log(`   ${txt.slice(0, 600)}`);
    return res.status;
  } catch (e) {
    console.log(`\n── ${nome}\n   ✗ ${e instanceof Error ? e.message : e}`);
    return 0;
  }
}

async function main() {
  console.log("=========== FRONIUS — existe rota de frota? ===========");
  // flowdata = potência instantânea. Se existir em frota, resolve as 1.274
  // usinas numa chamada só — é tudo que um amostrador de 15 min precisa.
  await probe("GET /pvsystems/flowdata (frota)", `${FRONIUS_BASE}/pvsystems/flowdata?limit=3`);
  await probe("GET /pvsystems/aggdata (frota)", `${FRONIUS_BASE}/pvsystems/aggdata?limit=3`);
  await probe("GET /pvsystems/messages (frota — rota de frota que sabemos existir)",
    `${FRONIUS_BASE}/pvsystems/messages?limit=1`);

  // Vazão real: 30 usinas em paralelo, medindo tempo e status.
  const ids = (
    await prisma.brasilSolarClient.findMany({
      where: { active: true, plataformaMonitoramento: "FRONIUS", monitoramentoPlantId: { not: null } },
      select: { monitoramentoPlantId: true },
      take: 30,
    })
  ).map((c) => c.monitoramentoPlantId!);

  for (const concorrencia of [5, 15]) {
    console.log(`\n=========== VAZÃO FRONIUS — ${ids.length} usinas, concorrência ${concorrencia} ===========`);
    const status = new Map<number, number>();
    const t0 = Date.now();
    for (let i = 0; i < ids.length; i += concorrencia) {
      const lote = ids.slice(i, i + concorrencia);
      await Promise.all(
        lote.map(async (id) => {
          try {
            const res = await fetch(`${FRONIUS_BASE}/pvsystems/${id}/flowdata`, {
              headers: froniusHeaders(),
              cache: "no-store",
            });
            status.set(res.status, (status.get(res.status) ?? 0) + 1);
          } catch {
            status.set(0, (status.get(0) ?? 0) + 1);
          }
        }),
      );
    }
    const ms = Date.now() - t0;
    const porUsina = ms / ids.length;
    console.log(`   ${ms}ms total · ${porUsina.toFixed(0)}ms/usina · status: ${[...status].map(([s, n]) => `${s}×${n}`).join(" ")}`);
    console.log(`   → projeção 1.274 usinas: ${((porUsina * 1274) / 1000).toFixed(0)}s por rodada (janela = 900s)`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
