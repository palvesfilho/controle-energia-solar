/**
 * Marca vínculos usina↔investidor com o regime "Usina Dommo Soluções".
 *
 * Sem flags = DRY-RUN (só mostra). Com `--apply` = escreve.
 *
 * Alvo: os vínculos cujo investidor tem o CNPJ da Dommo. Marcar implica, pela
 * definição do regime, **zerar** `valorKwhContrato` e `gestaoFixaContrato` —
 * o mesmo que a API faz ao marcar pela tela.
 *
 * ⚠️ Efeito colateral desejado: a partir da marcação, `syncInvestorPayablesFromBill`
 * PULA essas usinas (não gera mais payable de R$ 0,00 calado) e o PDF do
 * investidor passa a recusar. Ver src/lib/usina-dommo.ts.
 */
import { prisma } from "../src/lib/prisma";
import { CNPJ_DOMMO_SOLUCOES, isInvestidorDommo } from "../src/lib/usina-dommo";

const APPLY = process.argv.includes("--apply");

async function main() {
  const links = await prisma.investorPlant.findMany({
    where: { investor: { cnpj: { contains: CNPJ_DOMMO_SOLUCOES.slice(0, 8) } } },
    select: {
      id: true,
      isUsinaDommo: true,
      valorKwhContrato: true,
      gestaoFixaContrato: true,
      plantId: true,
      plant: { select: { name: true } },
      investor: {
        select: { cnpj: true, document: true, user: { select: { name: true } } },
      },
    },
    orderBy: { plant: { name: "asc" } },
  });

  // Confirma pela regra única — o `contains` acima é só pré-filtro do banco.
  const alvos = links.filter((l) => isInvestidorDommo(l.investor));
  console.log(
    `${APPLY ? "APLICANDO" : "DRY-RUN"} — vínculos com o CNPJ da Dommo: ${alvos.length}\n`,
  );

  for (const l of alvos) {
    const payables = await prisma.investorPayable.groupBy({
      by: ["status"],
      where: { plantId: l.plantId },
      _count: { _all: true },
      _sum: { valorLiquido: true },
    });
    const totalPayables = payables.reduce((s, p) => s + p._count._all, 0);

    console.log(`· ${l.plant.name}  (${l.investor.user.name})`);
    console.log(
      `    hoje: isUsinaDommo=${l.isUsinaDommo} valorKwhContrato=${l.valorKwhContrato} gestaoFixa=${l.gestaoFixaContrato}`,
    );
    if (totalPayables === 0) {
      console.log(`    payables existentes: nenhuma`);
    } else {
      console.log(`    payables existentes: ${totalPayables} —`);
      for (const p of payables) {
        console.log(
          `      ${p.status}: ${p._count._all} parcela(s), R$ ${(p._sum.valorLiquido ?? 0).toFixed(2)}`,
        );
      }
      console.log(
        `      ⚠️ estas NÃO são apagadas por este script — marcar só impede as PRÓXIMAS.`,
      );
    }
  }

  if (!APPLY) {
    console.log(`\nNada foi escrito. Rode com --apply para marcar.`);
    return;
  }

  const res = await prisma.investorPlant.updateMany({
    where: { id: { in: alvos.map((l) => l.id) } },
    data: {
      isUsinaDommo: true,
      // Não existem neste regime — deixar gravado seria valor que não vale.
      valorKwhContrato: null,
      gestaoFixaContrato: null,
    },
  });
  console.log(`\n✅ ${res.count} vínculo(s) marcado(s).`);

  const conferencia = await prisma.investorPlant.findMany({
    where: { id: { in: alvos.map((l) => l.id) } },
    select: {
      isUsinaDommo: true,
      valorKwhContrato: true,
      gestaoFixaContrato: true,
      plant: { select: { name: true } },
    },
    orderBy: { plant: { name: "asc" } },
  });
  console.log("\nConferência (releitura do banco):");
  for (const c of conferencia) {
    console.log(
      `  · ${c.plant.name}: dommo=${c.isUsinaDommo} kwh=${c.valorKwhContrato} gestao=${c.gestaoFixaContrato}`,
    );
  }

  const aindaMarcadosFora = await prisma.investorPlant.count({
    where: { isUsinaDommo: true, id: { notIn: alvos.map((l) => l.id) } },
  });
  console.log(
    `\nVínculos marcados FORA da lista alvo: ${aindaMarcadosFora} (esperado 0)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
