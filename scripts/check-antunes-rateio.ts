import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const p = await prisma.plant.findFirst({
    where: { numeroUsina: "3095464357" },
    select: { id: true },
  });
  if (!p) throw new Error("not found");

  const rateios = await prisma.rateioVersion.findMany({
    where: { plantId: p.id },
    orderBy: { vigenteAPartirDe: "desc" },
    select: {
      id: true,
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

  console.log(`Rateios ANTUNES: ${rateios.length}`);
  for (const r of rateios) {
    console.log(
      `\n[${r.status}] vigente desde ${r.vigenteAPartirDe.toISOString().slice(0, 10)} (${r.items.length} items)`,
    );
    for (const it of r.items) {
      console.log(
        `  ${it.consumerUnit.codigoUc} ${it.consumerUnit.nome}: ${it.percentual}%`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
