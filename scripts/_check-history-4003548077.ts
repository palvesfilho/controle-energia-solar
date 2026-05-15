import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const uc = await prisma.consumerUnit.findUnique({
    where: { codigoUc: "4003548077" },
    select: {
      id: true,
      bills: {
        orderBy: { syncedAt: "desc" },
        take: 5,
        select: {
          mesReferencia: true,
          anoReferencia: true,
          vencimento: true,
          valorTotal: true,
          fonteConsulta: true,
          syncedAt: true,
          contaPaga: true,
        },
      },
    },
  });
  console.log("Últimas faturas 4003548077:");
  for (const b of uc?.bills ?? []) {
    console.log(" -", b);
  }
  const other = await prisma.cpflCredential.findMany({
    take: 3,
    where: {
      instalacao: { not: "4003548077" },
      consumerUnit: { distribuidora: "RGE", active: true },
    },
    select: { instalacao: true, consumerUnit: { select: { nome: true, codigoUc: true } } },
  });
  console.log("\nOutras UCs RGE com credencial:", other);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
