/**
 * Job mensal de fechamento de pagamento ao investidor.
 *
 * Roda no dia 15 de cada mês via cron externo (Task Scheduler do Windows ou
 * cron Linux). Por padrão fecha o mês CALENDÁRIO atual — ou seja, quando
 * roda em 15/05, gera fechamentos com (anoFechamento=2026, mesFechamento=5).
 *
 * Uso:
 *   npx tsx scripts/run-monthly-investor-closing.ts                  # mês corrente
 *   npx tsx scripts/run-monthly-investor-closing.ts --ano=2026 --mes=4
 *
 * Idempotente: re-execução no mesmo mês apenas atualiza DRAFT existente
 * (PUBLISHED nunca é tocado).
 */
import { generateSettlementsForClosing } from "../src/lib/investor-settlements";

function parseArg(name: string): string | undefined {
  const flag = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(flag));
  return arg ? arg.slice(flag.length) : undefined;
}

async function main() {
  const now = new Date();
  const ano = Number(parseArg("ano") ?? now.getFullYear());
  const mes = Number(parseArg("mes") ?? now.getMonth() + 1);

  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
    console.error(`Ano inválido: ${ano}`);
    process.exit(1);
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    console.error(`Mês inválido: ${mes}`);
    process.exit(1);
  }

  console.log(`[fechamento-investidor] iniciando ano=${ano} mes=${mes}`);
  const startedAt = Date.now();

  const result = await generateSettlementsForClosing(ano, mes);

  const elapsed = Date.now() - startedAt;
  console.log(
    `[fechamento-investidor] OK em ${elapsed}ms — ${result.results.length} fechamento(s) processado(s), ${result.skippedInvestors.length} pulado(s)`,
  );

  for (const r of result.results) {
    console.log(
      `  • investor=${r.investorId} settlement=${r.settlementId} payables=${r.payablesIncluded} totalLiquido=R$ ${r.totalLiquido.toFixed(2)} ${r.created ? "[novo]" : "[reprocessado]"}`,
    );
  }
  for (const s of result.skippedInvestors) {
    console.warn(`  ! investor=${s.investorId} pulado: ${s.reason}`);
  }
}

main()
  .catch((e) => {
    console.error("[fechamento-investidor] erro fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
