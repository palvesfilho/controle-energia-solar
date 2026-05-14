import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const r = await p.plant.findMany({
    where: {
      OR: [
        { name: { contains: "OTHAVIO" } },
        { name: { contains: "Othavio" } },
        { name: { contains: "othavio" } },
        { name: { contains: "MORALES" } },
        { name: { contains: "Morales" } },
        { name: { contains: "CECHIM" } },
      ],
    },
    select: {
      id: true,
      name: true,
      potenciaInversor: true,
      potenciaInstalada: true,
      inversorMarca: true,
      inversorModelo: true,
      monitoramentoPlataforma: true,
      monitoramentoUrl: true,
      numeroUsina: true,
      active: true,
    },
  });
  console.log(JSON.stringify(r, null, 2));
  await p.$disconnect();
}
main();
