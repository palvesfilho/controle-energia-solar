import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const ANO = 2026;
const MES = 5;

async function main() {
  const plants = await prisma.plant.findMany({
    where: { usinaDeInvestidor: true, active: true },
    select: { id: true, name: true, unidadeConsumidora: true, numeroUsina: true },
    orderBy: { name: "asc" },
  });
  console.log(`Usinas de investidor ativas: ${plants.length}\n`);

  console.log(
    `Status fatura Mai/${ANO} (qualquer fluxo: plant-sync ou uc-sync)\n`,
  );
  console.log(
    "Usina                          | Bill maio    | Bills 2026 | Credencial      | Última sync",
  );
  console.log("-".repeat(125));

  for (const p of plants) {
    // Qualquer bill ligada à plant (independente de consumerUnitId)
    const billMaio = await prisma.consumerBill.findFirst({
      where: { plantId: p.id, anoReferencia: ANO, mesReferencia: MES },
      select: { id: true, pdfUrl: true, consumerUnitId: true, syncedAt: true },
    });

    const bills2026 = await prisma.consumerBill.count({
      where: { plantId: p.id, anoReferencia: ANO },
    });

    // Credencial pode estar na plant direto OU na ConsumerUnit que pertence à plant
    const credPlant = await prisma.cpflCredential.findFirst({
      where: { plantId: p.id, active: true },
      select: { statusSync: true, ultimaSync: true, erroSync: true },
    });
    const credUc = await prisma.cpflCredential.findFirst({
      where: { consumerUnit: { plantId: p.id }, active: true },
      select: {
        statusSync: true,
        ultimaSync: true,
        erroSync: true,
        consumerUnit: { select: { codigoUc: true } },
      },
    });

    const cred = credPlant ?? credUc;
    const credLabel = !cred
      ? "—"
      : credPlant
        ? `plant:${cred.statusSync}`
        : `uc(${credUc?.consumerUnit?.codigoUc}):${cred.statusSync}`;
    const ultimaSync = cred?.ultimaSync ? cred.ultimaSync.toISOString().slice(0, 16) : "—";

    const billLabel = !billMaio
      ? "❌ não baixada"
      : billMaio.pdfUrl
        ? "✓ ok"
        : "△ sem PDF";

    console.log(
      `${p.name.padEnd(30).slice(0, 30)} | ${billLabel.padEnd(13)}| ${String(bills2026).padEnd(11)}| ${credLabel.padEnd(16)}| ${ultimaSync}`,
    );

    if (cred?.erroSync) {
      console.log(`    erro: ${cred.erroSync.slice(0, 110)}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
