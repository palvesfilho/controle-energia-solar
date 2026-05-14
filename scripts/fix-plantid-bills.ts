/**
 * Corrige o campo plantId em ConsumerBill.
 *
 * Contexto: antes desta correção, o sync-all e o upload-manual copiavam
 * ConsumerUnit.plantId para ConsumerBill.plantId, o que fazia com que bills
 * de UCs de CLIENTE que fazem rateio com uma usina fossem contadas como
 * "fatura da usina" na tela Fechamento Total.
 *
 * A semântica correta: ConsumerBill.plantId só deve estar preenchido quando
 * a bill representa a conta de energia da própria UC da usina (ex.: bill
 * cuja instalação bate com Plant.numeroUsina/unidadeConsumidora/codigoCliente).
 *
 * Uso:
 *   npx tsx scripts/fix-plantid-bills.ts           # dry-run (apenas mostra)
 *   npx tsx scripts/fix-plantid-bills.ts --apply   # aplica
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");

  // Conjunto de identificadores válidos de UC de usina
  const plants = await prisma.plant.findMany({
    select: {
      id: true,
      name: true,
      unidadeConsumidora: true,
      numeroUsina: true,
      codigoCliente: true,
    },
  });
  const plantIds = new Map<string, { nome: string; ids: Set<string> }>();
  for (const p of plants) {
    const ids = new Set<string>();
    if (p.unidadeConsumidora) ids.add(p.unidadeConsumidora);
    if (p.numeroUsina) ids.add(p.numeroUsina);
    if (p.codigoCliente) ids.add(p.codigoCliente);
    plantIds.set(p.id, { nome: p.name, ids });
  }

  // Bills com plantId preenchido
  const bills = await prisma.consumerBill.findMany({
    where: { plantId: { not: null } },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      instalacao: true,
      plantId: true,
      consumerUnitId: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
    },
  });

  let manter = 0;
  let limpar = 0;
  const idsParaLimpar: string[] = [];

  for (const b of bills) {
    if (!b.plantId) continue;
    const info = plantIds.get(b.plantId);
    const nomeUsina = info?.nome ?? "—";
    const idsUsina = info?.ids ?? new Set<string>();
    const ref = `${b.anoReferencia}/${String(b.mesReferencia).padStart(2, "0")}`;

    // Critério: manter plantId quando:
    //  - bill não tem consumerUnitId (órfã direto da usina), OU
    //  - consumerUnit.codigoUc bate com identificadores da usina
    const ehDaUsina =
      b.consumerUnitId == null ||
      (!!b.consumerUnit?.codigoUc && idsUsina.has(b.consumerUnit.codigoUc));

    if (ehDaUsina) {
      manter++;
      console.log(
        `  ✓ MANTER  ${ref} • ${nomeUsina} • UC=${b.consumerUnit?.codigoUc ?? "órfã"} (${b.consumerUnit?.nome ?? "—"})`,
      );
    } else {
      limpar++;
      idsParaLimpar.push(b.id);
      console.log(
        `  ✗ LIMPAR  ${ref} • PLANT=${nomeUsina} • UC=${b.consumerUnit?.codigoUc ?? "—"} (${b.consumerUnit?.nome ?? "—"})`,
      );
    }
  }

  console.log(`\nResumo: manter=${manter} • limpar=${limpar}`);

  if (!apply) {
    console.log("\n(dry-run — rode com --apply para aplicar)");
    return;
  }

  if (idsParaLimpar.length === 0) {
    console.log("\nNada para limpar.");
    return;
  }

  const res = await prisma.consumerBill.updateMany({
    where: { id: { in: idsParaLimpar } },
    data: { plantId: null },
  });
  console.log(`\n✅ ${res.count} bill(s) atualizada(s): plantId = NULL`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
