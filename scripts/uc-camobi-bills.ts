import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const uc = await prisma.consumerUnit.findFirst({
    where: { codigoUc: "3091036353" },
    select: { id: true, nome: true, codigoUc: true },
  });
  if (!uc) {
    console.log("UC não encontrada");
    return;
  }
  console.log(`UC: ${uc.codigoUc} | ${uc.nome} | id=${uc.id}\n`);

  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc.id },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: {
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
      energiaCompensada: true,
      pdfUrl: true,
      syncedAt: true,
    },
  });

  console.log(`Faturas registradas (${bills.length}):`);
  for (const b of bills) {
    console.log(
      `   ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} | valor=R$${b.valorTotal?.toFixed(2) ?? "—"} | comp=${b.energiaCompensada ?? "—"}kWh | sync=${b.syncedAt?.toISOString().slice(0, 16) ?? "—"} | pdf=${b.pdfUrl ? "✓" : "—"}`,
    );
  }

  // Faturas órfãs com a mesma instalação (caso parser não tenha vinculado a UC)
  const orfas = await prisma.consumerBill.findMany({
    where: { consumerUnitId: null, instalacao: "3091036353" },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: { anoReferencia: true, mesReferencia: true, valorTotal: true },
  });
  console.log(`\nFaturas órfãs com instalação 3091036353 (${orfas.length}):`);
  for (const o of orfas) {
    console.log(
      `   ${o.anoReferencia}-${String(o.mesReferencia).padStart(2, "0")} | valor=R$${o.valorTotal?.toFixed(2) ?? "—"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
