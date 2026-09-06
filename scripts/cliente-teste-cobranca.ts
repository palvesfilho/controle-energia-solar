/**
 * Cria (ou remove) um CLIENTE DE TESTE completo para exercitar o fluxo de
 * cobrança de ponta a ponta: validar demonstrativo → emitir no Asaas → gerar
 * PDF → avisar por email e WhatsApp.
 *
 * ⚠️ **Isto escreve no banco de PRODUÇÃO.** É o único jeito de testar o
 * caminho real: a trava de faturamento exige uma fatura da distribuidora com
 * compensação, e isso não se cria pela tela.
 *
 * ⚠️ **ASAAS_ENV=production.** Quando você clicar em "Realizar Cobrança" na
 * tela, sai um BOLETO REAL. Ele é cancelável pelo botão "Cancelar Cobrança" da
 * mesma linha — cancele antes de rodar o `--remover`, porque apagar a linha
 * daqui NÃO cancela nada no Asaas.
 *
 * Tudo nasce marcado com ZZ TESTE no nome, para ordenar no fim das listas e
 * ser reconhecível por qualquer um que esbarre nele.
 *
 * Uso:
 *   npx tsx scripts/cliente-teste-cobranca.ts --criar \
 *     --doc 12345678000190 --email voce@dominio.com --fone "(55)99999-9999" \
 *     [--valor 5] [--ano 2026] [--mes 9]
 *
 *   npx tsx scripts/cliente-teste-cobranca.ts --remover
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { normalizarTelefoneBR } from "../src/lib/uc-trava-contato";

const prisma = new PrismaClient();

/** Marca única: é por ela que o `--remover` encontra o que apagar. */
const MARCA = "ZZ TESTE";
const CODIGO_UC = "999999999999";

function arg(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
}
const tem = (n: string) => process.argv.includes(`--${n}`);

async function criar() {
  const doc = (arg("doc") ?? "").replace(/\D/g, "");
  const email = arg("email");
  const fone = arg("fone");
  const valor = Number(arg("valor") ?? 5);
  const hoje = new Date();
  const ano = Number(arg("ano") ?? hoje.getFullYear());
  const mes = Number(arg("mes") ?? hoje.getMonth() + 1);

  if (!doc || (doc.length !== 11 && doc.length !== 14)) {
    throw new Error("--doc precisa ser um CPF (11) ou CNPJ (14 dígitos). O Asaas exige.");
  }
  if (!email) throw new Error("--email é obrigatório: é para onde a fatura de teste vai.");

  // `--fone` é OPCIONAL: sem ele a UC nasce sem telefone e o canal de WhatsApp
  // reporta "sem telefone cadastrado" em vez de tentar enviar. Serve para
  // fechar o teste de email hoje e preencher o celular depois, pela tela de
  // cadastro — que é como o operador faria de verdade. Só funciona com a trava
  // de contato em `off`; com ela ligada, a emissão recusa (e deve recusar).
  const tel = fone ? normalizarTelefoneBR(fone) : { e164: null as string | null };
  if (fone && !tel.e164) {
    throw new Error(`--fone recusado: ${(tel as { motivo?: string }).motivo}`);
  }

  const jaExiste = await prisma.consumerUnit.findUnique({ where: { codigoUc: CODIGO_UC } });
  if (jaExiste) {
    throw new Error(
      `Já existe UC de teste (${CODIGO_UC}). Rode --remover antes de criar outra.`,
    );
  }

  const consumer = await prisma.consumer.create({
    data: {
      name: `${MARCA} - Cliente de teste`,
      email,
      phone: fone ?? null,
      cpfCnpj: doc,
      document: doc,
      active: true,
    },
  });

  const uc = await prisma.consumerUnit.create({
    data: {
      consumerId: consumer.id,
      // PADRAO é obrigatório: é o mundo da Associação, o único faturável.
      // Ver lib/uc-origem.ts.
      origem: "PADRAO",
      nome: `${MARCA} - UC de teste`,
      codigoUc: CODIGO_UC,
      cpfCnpj: doc,
      distribuidora: "RGE",
      grupo: "B",
      percentCompensado: 0.85,
      pagadorFaturaEnergia: "CLIENTE",
      active: true,
    },
  });

  // 🔒 Sem esta fatura COM COMPENSAÇÃO a trava de faturamento recusa a emissão
  // — e recusa com razão: UC que nunca compensou não pode ser cobrada.
  // Ver lib/uc-trava-faturamento.ts.
  const bill = await prisma.consumerBill.create({
    data: {
      consumerUnitId: uc.id,
      anoReferencia: ano,
      mesReferencia: mes,
      consumoKwh: 500,
      energiaCompensada: 450,
      valorTotal: 120,
      tarifaTE: 0.35,
      tarifaTUSD: 0.45,
    },
  });

  const vencimento = new Date(ano, mes - 1, 28);
  const billing = await prisma.consumerUnitBilling.create({
    data: {
      consumerUnitId: uc.id,
      ano,
      mes,
      valorCobranca: valor,
      valorFatura: 120,
      dataVencimento: vencimento,
      status: "PENDENTE",
      // Deixado SEM validar de propósito: o teste deve começar em "Validar
      // Demonstrativo", que é o gesto real do operador.
      demonstrativoValidadoEm: null,
    },
  });

  console.log("\nCriado:");
  console.log(`  Consumer  ${consumer.id}  ${consumer.name}`);
  console.log(`  UC        ${uc.id}  ${uc.codigoUc}`);
  console.log(`  Fatura    ${bill.id}  ${mes}/${ano}  (450 kWh compensados — libera a trava)`);
  console.log(`  Cobrança  ${billing.id}  R$ ${valor.toFixed(2)}  vence ${vencimento.toLocaleDateString("pt-BR")}`);
  console.log(`\n  Email vai para   : ${email}`);
  console.log(
    tel.e164
      ? `  WhatsApp vai para: ${fone} → ${tel.e164}`
      : '  WhatsApp         : SEM TELEFONE — cadastre o celular na tela da UC e use "Reenviar"',
  );
  console.log(
    `\nAbra: /admin/faturamento/unidades-consumidoras/${String(mes).padStart(2, "0")}-${ano}`,
  );
  console.log("Procure por \"ZZ TESTE\" (ordena no fim). Depois:");
  console.log("  1. Validar Demonstrativo");
  console.log("  2. Realizar Cobrança   ← aqui sai BOLETO REAL no Asaas");
  console.log("\nPara desfazer: cancele a cobrança pela tela e rode --remover.\n");
}

async function remover() {
  const uc = await prisma.consumerUnit.findUnique({
    where: { codigoUc: CODIGO_UC },
    include: { billings: true, bills: true, consumer: true },
  });
  if (!uc) {
    console.log("Nada a remover — não existe UC de teste.");
    return;
  }

  const comCobranca = uc.billings.filter((b) => b.asaasChargeId || b.installments);
  if (comCobranca.length > 0 && !tem("forcar")) {
    console.log("\n⚠️  ATENÇÃO: existe cobrança EMITIDA no Asaas para esta UC:");
    for (const b of comCobranca) {
      console.log(`    ${b.mes}/${b.ano}  chargeId=${b.asaasChargeId ?? "(parcelado)"}  status=${b.asaasStatus ?? "?"}`);
    }
    console.log(
      "\nApagar aqui NÃO cancela no Asaas — o boleto continuaria vivo e cobrável,\n" +
        "só que órfão, sem nada no sistema apontando para ele.\n" +
        "Cancele pela tela (botão \"Cancelar Cobrança\") e rode de novo.\n" +
        "Se você JÁ cancelou no painel do Asaas, repita com --forcar.\n",
    );
    process.exitCode = 1;
    return;
  }

  const nB = await prisma.consumerUnitBilling.deleteMany({ where: { consumerUnitId: uc.id } });
  const nF = await prisma.consumerBill.deleteMany({ where: { consumerUnitId: uc.id } });
  await prisma.consumerUnit.delete({ where: { id: uc.id } });
  let nC = 0;
  if (uc.consumer?.name.startsWith(MARCA)) {
    await prisma.consumer.delete({ where: { id: uc.consumer.id } });
    nC = 1;
  }
  console.log(
    `Removido: ${nC} cliente, 1 UC, ${nF.count} fatura(s), ${nB.count} cobrança(s).`,
  );
  console.log("O cliente criado no Asaas permanece lá — remova pelo painel deles, se quiser.");
}

async function main() {
  if (tem("criar")) return criar();
  if (tem("remover")) return remover();
  console.log(
    "Escolha uma ação:\n" +
      '  --criar --doc <cpf|cnpj> --email <email> --fone <telefone> [--valor 5] [--ano] [--mes]\n' +
      "  --remover [--forcar]\n",
  );
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`\nERRO: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
