/**
 * Leva o desconto combinado na proposta para as UCs que JÁ foram cadastradas a
 * partir da fila do CRM.
 *
 * Por que existe: até 15/08/2026 o desconto não viajava do CRM. Das 23 UCs
 * vindas da fila, 21 ficaram SEM "Desconto de Contrato" — e UC sem esse campo
 * não gera cobrança nenhuma (`billing-calculator` acusa "UC sem Desconto de
 * Contrato cadastrado" e devolve valor nulo).
 *
 * O que ele faz e o que NÃO faz:
 *   - preenche `percentCompensado` (e `percentBandeira`, quando também estiver
 *     vazio) das UCs em branco, com o desconto da proposta;
 *   - NUNCA sobrescreve desconto já cadastrado. Se o cadastro diverge do
 *     combinado, ele só RELATA — mudar isso mexe no que se cobra do cliente, e
 *     essa decisão é de quem vende, não de um script.
 *
 * A bandeira recebe o mesmo percentual porque `percentBandeira` vazio faz o
 * cálculo pular a parcela de bandeira em silêncio — o cliente ganharia a
 * bandeira de graça sem ninguém decidir isso.
 *
 * Uso:
 *   npx tsx scripts/backfill-desconto-crm-ucs.ts            # só relata
 *   npx tsx scripts/backfill-desconto-crm-ucs.ts --apply    # escreve
 *
 * Rode `npx tsx scripts/run-crm-sync.ts` antes: é o sync que traz o desconto
 * do CRM para a fila.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { conferirDesconto, descontoParaPercentCobrado } from "../src/lib/crm-desconto";

async function main() {
  const aplicar = process.argv.includes("--apply");

  const linhas = await prisma.crmUcImportada.findMany({
    where: { consumerUnitId: { not: null } },
    select: {
      codigoUc: true,
      clienteNome: true,
      consumerUnitId: true,
      propostaIdCrm: true,
      descontoPercent: true,
      planoContrato: true,
    },
  });

  const ids = linhas.map((l) => l.consumerUnitId!).filter(Boolean);
  const ucs = await prisma.consumerUnit.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true, codigoUc: true, percentCompensado: true, percentBandeira: true },
  });
  const porId = new Map(ucs.map((u) => [u.id, u]));

  const aPreencher: typeof linhas = [];
  const divergentes: string[] = [];
  const semDescontoNaProposta: string[] = [];
  let jaCertas = 0;

  for (const l of linhas) {
    const uc = porId.get(l.consumerUnitId!);
    if (!uc) continue;

    if (l.descontoPercent == null) {
      semDescontoNaProposta.push(`${l.codigoUc} ${l.clienteNome} (proposta ${l.propostaIdCrm})`);
      continue;
    }

    const c = conferirDesconto(l.descontoPercent, uc.percentCompensado);
    if (c.semCadastro) {
      aPreencher.push(l);
    } else if (c.divergente) {
      divergentes.push(
        `${l.codigoUc} ${l.clienteNome}: proposta ${c.descontoProposta}% × cadastro ${c.descontoCadastrado}%`,
      );
    } else {
      jaCertas += 1;
    }
  }

  console.log(`UCs vindas da fila do CRM: ${linhas.length}`);
  console.log(`  já batendo com a proposta: ${jaCertas}`);
  console.log(`  a preencher (cadastro em branco): ${aPreencher.length}`);
  console.log(`  divergentes (NÃO serão tocadas): ${divergentes.length}`);
  console.log(`  proposta sem desconto (nada a fazer): ${semDescontoNaProposta.length}`);

  if (divergentes.length) {
    console.log("\n⚠️  divergências — decisão comercial, resolva na tela da UC:");
    for (const d of divergentes) console.log(`   ${d}`);
  }
  if (semDescontoNaProposta.length) {
    console.log("\n⚠️  sem desconto na proposta do CRM:");
    for (const d of semDescontoNaProposta) console.log(`   ${d}`);
  }

  if (!aPreencher.length) {
    console.log("\nNada a preencher.");
    return;
  }

  console.log(`\n${aplicar ? "APLICANDO" : "DRY-RUN (use --apply para escrever)"}:`);
  for (const l of aPreencher) {
    const uc = porId.get(l.consumerUnitId!)!;
    const fracao = descontoParaPercentCobrado(l.descontoPercent)!;
    const tocaBandeira = uc.percentBandeira == null;
    console.log(
      `   ${l.codigoUc.padEnd(14)} ${String(l.clienteNome).slice(0, 30).padEnd(30)} ` +
        `desconto ${l.descontoPercent}% -> percentCompensado=${fracao}` +
        (tocaBandeira ? ` + percentBandeira=${fracao}` : " (bandeira já preenchida, mantida)"),
    );
    if (aplicar) {
      await prisma.consumerUnit.update({
        where: { id: uc.id },
        data: {
          percentCompensado: fracao,
          ...(tocaBandeira ? { percentBandeira: fracao } : {}),
        },
      });
    }
  }

  console.log(
    aplicar
      ? `\n✅ ${aPreencher.length} UC(s) atualizadas.`
      : `\nNada foi escrito. Rode com --apply para gravar.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
