/**
 * Consolida BrasilSolarBeneficiaria com ConsumerUnit:
 * - Pra cada beneficiária ativa sem consumerUnitId, busca UC por codigoUc.
 *   Se existe, linka + marca origem=BRASIL_SOLAR_BENEFICIARIA.
 *   Se não existe, cria UC nova com origem=BRASIL_SOLAR_BENEFICIARIA.
 * - Clona credencial RGE da UC titular do proprietário se existir.
 *
 * Idempotente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("== Consolidar beneficiárias ==\n");

  const benefs = await prisma.brasilSolarBeneficiaria.findMany({
    where: { active: true, consumerUnitId: null },
    select: {
      id: true,
      proprietarioId: true,
      codigoUc: true,
      nome: true,
    },
  });

  console.log(`Beneficiárias sem UC link: ${benefs.length}\n`);

  let linkados = 0;
  let criados = 0;
  let credenciaisCopiadas = 0;

  for (const b of benefs) {
    const prop = await prisma.brasilSolarProprietario.findUnique({
      where: { id: b.proprietarioId },
      select: {
        cpfCnpj: true,
        cidade: true,
        concessionaria: true,
        codigoUc: true,
      },
    });

    let uc = await prisma.consumerUnit.findUnique({
      where: { codigoUc: b.codigoUc },
      select: { id: true, origem: true },
    });

    if (uc) {
      // Reaproveita UC existente
      if (uc.origem === "PADRAO") {
        await prisma.consumerUnit.update({
          where: { id: uc.id },
          data: { origem: "BRASIL_SOLAR_BENEFICIARIA" },
        });
      }
      linkados++;
    } else {
      // Cria UC nova
      const created = await prisma.consumerUnit.create({
        data: {
          nome: b.nome ?? `UC ${b.codigoUc}`,
          codigoUc: b.codigoUc,
          cpfCnpj: prop?.cpfCnpj ?? null,
          distribuidora: prop?.concessionaria ?? null,
          cidade: prop?.cidade ?? null,
          origem: "BRASIL_SOLAR_BENEFICIARIA",
        },
        select: { id: true },
      });
      uc = { id: created.id, origem: "BRASIL_SOLAR_BENEFICIARIA" };
      criados++;
    }

    await prisma.brasilSolarBeneficiaria.update({
      where: { id: b.id },
      data: { consumerUnitId: uc.id },
    });

    // Clona credencial da titular se houver e a beneficiária ainda não tiver
    if (prop?.codigoUc) {
      const titularUc = await prisma.consumerUnit.findUnique({
        where: { codigoUc: prop.codigoUc },
        select: { id: true },
      });
      if (titularUc) {
        const credTitular = await prisma.cpflCredential.findUnique({
          where: { consumerUnitId: titularUc.id },
          select: { emailCpfl: true, senhaCpfl: true, distribuidora: true },
        });
        if (credTitular) {
          const existingCred = await prisma.cpflCredential.findUnique({
            where: { consumerUnitId: uc.id },
            select: { id: true },
          });
          if (!existingCred) {
            await prisma.cpflCredential.create({
              data: {
                consumerUnitId: uc.id,
                emailCpfl: credTitular.emailCpfl,
                senhaCpfl: credTitular.senhaCpfl,
                instalacao: b.codigoUc,
                distribuidora: credTitular.distribuidora,
                statusSync: "PENDING",
              },
            });
            credenciaisCopiadas++;
          }
        }
      }
    }
  }

  console.log(`UCs linkadas (já existiam):    ${linkados}`);
  console.log(`UCs criadas novas:             ${criados}`);
  console.log(`Credenciais clonadas:          ${credenciaisCopiadas}`);

  const counts = await prisma.consumerUnit.groupBy({
    by: ["origem"],
    _count: { _all: true },
  });
  console.log("\nDistribuição final ConsumerUnit.origem:");
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
