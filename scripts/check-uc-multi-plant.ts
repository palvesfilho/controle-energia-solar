/**
 * Verifica se existe UC participando de rateios de 2+ plants distintas
 * (em rateios VIGENTE ou SUBSTITUIDO). Se houver, a fórmula
 * kwhBase = energiaCompensada precisa de regra de atribuição entre as plants.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const items = await prisma.rateioItem.findMany({
    where: {
      version: { status: { in: ["VIGENTE", "SUBSTITUIDO"] } },
    },
    select: {
      consumerUnitId: true,
      version: {
        select: {
          plantId: true,
          status: true,
          vigenteAPartirDe: true,
          plant: { select: { name: true, numeroUsina: true } },
        },
      },
      consumerUnit: { select: { codigoUc: true, nome: true } },
    },
  });

  // Agrupa por consumerUnitId
  const porUC = new Map<
    string,
    Array<{
      plantId: string;
      plantName: string;
      numeroUsina: string | null;
      status: string;
      vigenteAPartirDe: Date;
      ucCodigo: string;
      ucNome: string;
    }>
  >();
  for (const i of items) {
    const arr = porUC.get(i.consumerUnitId) ?? [];
    arr.push({
      plantId: i.version.plantId,
      plantName: i.version.plant.name,
      numeroUsina: i.version.plant.numeroUsina,
      status: i.version.status,
      vigenteAPartirDe: i.version.vigenteAPartirDe,
      ucCodigo: i.consumerUnit.codigoUc,
      ucNome: i.consumerUnit.nome,
    });
    porUC.set(i.consumerUnitId, arr);
  }

  let totalUcs = 0;
  let comMultiplasPlants = 0;
  let comMultiplasPlantsVigentes = 0;

  for (const [, arr] of porUC) {
    totalUcs++;
    const plantsDistintas = new Set(arr.map((a) => a.plantId));
    if (plantsDistintas.size > 1) {
      comMultiplasPlants++;
      const vigentes = arr.filter((a) => a.status === "VIGENTE");
      const plantsVigentes = new Set(vigentes.map((a) => a.plantId));
      if (plantsVigentes.size > 1) {
        comMultiplasPlantsVigentes++;
        const ref = arr[0];
        console.log(
          `\n⚠ UC ${ref.ucCodigo} (${ref.ucNome}) — ${plantsVigentes.size} plants VIGENTES simultâneas:`,
        );
        for (const a of vigentes) {
          console.log(
            `    - ${a.plantName} (${a.numeroUsina}) | desde ${a.vigenteAPartirDe.toISOString().slice(0, 10)}`,
          );
        }
      }
    }
  }

  console.log(`\n=== Resumo ===`);
  console.log(`UCs únicas em algum rateio: ${totalUcs}`);
  console.log(`UCs com plants distintas (qualquer status): ${comMultiplasPlants}`);
  console.log(`UCs com 2+ plants VIGENTES ao mesmo tempo: ${comMultiplasPlantsVigentes}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
