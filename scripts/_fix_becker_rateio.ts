import { prisma } from "../src/lib/prisma";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b";

async function main() {
  const rateio = await prisma.rateioVersion.findFirst({
    where: { plantId: PLANT_ID, status: "VIGENTE" },
    include: { items: { include: { consumerUnit: true } } },
  });
  if (!rateio) {
    console.log("Sem rateio VIGENTE");
    return;
  }
  for (const item of rateio.items) {
    const uc = item.consumerUnit.codigoUc;
    let novoPct: number | null = null;
    if (uc === "4002293699") novoPct = 55; // NAPO
    if (uc === "3095322370") novoPct = 15; // GUARITA
    if (novoPct == null) continue;
    if (item.percentual === novoPct) {
      console.log(`${uc} já está em ${novoPct}%, sem mudança`);
      continue;
    }
    await prisma.rateioItem.update({
      where: { id: item.id },
      data: { percentual: novoPct },
    });
    console.log(`${uc} ${item.consumerUnit.nome}: ${item.percentual}% → ${novoPct}%`);
  }
  // Verifica soma
  const post = await prisma.rateioItem.findMany({
    where: { versionId: rateio.id },
    include: { consumerUnit: { select: { codigoUc: true } } },
  });
  const total = post.reduce((s, i) => s + i.percentual, 0);
  console.log(`\nSoma final: ${total}%`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
