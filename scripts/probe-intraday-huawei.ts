/**
 * Sondagem #4 (somente leitura): a Huawei FusionSolar entrega curva de 5 min
 * em lote (`getDevFiveMinutes`)?
 *
 * São 105 usinas Huawei. Se o endpoint aceitar até 100 devIds por chamada, a
 * plataforma inteira sai em 2 chamadas por rodada de 15 min.
 *
 * Uso: npx tsx scripts/probe-intraday-huawei.ts
 */
import { prisma } from "../src/lib/prisma";
import { getDeviceList } from "../src/lib/huawei";

const HUAWEI_BASE = process.env.HUAWEI_BASE_URL ?? "https://la5.fusionsolar.huawei.com";

async function huaweiLogin(): Promise<string> {
  const res = await fetch(`${HUAWEI_BASE}/thirdData/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName: process.env.HUAWEI_USERNAME,
      systemCode: process.env.HUAWEI_PASSWORD,
    }),
    cache: "no-store",
  });
  const token = res.headers.get("xsrf-token");
  if (!token) throw new Error(`login sem token (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  return token;
}

async function probe(nome: string, token: string, path: string, body: Record<string, unknown>) {
  const t0 = Date.now();
  const res = await fetch(`${HUAWEI_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "XSRF-TOKEN": token },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const txt = await res.text();
  console.log(`\n── ${nome}\n   ${res.status} em ${Date.now() - t0}ms · ${txt.length} bytes`);
  console.log(`   ${txt.slice(0, 700)}`);
}

async function main() {
  const usinas = await prisma.brasilSolarClient.findMany({
    where: { active: true, plataformaMonitoramento: "HUAWEI", monitoramentoPlantId: { not: null } },
    select: { nome: true, monitoramentoPlantId: true },
    take: 3,
  });
  console.log(`${usinas.length} usinas Huawei na amostra`);
  if (usinas.length === 0) return;

  // Ordem importa: a Huawei mantém UMA sessão por usuário. Se logarmos aqui e
  // depois chamarmos a lib (que loga de novo), o token daqui morre com
  // USER_MUST_RELOGIN. Então a lib primeiro, o nosso login por último.
  const devIds: number[] = [];
  for (const u of usinas) {
    try {
      const devs = await getDeviceList(u.monitoramentoPlantId!);
      for (const d of devs) {
        const raw = d as unknown as { id?: number; devTypeId?: number };
        if (raw.id != null && (raw.devTypeId === 1 || raw.devTypeId === 38)) devIds.push(raw.id);
      }
    } catch (e) {
      console.log(`  ✗ ${u.nome}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`→ ${devIds.length} inversores: ${devIds.slice(0, 5).join(",")}`);
  if (devIds.length === 0) return;

  const token = await huaweiLogin();
  console.log("login ok");

  // collectTime = ontem meio-dia BRT em ms (a API devolve o dia inteiro em 5 min)
  const ontemMeioDia = Date.now() - 24 * 60 * 60 * 1000;

  await probe("POST /thirdData/getDevFiveMinutes (lote de inversores)", token, "/thirdData/getDevFiveMinutes", {
    devIds: devIds.join(","),
    devTypeId: 1,
    collectTime: ontemMeioDia,
  });

  await probe("POST /thirdData/getStationRealKpi (snapshot em lote)", token, "/thirdData/getStationRealKpi", {
    stationCodes: usinas.map((u) => u.monitoramentoPlantId).join(","),
  });
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
