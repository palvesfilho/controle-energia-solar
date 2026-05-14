import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";
import { consultarFatura, parseBillData, InfosimplesApiError } from "../src/lib/infosimples";

async function syncOne(credentialId: string) {
  const cred = await prisma.cpflCredential.findUnique({ where: { id: credentialId } });
  if (!cred) throw new Error(`Credencial ${credentialId} nao encontrada`);

  const uc = await prisma.consumerUnit.findUnique({
    where: { id: cred.consumerUnitId },
    select: { id: true, nome: true, plantId: true },
  });

  console.log(`\n=== Sync UC=${uc?.nome ?? cred.consumerUnitId} instalacao=${cred.instalacao} ===`);
  console.log(`Email: ${cred.emailCpfl}`);

  await prisma.cpflCredential.update({
    where: { id: cred.id },
    data: { statusSync: "PENDING", erroSync: null },
  });

  try {
    const senha = decrypt(cred.senhaCpfl);
    const start = Date.now();
    const faturas = await consultarFatura({
      email: cred.emailCpfl,
      senha,
      instalacao: cred.instalacao,
    });
    const elapsedMs = Date.now() - start;
    console.log(`API retornou em ${elapsedMs}ms — ${faturas?.length ?? 0} fatura(s)`);

    if (!faturas || faturas.length === 0) {
      await prisma.cpflCredential.update({
        where: { id: cred.id },
        data: { statusSync: "SUCCESS", ultimaSync: new Date(), erroSync: "Nenhuma fatura encontrada" },
      });
      console.log("Nenhuma fatura encontrada");
      return;
    }

    let synced = 0;
    for (const fatura of faturas) {
      const billData = parseBillData(fatura);
      console.log(`  - Fatura ${String(billData.mesReferencia).padStart(2, "0")}/${billData.anoReferencia} | valor=R$ ${billData.valorTotal ?? "?"} | vencimento=${billData.vencimento?.toISOString()?.split("T")[0] ?? "?"}`);
      await prisma.consumerBill.upsert({
        where: {
          consumerUnitId_anoReferencia_mesReferencia: {
            consumerUnitId: cred.consumerUnitId,
            anoReferencia: billData.anoReferencia,
            mesReferencia: billData.mesReferencia,
          },
        },
        update: { ...billData, plantId: uc?.plantId || null, syncedAt: new Date() },
        create: { consumerUnitId: cred.consumerUnitId, plantId: uc?.plantId || null, ...billData, syncedAt: new Date() },
      });
      synced++;
    }

    await prisma.cpflCredential.update({
      where: { id: cred.id },
      data: { statusSync: "SUCCESS", ultimaSync: new Date(), erroSync: null },
    });
    console.log(`OK — ${synced} fatura(s) salvas no banco`);
  } catch (e) {
    const msg = e instanceof InfosimplesApiError
      ? `${e.message} (code: ${e.code}, errors: ${JSON.stringify(e.errors)})`
      : e instanceof Error ? e.message : "Erro desconhecido";
    await prisma.cpflCredential.update({
      where: { id: cred.id },
      data: { statusSync: "ERROR", erroSync: msg },
    });
    console.error("ERRO:", msg);
  }
}

async function main() {
  const creds = await prisma.cpflCredential.findMany({
    where: { active: true },
    select: { id: true },
  });
  console.log(`Encontradas ${creds.length} credencial(is) ativas`);
  for (const c of creds) {
    await syncOne(c.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
