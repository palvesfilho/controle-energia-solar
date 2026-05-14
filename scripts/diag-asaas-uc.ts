import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getPayment } from "../src/lib/asaas";

async function main() {
  const codigoUc = process.argv[2] ?? "3090582291";
  const billing = await prisma.consumerUnitBilling.findFirst({
    where: { consumerUnit: { codigoUc } },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    include: { consumerUnit: { select: { nome: true, codigoUc: true } } },
  });
  if (!billing) {
    console.log(`Nenhuma cobrança para UC ${codigoUc}`);
    return;
  }
  console.log(`UC: ${billing.consumerUnit.nome} (${billing.consumerUnit.codigoUc})`);
  console.log(`Billing: ${String(billing.mes).padStart(2, "0")}/${billing.ano}`);
  console.log("  Nosso status:         ", billing.status);
  console.log("  asaasChargeId:        ", billing.asaasChargeId);
  console.log("  asaasStatus (cache):  ", billing.asaasStatus);
  console.log("  asaasSyncedAt:        ", billing.asaasSyncedAt);

  if (!billing.asaasChargeId) {
    console.log("Sem asaasChargeId — nada a consultar.");
    return;
  }

  console.log(`\nConsultando Asaas (id=${billing.asaasChargeId})…`);
  try {
    const payment = await getPayment(billing.asaasChargeId);
    console.log("Retorno completo do Asaas:");
    console.log(JSON.stringify(payment, null, 2));
    console.log(`\nCampos-chave:`);
    console.log(`  payment.status:  ${payment.status}`);
    console.log(`  payment.deleted: ${payment.deleted}`);
  } catch (e) {
    console.error("Erro ao consultar Asaas:", e);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
