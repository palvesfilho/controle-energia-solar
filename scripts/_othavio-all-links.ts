import { prisma } from "../src/lib/prisma";

async function main() {
  const othavio = await prisma.brasilSolarClient.findFirst({
    where: { monitoramentoPlantId: "1522536" },
    include: {
      proprietario: true,
      plant: { include: { consumerUnits: true, rateioVersions: { orderBy: { vigenteAPartirDe: "desc" }, take: 3 }, reports: { orderBy: [{ ano: "desc" }, { mes: "desc" }], take: 3 } } },
      monitoringLogs: { take: 1 },
    },
  });

  console.log("=== BrasilSolarClient OTHAVIO ===");
  if (othavio) {
    const summary = {
      id: othavio.id,
      nome: othavio.nome,
      cpfCnpj: othavio.cpfCnpj,
      consumerId: othavio.consumerId,
      plantId: othavio.plantId,
      proprietarioId: othavio.proprietarioId,
      proprietario: othavio.proprietario ? { id: othavio.proprietario.id, nome: othavio.proprietario.nome } : null,
      plant: othavio.plant ? { id: othavio.plant.id, name: othavio.plant.name, ucs: othavio.plant.consumerUnits.length } : null,
      plataformaMonitoramento: othavio.plataformaMonitoramento,
      monitoramentoPlantId: othavio.monitoramentoPlantId,
      codigoUc: othavio.codigoUc,
      logsCount: othavio.monitoringLogs.length,
    };
    console.log(JSON.stringify(summary, null, 2));
  }

  // Procurar Plant que mencione Othavio em qualquer campo
  console.log("\n=== Plants com 'OTHAVIO' ou 'CECCIM' no nome ===");
  const plants = await prisma.plant.findMany({
    where: {
      OR: [
        { name: { contains: "OTHAVIO" } },
        { name: { contains: "CECCIM" } },
        { name: { contains: "Othavio" } },
        { name: { contains: "Ceccim" } },
      ],
    },
    include: { consumerUnits: true, monitoringClients: true, rateioVersions: true, reports: { take: 3 } },
  });
  for (const p of plants) {
    console.log(`  ${p.id} ${p.name} UCs=${p.consumerUnits.length} BSCs=${p.monitoringClients.length} rateios=${p.rateioVersions.length} reports=${p.reports.length}`);
  }

  // ConsumerUnit do Othavio
  console.log("\n=== ConsumerUnits ligadas ao Othavio ===");
  const ucs = await prisma.consumerUnit.findMany({
    where: {
      OR: [
        ...(othavio?.cpfCnpj ? [{ cpfCnpj: othavio.cpfCnpj }] : []),
        ...(othavio?.codigoUc ? [{ codigoUc: othavio.codigoUc }] : []),
      ],
    },
    select: { id: true, codigoUc: true, cpfCnpj: true, plantId: true, plant: { select: { name: true } } },
  });
  for (const u of ucs) {
    console.log(`  UC ${u.codigoUc} (cpf=${u.cpfCnpj}) plantId=${u.plantId ?? "NULL"} plant=${u.plant?.name ?? "-"}`);
  }

  // Proprietário com nome Othavio
  console.log("\n=== BrasilSolarProprietario com 'OTHAVIO' ===");
  const props = await prisma.brasilSolarProprietario.findMany({
    where: {
      OR: [{ nome: { contains: "OTHAVIO" } }, { nome: { contains: "Othavio" } }, { nome: { contains: "CECCIM" } }, { nome: { contains: "Ceccim" } }],
    },
    select: { id: true, nome: true, cpfCnpj: true, _count: { select: { clients: true } } },
  });
  for (const p of props) {
    console.log(`  ${p.id} ${p.nome} (cpf=${p.cpfCnpj}) clients=${p._count.clients}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
