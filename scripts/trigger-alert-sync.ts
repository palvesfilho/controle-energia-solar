import "dotenv/config";
import { runAlertSync } from "../src/lib/sync-alerts";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Rodando runAlertSync()...");
  const start = Date.now();
  const result = await runAlertSync();
  const dur = Date.now() - start;
  console.log(`\nDurou ${(dur / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(result, null, 2));

  const total = await prisma.monitoringAlert.count({
    where: { status: { in: ["ABERTO", "EM_ANDAMENTO"] } },
  });
  console.log(`\nTotal de alertas em aberto agora: ${total}`);
}

main().finally(() => prisma.$disconnect());
