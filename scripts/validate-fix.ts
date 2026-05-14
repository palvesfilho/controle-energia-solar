import { PrismaClient } from "@prisma/client";
import { parseBillData } from "../src/lib/infosimples";

const prisma = new PrismaClient();

async function main() {
  const uc = await prisma.consumerUnit.findUnique({
    where: { codigoUc: "3090579398" },
  });
  if (!uc) {
    console.log("UC não encontrada");
    return;
  }
  const bill = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: uc.id, anoReferencia: 2026, mesReferencia: 4 },
  });
  if (!bill?.rawJson) {
    console.log("Bill sem rawJson");
    return;
  }
  const raw = JSON.parse(bill.rawJson);
  const parsed = parseBillData(raw);
  console.log("---ANTES (DB)---");
  console.log("  energiaCompensada:", bill.energiaCompensada);
  console.log("  injetadaOucTeKwh:", bill.injetadaOucTeKwh);
  console.log("  injetadaOucTusdKwh:", bill.injetadaOucTusdKwh);
  console.log("---DEPOIS (re-parser)---");
  console.log("  energiaCompensada:", parsed.energiaCompensada);
  console.log("  injetadaOucTeKwh:", parsed.injetadaOucTeKwh);
  console.log("  injetadaOucTusdKwh:", parsed.injetadaOucTusdKwh);
  console.log("  injetadaDetalhes:", parsed.injetadaDetalhes);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
