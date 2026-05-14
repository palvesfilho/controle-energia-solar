/**
 * Sync em massa: busca geração diária dos últimos 3 meses para todos os clientes Fronius.
 * Usa rate limiting para não sobrecarregar a API Fronius.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FRONIUS_BASE_URL = "https://api.solarweb.com/swqapi";
const MAX_CONCURRENT = 5;
const BATCH_DELAY_MS = 300;

function getHeaders(): Record<string, string> {
  return {
    AccessKeyId: process.env.FRONIUS_ACCESS_KEY_ID!,
    AccessKeyValue: process.env.FRONIUS_ACCESS_KEY_VALUE!,
    Accept: "application/json",
  };
}

interface DailyGen {
  day: number;
  energyKwh: number;
}

async function getDailyGeneration(pvSystemId: string, year: number, month: number): Promise<DailyGen[]> {
  const url = `${FRONIUS_BASE_URL}/pvsystems/${pvSystemId}/aggdata/years/${year}/months/${month}/days`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) return [];

  const data = await res.json();
  const ch = data?.data?.channels?.find(
    (c: { channelName: string }) => c.channelName === "EnergyOutput" || c.channelName === "EnergyProductionTotal"
  );
  if (!ch) return [];

  return Object.entries(ch.values).map(([day, wh]) => ({
    day: parseInt(day),
    energyKwh: (wh as number) / 1000,
  }));
}

async function main() {
  const now = new Date();
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  console.log("Sync de geracao em massa - Fronius -> MonitoringLog");
  console.log(`Periodos: ${months.map((m) => `${m.month}/${m.year}`).join(", ")}\n`);

  const clients = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      plataformaMonitoramento: "FRONIUS",
      monitoramentoPlantId: { not: null },
    },
    select: { id: true, monitoramentoPlantId: true, geracaoMediaEsperada: true, nome: true },
  });

  console.log(`Clientes Fronius: ${clients.length}\n`);

  let totalLogs = 0;
  let clientsProcessed = 0;
  let clientErrors = 0;

  // Processar em lotes
  for (let i = 0; i < clients.length; i += MAX_CONCURRENT) {
    const batch = clients.slice(i, i + MAX_CONCURRENT);

    const promises = batch.map(async (client) => {
      const pvId = client.monitoramentoPlantId!;
      let clientLogs = 0;

      for (const { year, month } of months) {
        try {
          const dailyData = await getDailyGeneration(pvId, year, month);

          for (const day of dailyData) {
            const date = new Date(year, month - 1, day.day, 12, 0, 0);
            await prisma.monitoringLog.upsert({
              where: { clientId_data: { clientId: client.id, data: date } },
              update: { geracaoDiaria: day.energyKwh },
              create: {
                clientId: client.id,
                data: date,
                geracaoDiaria: day.energyKwh,
                geracaoEsperada: client.geracaoMediaEsperada ? client.geracaoMediaEsperada / 30 : null,
              },
            });
            clientLogs++;
          }

          // Atualizar KPIs se é o mês atual
          if (year === now.getFullYear() && month === now.getMonth() + 1) {
            const totalMes = dailyData.reduce((s, d) => s + d.energyKwh, 0);
            const ultimoDia = dailyData.length > 0 ? dailyData[dailyData.length - 1] : null;
            const pr = client.geracaoMediaEsperada && client.geracaoMediaEsperada > 0
              ? (totalMes / client.geracaoMediaEsperada) * 100
              : null;

            await prisma.brasilSolarClient.update({
              where: { id: client.id },
              data: {
                geracaoMesAtual: totalMes,
                ultimaGeracao: ultimoDia?.energyKwh ?? undefined,
                ultimaLeitura: new Date(),
                performanceRatio: pr,
                statusMonitoramento: dailyData.length > 0 ? "ONLINE" : undefined,
              },
            });
          }
        } catch {
          // Planta pode não ter dados para esse mês
        }
      }

      totalLogs += clientLogs;
      clientsProcessed++;
      return clientLogs;
    });

    try {
      await Promise.all(promises);
    } catch {
      clientErrors++;
    }

    // Progresso
    const pct = Math.round(((i + batch.length) / clients.length) * 100);
    process.stdout.write(`\r  Progresso: ${i + batch.length}/${clients.length} (${pct}%) - ${totalLogs} logs    `);

    // Rate limiting
    if (i + MAX_CONCURRENT < clients.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`\n\nResultado:`);
  console.log(`  Clientes processados: ${clientsProcessed}`);
  console.log(`  Logs criados/atualizados: ${totalLogs}`);
  console.log(`  Erros: ${clientErrors}`);

  const totalLogs2 = await prisma.monitoringLog.count();
  console.log(`  Total logs no banco: ${totalLogs2}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
