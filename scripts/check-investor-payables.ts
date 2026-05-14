/**
 * Diagnóstico rápido dos InvestorPayable após o backfill.
 * - Contagem por status
 * - Totais por usina (kWh + R$ líquido) por ano/mês
 * - Investidores afetados
 *
 * Uso: npx tsx scripts/check-investor-payables.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const total = await prisma.investorPayable.count();
  console.log(`\n=== Resumo geral ===`);
  console.log(`Total de payables: ${total}`);

  if (total === 0) {
    console.log(
      "\nNenhum InvestorPayable encontrado. Rode o backfill: npx tsx scripts/backfill-investor-payables.ts --apply",
    );
    return;
  }

  // Contagem por status
  const porStatus = await prisma.investorPayable.groupBy({
    by: ["status"],
    _count: true,
    _sum: { valorLiquido: true, kwhCompensadoBase: true },
  });
  console.log(`\n=== Por status ===`);
  for (const s of porStatus) {
    const kwh = (s._sum.kwhCompensadoBase ?? 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 0,
    });
    const valor = (s._sum.valorLiquido ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    console.log(`  ${s.status.padEnd(28)} ${String(s._count).padStart(4)} payable(s) — ${kwh} kWh — ${valor}`);
  }

  // Por (usina, ano, mês)
  const porUsinaPeriodo = await prisma.investorPayable.groupBy({
    by: ["plantId", "anoReferencia", "mesReferencia"],
    _count: true,
    _sum: { valorLiquido: true, kwhCompensadoBase: true },
    orderBy: [
      { anoReferencia: "asc" },
      { mesReferencia: "asc" },
    ],
  });
  const plants = await prisma.plant.findMany({
    where: { id: { in: porUsinaPeriodo.map((p) => p.plantId) } },
    select: { id: true, name: true },
  });
  const plantName = new Map(plants.map((p) => [p.id, p.name]));
  console.log(`\n=== Por usina × período ===`);
  for (const p of porUsinaPeriodo) {
    const nome = plantName.get(p.plantId) ?? p.plantId;
    const ref = `${String(p.mesReferencia).padStart(2, "0")}/${p.anoReferencia}`;
    const kwh = (p._sum.kwhCompensadoBase ?? 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 0,
    });
    const valor = (p._sum.valorLiquido ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    console.log(`  ${ref}  ${nome.padEnd(40)} ${String(p._count).padStart(3)}× — ${kwh.padStart(10)} kWh — ${valor}`);
  }

  // Por investidor
  const porInvestor = await prisma.investorPayable.groupBy({
    by: ["investorId"],
    _count: true,
    _sum: { valorLiquido: true },
  });
  const investors = await prisma.investor.findMany({
    where: { id: { in: porInvestor.map((p) => p.investorId) } },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const invName = new Map(
    investors.map((i) => [i.id, i.user.name ?? i.user.email ?? i.id]),
  );
  console.log(`\n=== Por investidor ===`);
  for (const p of porInvestor) {
    const nome = invName.get(p.investorId) ?? p.investorId;
    const valor = (p._sum.valorLiquido ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    console.log(`  ${nome.padEnd(40)} ${String(p._count).padStart(3)} payable(s) — ${valor}`);
  }

  // Alertas
  console.log(`\n=== Alertas ===`);
  const semBilling = await prisma.investorPayable.count({
    where: {
      status: { in: ["AGUARDANDO_PAGAMENTO", "DISPONIVEL"] },
      consumerUnitBillingId: null,
    },
  });
  if (semBilling > 0) {
    console.log(
      `  ! ${semBilling} payable(s) sem ConsumerUnitBilling vinculado — UC pode não ter cobrança gerada para o período`,
    );
  }
  const aguardandoCompensacao = porStatus.find((s) => s.status === "AGUARDANDO_COMPENSACAO");
  if (aguardandoCompensacao && aguardandoCompensacao._count > 0) {
    console.log(
      `  ! ${aguardandoCompensacao._count} payable(s) ainda em AGUARDANDO_COMPENSACAO — fatura da UC pode não ter chegado com crédito compensado`,
    );
  }
  if (semBilling === 0 && (!aguardandoCompensacao || aguardandoCompensacao._count === 0)) {
    console.log(`  OK — nenhum alerta`);
  }
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
