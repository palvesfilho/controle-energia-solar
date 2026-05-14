import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const codigo = process.argv[2];
  if (!codigo) throw new Error("Uso: npx tsx scripts/check-sync-eligibility.ts <codigoUc>");

  const uc = await prisma.consumerUnit.findFirst({
    where: { codigoUc: codigo },
    include: { cpflCredential: true },
  });
  if (!uc) {
    console.log("UC não encontrada com codigoUc =", codigo);
    return;
  }
  console.log("UC:", uc.id, "| codigoUc:", uc.codigoUc, "| nome:", uc.nome);
  console.log("plantId:", uc.plantId);

  const cred = uc.cpflCredential;
  console.log("\n--- CpflCredential ---");
  if (!cred) {
    console.log("SEM credencial cadastrada para esta UC");
  } else {
    console.log("active:", cred.active);
    console.log("instalacao:", cred.instalacao);
    console.log("emailCpfl:", cred.emailCpfl);
    console.log("statusSync:", cred.statusSync);
    console.log("ultimaSync:", cred.ultimaSync);
    console.log("erroSync:", cred.erroSync);
  }

  const ultimaBill = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: uc.id, proximaLeitura: { not: null } },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: {
      anoReferencia: true,
      mesReferencia: true,
      proximaLeitura: true,
      dataLeituraAtual: true,
      syncedAt: true,
    },
  });
  console.log("\n--- Última ConsumerBill (com proximaLeitura) ---");
  if (!ultimaBill) {
    console.log("NENHUMA bill com proximaLeitura cadastrada");
  } else {
    console.log("ref:", `${String(ultimaBill.mesReferencia).padStart(2, "0")}/${ultimaBill.anoReferencia}`);
    console.log("proximaLeitura:", ultimaBill.proximaLeitura);
    console.log("dataLeituraAtual:", ultimaBill.dataLeituraAtual);
    console.log("syncedAt:", ultimaBill.syncedAt);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const elegivelEm = new Date(ultimaBill.proximaLeitura!);
    elegivelEm.setDate(elegivelEm.getDate() + 2);
    console.log("elegivel a partir de:", elegivelEm.toLocaleDateString("pt-BR"));
    console.log("hoje:", hoje.toLocaleDateString("pt-BR"));
    console.log(hoje < elegivelEm ? ">>> SERÁ PULADA (skipped) — ainda não atingiu próxima leitura + 2" : ">>> ELEGÍVEL — vai consultar Infosimples");
  }

  const todasBills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc.id },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: { anoReferencia: true, mesReferencia: true, valorTotal: true, syncedAt: true },
  });
  console.log("\n--- Todas as bills desta UC (mais recentes primeiro) ---");
  for (const b of todasBills.slice(0, 10)) {
    console.log(`  ${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}  R$ ${b.valorTotal}  syncedAt=${b.syncedAt?.toISOString() ?? "-"}`);
  }
  console.log(`Total: ${todasBills.length} faturas`);
}

main()
  .catch((e) => { console.error("ERRO:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
