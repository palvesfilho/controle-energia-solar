import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const total = await prisma.monitoringAlert.count();
  const abertos = await prisma.monitoringAlert.count({
    where: { status: { in: ["ABERTO", "EM_ANDAMENTO"] } },
  });
  console.log(`MonitoringAlert total: ${total}`);
  console.log(`MonitoringAlert em aberto (ABERTO + EM_ANDAMENTO): ${abertos}`);
  if (total > 0) {
    const dist = await prisma.monitoringAlert.groupBy({
      by: ["status"],
      _count: true,
    });
    console.log("Distribuição por status:", dist);
    const sample = await prisma.monitoringAlert.findMany({
      take: 3,
      orderBy: { createdAt: "desc" },
      select: { tipo: true, severidade: true, status: true, createdAt: true },
    });
    console.log("Amostra:", sample);
  }
}

main().finally(() => prisma.$disconnect());
