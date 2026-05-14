import { prisma } from "../src/lib/prisma";

async function main() {
  const bill = await prisma.consumerBill.findFirst({
    where: {
      plantId: "c92bd286-6c47-4609-9edb-9443bc30cb77",
      consumerUnitId: null,
      anoReferencia: 2025,
      mesReferencia: 5,
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      consumoKwh: true,
      vencimento: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      pdfUrl: true,
      syncedAt: true,
      contaPaga: true,
    },
  });
  console.log(bill);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
