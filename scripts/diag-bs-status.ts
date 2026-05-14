import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const all = await prisma.brasilSolarClient.findMany({
    where: { active: true },
    select: {
      id: true,
      nome: true,
      statusMonitoramento: true,
      ultimaLeitura: true,
      latitude: true,
      longitude: true,
    },
  });

  const dist: Record<string, number> = {};
  for (const c of all) {
    const k = c.statusMonitoramento ?? "(null)";
    dist[k] = (dist[k] ?? 0) + 1;
  }

  console.log(`Total clientes ativos: ${all.length}`);
  console.log(`Distribuição de statusMonitoramento:`, dist);

  const semLeitura = all.filter((c) => !c.ultimaLeitura);
  console.log(`Sem ultimaLeitura: ${semLeitura.length}`);

  const semGeoloc = all.filter((c) => c.latitude == null || c.longitude == null);
  console.log(`Sem geolocalização (não aparecem no mapa): ${semGeoloc.length}`);

  const agora = Date.now();
  const stale24h = all.filter((c) => {
    if (!c.ultimaLeitura) return false;
    return agora - new Date(c.ultimaLeitura).getTime() > 24 * 60 * 60 * 1000;
  });
  console.log(`Com leitura mas há +24h sem novas: ${stale24h.length}`);

  console.log(`\nAmostra (primeiras 5):`);
  for (const c of all.slice(0, 5)) {
    console.log(`  ${c.nome}: status=${c.statusMonitoramento ?? "(null)"} ultLeitura=${c.ultimaLeitura?.toISOString() ?? "(null)"}`);
  }
}

main().finally(() => prisma.$disconnect());
