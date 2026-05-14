import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const payables = await prisma.investorPayable.findMany({
    where: { originatedByPlantBillId: null },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      status: true,
      valorRealPago: true,
      pagoInvestidorEm: true,
      plant: { select: { name: true } },
      consumerUnit: { select: { codigoUc: true, nome: true } },
      debitApplications: { select: { id: true } },
      debitosOriginados: { select: { id: true } },
      investorSettlementId: true,
    },
  });

  console.log(`Payables órfãos encontrados: ${payables.length}\n`);

  const safe: string[] = [];
  const blocked: { id: string; reason: string }[] = [];

  for (const p of payables) {
    const reasons: string[] = [];
    if (p.status === "PAGO") reasons.push("status=PAGO");
    if (p.status === "EM_COBRANCA_JUDICIAL") reasons.push("status=EM_COBRANCA_JUDICIAL");
    if (p.valorRealPago != null) reasons.push(`valorRealPago=${p.valorRealPago}`);
    if (p.pagoInvestidorEm) reasons.push("já tem pagoInvestidorEm");
    if (p.debitApplications.length > 0) reasons.push(`${p.debitApplications.length} débitos aplicados`);
    if (p.debitosOriginados.length > 0) reasons.push(`${p.debitosOriginados.length} débitos originados`);
    if (p.investorSettlementId) reasons.push(`vinculado a settlement ${p.investorSettlementId}`);

    const tag = `${p.plant.name} | UC ${p.consumerUnit.codigoUc} | ${p.anoReferencia}-${String(p.mesReferencia).padStart(2,"0")} | ${p.status}`;
    if (reasons.length > 0) {
      blocked.push({ id: p.id, reason: reasons.join("; ") });
      console.log(`⚠ BLOCKED  ${tag}`);
      console.log(`           motivo: ${reasons.join("; ")}`);
    } else {
      safe.push(p.id);
      console.log(`✓ OK       ${tag}`);
    }
  }

  console.log(`\nResumo: ${safe.length} safe, ${blocked.length} blocked.`);

  if (!APPLY) {
    console.log("\n(dry-run — passe --apply pra deletar os safe)");
    return;
  }

  if (safe.length === 0) {
    console.log("Nada a deletar.");
    return;
  }

  const res = await prisma.investorPayable.deleteMany({
    where: { id: { in: safe } },
  });
  console.log(`\n${res.count} payables deletados.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
