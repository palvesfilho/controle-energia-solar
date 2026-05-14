import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rateios = await prisma.rateioVersion.findMany({
    where: { status: { in: ["VIGENTE", "SUBSTITUIDO"] } },
    select: {
      id: true,
      status: true,
      vigenteAPartirDe: true,
      plant: { select: { numeroUsina: true, name: true } },
    },
    orderBy: [{ plantId: "asc" }, { vigenteAPartirDe: "asc" }],
  });

  console.log(`\n=== RATEIOS × DATA DE VIGÊNCIA ===\n`);
  const usinasComRateioRecente: Array<{
    numero: string;
    name: string;
    dataMaisAntiga: Date;
  }> = [];

  const byPlant = new Map<string, typeof rateios>();
  for (const r of rateios) {
    const k = r.plant.numeroUsina ?? "";
    if (!byPlant.has(k)) byPlant.set(k, []);
    byPlant.get(k)!.push(r);
  }

  for (const [num, list] of byPlant) {
    const plant = list[0].plant;
    const dataMaisAntiga = list.reduce(
      (min, r) => (r.vigenteAPartirDe < min ? r.vigenteAPartirDe : min),
      list[0].vigenteAPartirDe,
    );
    console.log(`  Usina ${num} — ${plant.name}`);
    for (const r of list) {
      console.log(
        `    [${r.status}] vigente desde ${r.vigenteAPartirDe.toISOString().slice(0, 10)}`,
      );
    }

    if (dataMaisAntiga.getFullYear() >= 2026 && dataMaisAntiga.getMonth() >= 2) {
      usinasComRateioRecente.push({
        numero: num,
        name: plant.name,
        dataMaisAntiga,
      });
    }
    console.log("");
  }

  console.log(`\n=== USINAS COM RATEIOS SÓ RECENTES (>= mar/2026) ===`);
  console.log(`Nessas, faturas de antes de ${"dataMaisAntiga"} não geram payable.\n`);
  for (const u of usinasComRateioRecente) {
    // Contar faturas compensadas anteriores
    const ucsDoRateio = await prisma.rateioItem.findMany({
      where: {
        version: {
          plant: { numeroUsina: u.numero },
        },
      },
      select: { consumerUnitId: true },
    });
    const ucIds = Array.from(new Set(ucsDoRateio.map((i) => i.consumerUnitId)));
    const faturasForaCobertura = await prisma.consumerBill.findMany({
      where: {
        consumerUnitId: { in: ucIds },
        energiaCompensada: { gt: 0 },
      },
      select: {
        anoReferencia: true,
        mesReferencia: true,
        consumerUnit: { select: { codigoUc: true } },
      },
      orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    });
    const foraCobertura = faturasForaCobertura.filter((f) => {
      const d = new Date(f.anoReferencia, f.mesReferencia - 1, 1);
      return d < u.dataMaisAntiga;
    });
    console.log(
      `  ${u.numero} — ${u.name} | rateio desde ${u.dataMaisAntiga.toISOString().slice(0, 10)}`,
    );
    console.log(
      `     faturas compensadas fora da cobertura: ${foraCobertura.length}`,
    );
    for (const f of foraCobertura.slice(0, 6)) {
      console.log(
        `       UC ${f.consumerUnit.codigoUc} ${f.anoReferencia}-${String(f.mesReferencia).padStart(2, "0")}`,
      );
    }
    if (foraCobertura.length > 6)
      console.log(`       ... + ${foraCobertura.length - 6} mais`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
