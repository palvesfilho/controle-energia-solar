import { prisma } from "../src/lib/prisma";

const PLANT_ID = "c92bd286-6c47-4609-9edb-9443bc30cb77";

async function main() {
  const versions = await prisma.rateioVersion.findMany({
    where: { plantId: PLANT_ID },
    orderBy: { vigenteAPartirDe: "asc" },
    select: {
      id: true,
      status: true,
      vigenteAPartirDe: true,
      criadoEm: true,
      enviadoEm: true,
      aceitoEm: true,
      rejeitadoEm: true,
      substituidoEm: true,
      items: {
        select: {
          consumerUnit: { select: { codigoUc: true, nome: true } },
          percentual: true,
        },
      },
    },
  });

  console.log(`RateioVersion da Sidinei (${versions.length}):\n`);
  for (const v of versions) {
    console.log(
      `   vigente=${v.vigenteAPartirDe?.toISOString().slice(0, 10) ?? "(sem)"} | aceito=${v.aceitoEm?.toISOString().slice(0, 10) ?? "(sem)"} | criado=${v.criadoEm?.toISOString().slice(0, 10) ?? "(sem)"} | status=${v.status} | ${v.items.length} UC(s)`,
    );
    for (const it of v.items) {
      console.log(`      └─ ${it.consumerUnit.codigoUc} ${it.consumerUnit.nome.padEnd(32)} ${it.percentual}%`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
