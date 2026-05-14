import { prisma } from "../src/lib/prisma";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b"; // BECKER E BRUM

async function main() {
  // Plant.dataAssinaturaContrato = 01/02/2025
  await prisma.plant.update({
    where: { id: PLANT_ID },
    data: { dataAssinaturaContrato: new Date("2025-02-01T03:00:00.000Z") },
  });
  console.log("OK: Plant.dataAssinaturaContrato = 2025-02-01");

  // RateioVersion: aceitoEm = 24/03/2025, vigenteAPartirDe = 24/03/2025
  const r = await prisma.rateioVersion.findFirst({
    where: { plantId: PLANT_ID, status: "VIGENTE" },
  });
  if (r) {
    await prisma.rateioVersion.update({
      where: { id: r.id },
      data: {
        aceitoEm: new Date("2025-03-24T03:00:00.000Z"),
        vigenteAPartirDe: new Date("2025-03-24T03:00:00.000Z"),
      },
    });
    console.log("OK: RateioVersion atualizada — aceitoEm e vigenteAPartirDe = 2025-03-24");
  } else {
    console.log("AVISO: nenhum RateioVersion VIGENTE encontrado pra BECKER");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
