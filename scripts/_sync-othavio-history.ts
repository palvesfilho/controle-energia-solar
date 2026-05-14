/**
 * Sync direto do histórico Othavio — 3 meses de getDailyGeneration
 * gravando em MonitoringLog. Bypass da UI (que travaria) +
 * recálculo dos KPIs do BrasilSolarClient.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getDailyGeneration, getPlantStatus } from "../src/lib/sungrow";

const OTHAVIO_PSID = "1522536";

async function main() {
  const client = await prisma.brasilSolarClient.findFirst({
    where: { monitoramentoPlantId: OTHAVIO_PSID },
    select: { id: true, nome: true, geracaoMediaEsperada: true },
  });
  if (!client) { console.error("Othavio não achado"); process.exit(1); }
  console.log(`Sync histórico ${client.nome} (${client.id})...`);

  const now = new Date();
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  let logsUpserted = 0;
  for (const { year, month } of months) {
    const t0 = Date.now();
    const daily = await getDailyGeneration(OTHAVIO_PSID, year, month);
    console.log(`  ${year}-${String(month).padStart(2, "0")}: ${daily.length} dias em ${((Date.now() - t0)/1000).toFixed(1)}s`);
    for (const d of daily) {
      const date = new Date(year, month - 1, d.day, 12, 0, 0);
      await prisma.monitoringLog.upsert({
        where: { clientId_data: { clientId: client.id, data: date } },
        update: { geracaoDiaria: d.energyKwh, irradiacao: d.radiation },
        create: {
          clientId: client.id,
          data: date,
          geracaoDiaria: d.energyKwh,
          irradiacao: d.radiation,
          geracaoEsperada: client.geracaoMediaEsperada ? client.geracaoMediaEsperada / 30 : null,
        },
      });
      logsUpserted++;
    }
  }

  // Recalcular KPIs desnormalizados
  const status = await getPlantStatus(OTHAVIO_PSID).catch(() => null);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [monthAgg, last30] = await Promise.all([
    prisma.monitoringLog.aggregate({
      where: { clientId: client.id, data: { gte: startOfMonth } },
      _sum: { geracaoDiaria: true },
    }),
    prisma.monitoringLog.findMany({
      where: { clientId: client.id, data: { gte: thirtyDaysAgo } },
      orderBy: { data: "desc" },
      select: { geracaoDiaria: true },
    }),
  ]);
  const geracaoMes = monthAgg._sum.geracaoDiaria ?? 0;
  const pr = client.geracaoMediaEsperada && client.geracaoMediaEsperada > 0
    ? (geracaoMes / client.geracaoMediaEsperada) * 100 : null;
  const ultimaGeracao = last30.length > 0 ? last30[0].geracaoDiaria : null;
  const isOnline = status?.isOnline ?? false;
  await prisma.brasilSolarClient.update({
    where: { id: client.id },
    data: {
      geracaoMesAtual: geracaoMes,
      ultimaGeracao,
      ultimaLeitura: new Date(),
      performanceRatio: pr,
      statusMonitoramento: isOnline ? "ONLINE" : last30.length > 0 ? "ALERTA" : "SEM_DADOS",
    },
  });

  console.log(`\nTotal: ${logsUpserted} logs upserted, mês atual=${geracaoMes.toFixed(1)} kWh, PR=${pr?.toFixed(1) ?? "-"}%`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
