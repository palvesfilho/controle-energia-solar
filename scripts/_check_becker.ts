import { prisma } from "../src/lib/prisma";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b"; // BECKER E BRUM

async function main() {
  const plant = await prisma.plant.findUnique({
    where: { id: PLANT_ID },
    select: {
      id: true,
      name: true,
      numeroUsina: true,
      statusContrato: true,
      createdAt: true,
    },
  });
  console.log("PLANT:", plant);

  const rateios = await prisma.rateioVersion.findMany({
    where: { plantId: PLANT_ID },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      status: true,
      vigenteAPartirDe: true,
      criadoEm: true,
      enviadoEm: true,
      aceitoEm: true,
      rejeitadoEm: true,
      substituidoEm: true,
      observacao: true,
    },
  });
  console.log("RATEIOS:", JSON.stringify(rateios, null, 2));

  const billsUsina = await prisma.consumerBill.findMany({
    where: { plantId: PLANT_ID, consumerUnitId: null },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: {
      anoReferencia: true,
      mesReferencia: true,
      energiaInjetadaMedidorKwh: true,
      saldoInstalacaoKwh: true,
      saldoExpirarProxMesKwh: true,
      valorTotal: true,
      contaPaga: true,
      fonteConsulta: true,
    },
  });
  console.log("BILLS DA USINA (UC geradora):", JSON.stringify(billsUsina, null, 2));

  const ucs = await prisma.consumerUnit.findMany({
    where: { plantId: PLANT_ID },
    select: { id: true, codigoUc: true, nome: true },
  });

  for (const uc of ucs) {
    const bills = await prisma.consumerBill.findMany({
      where: { consumerUnitId: uc.id },
      orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
      select: {
        anoReferencia: true,
        mesReferencia: true,
        consumoKwh: true,
        energiaCompensada: true,
        valorTotal: true,
        contaPaga: true,
        vencimento: true,
      },
    });
    console.log(`UC ${uc.codigoUc} - ${uc.nome}:`, JSON.stringify(bills, null, 2));
  }

  const payables = await prisma.investorPayable.findMany({
    where: { plantId: PLANT_ID },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: {
      anoReferencia: true,
      mesReferencia: true,
      status: true,
      kwhCompensadoBase: true,
      valorBruto: true,
      valorLiquido: true,
      consumerUnit: { select: { codigoUc: true } },
    },
  });
  console.log("INVESTOR PAYABLES:", JSON.stringify(payables, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
