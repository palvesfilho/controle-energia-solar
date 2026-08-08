/**
 * Sondagem #3 (somente leitura): o `getDevicePointMinuteDataList` da Sungrow
 * aceita VÁRIOS `ps_key` na mesma chamada?
 *
 * Hoje o coletor passa `ps_key_list: [psKey]` — um inversor por chamada. Se a
 * API aceitar N chaves, as 195 usinas Sungrow saem em punhado de chamadas por
 * rodada em vez de ~200, e o cron de 15 min fica trivial.
 *
 * Uso: npx tsx scripts/probe-intraday-lote-sungrow.ts
 */
import { prisma } from "../src/lib/prisma";
import { sungrowFetch, getDeviceList } from "../src/lib/sungrow";

const INVERTER_DEVICE_TYPES = new Set([1, 55]);

/** Janela UTC de ontem 15:00–15:30 (12h–12h30 BRT) — dia fechado, tem dado. */
function janela(): { from: string; to: string } {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const dia = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
  return { from: `${dia}150000`, to: `${dia}153000` };
}

async function main() {
  const usinas = await prisma.brasilSolarClient.findMany({
    where: { active: true, plataformaMonitoramento: "SUNGROW", monitoramentoPlantId: { not: null } },
    select: { nome: true, monitoramentoPlantId: true },
    take: 12,
  });
  console.log(`Descobrindo inversores de ${usinas.length} usinas Sungrow…`);

  const chaves: Array<{ psKey: string; deviceType: number }> = [];
  for (const u of usinas) {
    try {
      const devs = await getDeviceList(u.monitoramentoPlantId!);
      for (const d of devs) {
        const raw = d as unknown as { ps_key?: string; device_type?: number };
        const psKey = String(raw.ps_key ?? "");
        const deviceType = Number(raw.device_type ?? d.dev_type);
        if (psKey && INVERTER_DEVICE_TYPES.has(deviceType)) chaves.push({ psKey, deviceType });
      }
    } catch (e) {
      console.log(`  ✗ ${u.nome}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`→ ${chaves.length} inversores encontrados`);

  // Só faz sentido comparar chaves do mesmo tipo (os `points` mudam por tipo).
  const string1 = chaves.filter((c) => c.deviceType === 1).map((c) => c.psKey);
  console.log(`→ ${string1.length} são inversor string (device_type=1)`);
  if (string1.length < 2) {
    console.log("Amostra insuficiente pra testar lote.");
    return;
  }

  const { from, to } = janela();
  const points = "p1,p2,p14,p24";

  for (const n of [1, 5, 10, Math.min(30, string1.length)]) {
    if (n > string1.length) continue;
    const lote = string1.slice(0, n);
    const t0 = Date.now();
    try {
      const r = await sungrowFetch<{ result_data?: Record<string, unknown[]> }>(
        "/openapi/getDevicePointMinuteDataList",
        { ps_key_list: lote, points, start_time_stamp: from, end_time_stamp: to },
      );
      const devolvidos = Object.keys(r.result_data ?? {});
      const comDado = devolvidos.filter((k) => (r.result_data?.[k]?.length ?? 0) > 0);
      console.log(
        `\n── lote de ${n} ps_key: ${Date.now() - t0}ms · chaves na resposta=${devolvidos.length} · com amostras=${comDado.length}`,
      );
      if (devolvidos.length < n) {
        console.log(`   ⚠ a API devolveu MENOS chaves do que pedimos — teto de lote entre ${devolvidos.length} e ${n}`);
      }
    } catch (e) {
      console.log(`\n── lote de ${n} ps_key: ✗ ${e instanceof Error ? e.message : e}`);
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
