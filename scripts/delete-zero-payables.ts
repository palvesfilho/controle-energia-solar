import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const zeroPayables = await prisma.investorPayable.findMany({
    where: {
      kwhCompensadoBase: 0,
      kwhCompensadoAjuste: 0,
      valorAjuste: 0,
      valorRealPago: null,
      pagoInvestidorEm: null,
      status: { notIn: ["PAGO", "EM_COBRANCA_JUDICIAL"] },
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      status: true,
      plant: { select: { name: true } },
      consumerUnit: { select: { codigoUc: true, nome: true } },
      debitApplications: { select: { id: true } },
      debitosOriginados: { select: { id: true } },
      investorSettlementId: true,
    },
  });

  const safe: string[] = [];
  for (const p of zeroPayables) {
    const blocked =
      p.debitApplications.length > 0 ||
      p.debitosOriginados.length > 0 ||
      p.investorSettlementId;
    const tag = `${p.plant.name} | UC ${p.consumerUnit.codigoUc} (${p.consumerUnit.nome}) | ${p.anoReferencia}-${String(p.mesReferencia).padStart(2,"0")} | ${p.status}`;
    if (blocked) {
      console.log(`⚠ BLOCKED  ${tag}`);
    } else {
      safe.push(p.id);
      console.log(`✓ OK       ${tag}`);
    }
  }

  console.log(`\nResumo: ${safe.length} a deletar, ${zeroPayables.length - safe.length} bloqueados.`);

  if (!APPLY) {
    console.log("\n(dry-run — passe --apply pra aplicar)");
    return;
  }
  if (safe.length === 0) return;
  const res = await prisma.investorPayable.deleteMany({ where: { id: { in: safe } } });
  console.log(`${res.count} deletados.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
