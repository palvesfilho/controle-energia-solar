/**
 * Mostra EXATAMENTE o que o cliente receberia de uma cobrança, sem enviar nada.
 *
 * Use antes de virar `NOTIFICACAO_COBRANCA_MODO` para `real`: imprime o email e
 * o WhatsApp palavra por palavra, com o destinatário resolvido a partir do
 * cadastro (que é onde moram as surpresas — endereço do gestor no lugar do
 * cliente, telefone fixo, número sem o nono dígito).
 *
 * Uso:
 *   npx tsx scripts/simular-aviso-cobranca.ts            # 1ª cobrança emitida que achar
 *   npx tsx scripts/simular-aviso-cobranca.ts <billingId>
 *
 * ⚠️ Roda `notificarCobranca` de verdade, mas o modo `simulacao` (padrão) sai
 * antes de qualquer envio E antes de gerar/salvar o PDF — o script confere isso
 * comparando o banco antes e depois. Se o ambiente estiver em `real`, ele
 * RECUSA rodar: um "só pra ver como fica" que dispara para o cliente seria o
 * pior jeito de descobrir que o modo estava trocado.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { modoNotificacao, notificarCobranca } from "../src/lib/notificar-cobranca";
import {
  assuntoEmailCobranca,
  textoEmailCobranca,
  textoWhatsappCobranca,
} from "../src/lib/cobranca-mensagens";

const prisma = new PrismaClient();

async function main() {
  const modo = modoNotificacao();
  if (modo === "real") {
    console.error(
      "RECUSADO: NOTIFICACAO_COBRANCA_MODO=real. Este script mandaria mensagem\n" +
        "de verdade para o cliente. Rode com NOTIFICACAO_COBRANCA_MODO=simulacao.",
    );
    process.exitCode = 1;
    return;
  }

  const idPedido = process.argv[2];
  const billing = await prisma.consumerUnitBilling.findFirst({
    where: idPedido ? { id: idPedido } : { asaasChargeId: { not: null } },
    include: { consumerUnit: { include: { consumer: true } } },
  });
  if (!billing) {
    console.log(
      idPedido
        ? `Cobrança ${idPedido} não encontrada.`
        : "Nenhuma cobrança emitida (com asaasChargeId) no banco.",
    );
    return;
  }

  const uc = billing.consumerUnit;
  console.log(`Cobrança ...${billing.id.slice(-8)}  |  modo: ${modo}`);
  console.log(`UC ${uc.codigoUc} — ${uc.nome}  |  ${billing.mes}/${billing.ano}`);
  console.log(`Cliente: ${uc.consumer?.name ?? "(sem cliente vinculado)"}`);
  console.log(`  email cadastrado : ${uc.consumer?.email || "—"}`);
  console.log(`  emails de receb. : ${uc.consumer?.emailsRecebimento || "—"}`);
  console.log(`  telefone         : ${uc.consumer?.phone || "—"}`);
  console.log(`  link de pagamento: ${billing.asaasInvoiceUrl ?? "(null)"}`);

  const antes = await snapshot(billing.id);
  const r = await notificarCobranca(billing.id);
  const depois = await snapshot(billing.id);

  console.log("\n--- CANAIS ---");
  console.log(`  email    : ${r.email.status.padEnd(12)} → ${r.email.destino ?? "—"}`);
  if (r.email.erro) console.log(`             ${r.email.erro}`);
  console.log(`  whatsapp : ${r.whatsapp.status.padEnd(12)} → ${r.whatsapp.destino ?? "—"}`);
  if (r.whatsapp.erro) console.log(`             ${r.whatsapp.erro}`);

  console.log(
    `\n  Escreveu no banco? ${antes === depois ? "NÃO (correto para simulação)" : "SIM — ISSO É UM DEFEITO"}`,
  );

  const dados = {
    clienteNome: uc.consumer?.name ?? uc.nome,
    mes: billing.mes,
    ano: billing.ano,
    valor: billing.valorCobranca ?? 0,
    vencimento: billing.dataVencimento,
    linkPagamento: billing.asaasInvoiceUrl,
    codigoUc: uc.codigoUc,
  };
  console.log(`\n--- WHATSAPP ---\n${textoWhatsappCobranca(dados)}`);
  console.log(`\n--- EMAIL ---\nAssunto: ${assuntoEmailCobranca(dados)}\n${textoEmailCobranca(dados)}\n`);
}

/** Campos que um envio real mexeria. Comparados como texto, antes e depois. */
async function snapshot(id: string): Promise<string> {
  const b = await prisma.consumerUnitBilling.findUnique({
    where: { id },
    select: {
      emailEnviadoEm: true,
      emailErro: true,
      emailDestinatarios: true,
      whatsappEnviadoEm: true,
      whatsappErro: true,
      whatsappNumero: true,
      demonstrativoGeradoEm: true,
      demonstrativoUrl: true,
    },
  });
  return JSON.stringify(b);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
