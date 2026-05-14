import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  // 1) ConsumerUnit com codigoUc=4004039966 (pode existir como UC cadastrada)
  const ucDireta = await prisma.consumerUnit.findUnique({
    where: { codigoUc: "4004039966" },
    include: {
      plant: { select: { id: true, name: true } },
      consumer: { select: { id: true, name: true } },
      cpflCredential: true,
    },
  });
  console.log(`\n═══ ConsumerUnit codigoUc=4004039966 ═══`);
  console.log(ucDireta);

  // 2) Plant com unidadeConsumidora=4004039966 ou codigoCliente=4004039966
  const plantAlvo = await prisma.plant.findFirst({
    where: {
      OR: [
        { unidadeConsumidora: "4004039966" },
        { codigoCliente: "4004039966" },
        { numeroUsina: "4004039966" },
      ],
    },
    select: {
      id: true,
      name: true,
      unidadeConsumidora: true,
      codigoCliente: true,
      numeroUsina: true,
    },
  });
  console.log(`\n═══ Plant por identificador 4004039966 ═══`);
  console.log(plantAlvo);

  // 3) Todas as bills com instalacao=4004039966 (independente de plantId/consumerUnitId)
  const billsInst = await prisma.consumerBill.findMany({
    where: { instalacao: "4004039966" },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      instalacao: true,
      consumerUnitId: true,
      plantId: true,
      valorTotal: true,
      fonteConsulta: true,
      pdfUrl: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      plant: { select: { name: true } },
    },
    take: 30,
  });
  console.log(`\n═══ Bills instalacao=4004039966 (${billsInst.length}) ═══`);
  billsInst.forEach((b) => {
    const ref = `${b.anoReferencia}/${String(b.mesReferencia).padStart(2, "0")}`;
    console.log(
      `  ${ref} • inst=${b.instalacao} • UC=${b.consumerUnit?.codigoUc ?? "—"}/${b.consumerUnit?.nome ?? "—"} • plant=${b.plant?.name ?? "—"} • fonte=${b.fonteConsulta}`,
    );
  });

  // 4) Panorama geral: quantas bills têm plantId setado
  const totalComPlant = await prisma.consumerBill.count({
    where: { plantId: { not: null } },
  });
  const totalBills = await prisma.consumerBill.count();
  console.log(`\n═══ Bills totais ═══`);
  console.log(`  Total: ${totalBills}`);
  console.log(`  Com plantId: ${totalComPlant}`);

  // 5) Mostrar quantas bills cada Plant tem associadas (por plantId)
  const billsPorPlant = await prisma.consumerBill.groupBy({
    by: ["plantId"],
    where: { plantId: { not: null } },
    _count: { _all: true },
  });
  console.log(`\n═══ Bills agrupadas por Plant (${billsPorPlant.length} usinas) ═══`);
  for (const g of billsPorPlant) {
    if (!g.plantId) continue;
    const p = await prisma.plant.findUnique({
      where: { id: g.plantId },
      select: { name: true, unidadeConsumidora: true },
    });
    console.log(`  ${p?.name ?? "—"} (UC=${p?.unidadeConsumidora ?? "—"}) • bills=${g._count._all}`);
  }

  // 6) Ver uma amostra de bills: quais consumerUnits estão gerando bills e qual plantId levam
  const amostra = await prisma.consumerBill.findMany({
    where: { plantId: { not: null } },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    take: 10,
    select: {
      anoReferencia: true,
      mesReferencia: true,
      instalacao: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      plant: { select: { name: true, unidadeConsumidora: true } },
    },
  });
  console.log(`\n═══ Amostra de bills com plantId ═══`);
  amostra.forEach((b) => {
    const ref = `${b.anoReferencia}/${String(b.mesReferencia).padStart(2, "0")}`;
    console.log(
      `  ${ref} • inst=${b.instalacao} • UC=${b.consumerUnit?.codigoUc ?? "—"} (${b.consumerUnit?.nome ?? "—"}) → PLANT=${b.plant?.name ?? "—"} (UC-usina=${b.plant?.unidadeConsumidora ?? "—"})`,
    );
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
