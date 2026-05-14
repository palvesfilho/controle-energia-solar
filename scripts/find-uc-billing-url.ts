/**
 * Acha um ConsumerUnitBilling existente para gerar a URL de teste
 * da tela de cobrança redesenhada.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const billings = await prisma.consumerUnitBilling.findMany({
    take: 5,
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    include: {
      consumerUnit: { select: { codigoUc: true, nome: true } },
    },
  });

  if (billings.length === 0) {
    console.log("Nenhum ConsumerUnitBilling encontrado.");
    return;
  }

  console.log("\nURLs disponíveis (use qualquer uma):\n");
  for (const b of billings) {
    const mesParam = `${b.ano}-${String(b.mes).padStart(2, "0")}`;
    const url = `http://localhost:3000/admin/faturamento/unidades-consumidoras/${mesParam}/${b.id}`;
    console.log(
      `  ${String(b.mes).padStart(2, "0")}/${b.ano}  ${b.consumerUnit.nome.padEnd(35)} UC ${b.consumerUnit.codigoUc} → status ${b.status}`,
    );
    console.log(`    ${url}\n`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
