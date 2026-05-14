import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const p = await prisma.plant.findFirst({
    where: { numeroUsina: "3095464357" },
    select: { id: true, name: true, regraInstalacao: true },
  });
  console.log(`ANTUNES regraInstalacao: ${p?.regraInstalacao ?? "(não definida)"}`);

  const rateios = await prisma.rateioVersion.findMany({
    where: { plantId: p?.id, status: { in: ["VIGENTE", "SUBSTITUIDO"] } },
    orderBy: { vigenteAPartirDe: "desc" },
    select: {
      status: true,
      vigenteAPartirDe: true,
      items: {
        select: {
          percentual: true,
          consumerUnit: { select: { codigoUc: true, nome: true } },
        },
      },
    },
  });
  for (const r of rateios) {
    console.log(
      `\n[${r.status}] vigente desde ${r.vigenteAPartirDe.toISOString().slice(0, 10)}`,
    );
    for (const it of r.items) {
      console.log(
        `  ${it.consumerUnit.codigoUc} ${it.consumerUnit.nome}: ${it.percentual}%`,
      );
    }
  }

  // Procura se PRODUZA tem fatura e payable
  const uc = await prisma.consumerUnit.findFirst({
    where: { codigoUc: "3095464357" },
    select: { id: true, nome: true },
  });
  console.log(`\nUC PRODUZA (id=${uc?.id}):`);
  if (uc) {
    const bills = await prisma.consumerBill.findMany({
      where: { consumerUnitId: uc.id, energiaCompensada: { gt: 0 } },
      select: { anoReferencia: true, mesReferencia: true, energiaCompensada: true },
      orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    });
    console.log(`  faturas com compensada > 0: ${bills.length}`);
    for (const b of bills.slice(0, 5))
      console.log(`    ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}: ${b.energiaCompensada} kWh`);
    if (bills.length > 5) console.log(`    ... + ${bills.length - 5}`);

    const pay = await prisma.investorPayable.count({
      where: { consumerUnitId: uc.id },
    });
    console.log(`  InvestorPayables existentes: ${pay}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
