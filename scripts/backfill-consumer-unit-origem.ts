/**
 * Backfill da coluna ConsumerUnit.origem
 *
 * Marca UCs existentes que já são titular ou beneficiária Brasil Solar pra
 * serem ocultadas da tela /admin/unidades-consumidoras (que é da gestão de
 * créditos de investidor).
 *
 * Regras:
 * - BRASIL_SOLAR_TITULAR: codigoUc da UC bate com BrasilSolarProprietario.codigoUc
 * - BRASIL_SOLAR_BENEFICIARIA: UC referenciada em BrasilSolarBeneficiaria.consumerUnitId
 *
 * Idempotente: pode rodar várias vezes sem efeito colateral.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("== Backfill ConsumerUnit.origem ==\n");

  // 1) BRASIL_SOLAR_TITULAR — match por codigoUc com proprietário
  const proprietarios = await prisma.brasilSolarProprietario.findMany({
    where: { codigoUc: { not: null }, active: true },
    select: { id: true, nome: true, codigoUc: true },
  });
  const codigosTitular = proprietarios
    .map((p) => p.codigoUc)
    .filter((c): c is string => !!c);

  if (codigosTitular.length === 0) {
    console.log("Nenhum proprietário com codigoUc cadastrado.");
  } else {
    const tit = await prisma.consumerUnit.updateMany({
      where: { codigoUc: { in: codigosTitular }, origem: "PADRAO" },
      data: { origem: "BRASIL_SOLAR_TITULAR" },
    });
    console.log(
      `Marcadas como TITULAR: ${tit.count} UC(s) (${codigosTitular.length} código(s) de proprietário verificados)`,
    );
  }

  // 2) BRASIL_SOLAR_BENEFICIARIA — duas formas: via FK consumerUnitId (novo)
  //    e via match de codigoUc (histórico antes do FK existir).
  const benefs = await prisma.brasilSolarBeneficiaria.findMany({
    where: { active: true },
    select: { consumerUnitId: true, codigoUc: true },
  });
  const ucIdsBenef = benefs
    .map((b) => b.consumerUnitId)
    .filter((id): id is string => !!id);
  const codigosBenef = Array.from(new Set(benefs.map((b) => b.codigoUc)));

  let totalBenef = 0;
  if (ucIdsBenef.length > 0) {
    const r = await prisma.consumerUnit.updateMany({
      where: { id: { in: ucIdsBenef }, origem: "PADRAO" },
      data: { origem: "BRASIL_SOLAR_BENEFICIARIA" },
    });
    totalBenef += r.count;
  }
  if (codigosBenef.length > 0) {
    const r = await prisma.consumerUnit.updateMany({
      where: { codigoUc: { in: codigosBenef }, origem: "PADRAO" },
      data: { origem: "BRASIL_SOLAR_BENEFICIARIA" },
    });
    totalBenef += r.count;
  }
  console.log(
    `Marcadas como BENEFICIARIA: ${totalBenef} UC(s) (${codigosBenef.length} código(s) e ${ucIdsBenef.length} link(s) verificados)`,
  );

  // 3) Resumo final
  const counts = await prisma.consumerUnit.groupBy({
    by: ["origem"],
    _count: { _all: true },
  });
  console.log("\nDistribuição atual de ConsumerUnit.origem:");
  for (const c of counts) {
    console.log(`  ${c.origem}: ${c._count._all}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
