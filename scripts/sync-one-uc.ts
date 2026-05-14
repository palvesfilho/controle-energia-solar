import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";
import { saveBufferToStorage } from "../src/lib/file-storage";
import { consultarFatura, parseBillData, InfosimplesApiError } from "../src/lib/infosimples";
import { populateBillingFromBill } from "../src/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "../src/lib/investor-payables";

async function persistPdf(consumerUnitId: string, ano: number, mes: number, sourceUrl: string | null | undefined) {
  if (!sourceUrl) return null;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const fileName = `${ano}-${String(mes).padStart(2, "0")}.pdf`;
    const subdir = `bills/${consumerUnitId}`;
    await saveBufferToStorage(buffer, subdir, fileName);
    return `/api/files/${subdir}/${fileName}`;
  } catch {
    return null;
  }
}

async function main() {
  const codigo = process.argv[2];
  if (!codigo) throw new Error("Uso: npx tsx scripts/sync-one-uc.ts <codigoUc>");

  const uc = await prisma.consumerUnit.findFirst({ where: { codigoUc: codigo }, include: { cpflCredential: true } });
  if (!uc) throw new Error(`UC ${codigo} não encontrada`);
  const cred = uc.cpflCredential;
  if (!cred || !cred.active) throw new Error("Sem credencial ativa");

  console.log(`Sincronizando UC ${uc.codigoUc} (${uc.nome})...`);

  await prisma.cpflCredential.update({ where: { consumerUnitId: uc.id }, data: { statusSync: "PENDING", erroSync: null } });

  try {
    const senha = decrypt(cred.senhaCpfl);
    const faturas = await consultarFatura({ email: cred.emailCpfl, senha, instalacao: cred.instalacao });
    console.log(`  Infosimples retornou ${faturas?.length ?? 0} fatura(s)`);

    let synced = 0;
    for (const fatura of faturas ?? []) {
      const billData = parseBillData(fatura);
      const sourceUrl = fatura.pdf_url || fatura.site_receipts?.[0] || null;
      billData.pdfUrl = await persistPdf(uc.id, billData.anoReferencia, billData.mesReferencia, sourceUrl);

      const upserted = await prisma.consumerBill.upsert({
        where: {
          consumerUnitId_anoReferencia_mesReferencia: {
            consumerUnitId: uc.id,
            anoReferencia: billData.anoReferencia,
            mesReferencia: billData.mesReferencia,
          },
        },
        update: { ...billData, syncedAt: new Date() },
        create: { consumerUnitId: uc.id, ...billData, syncedAt: new Date() },
      });
      console.log(`  Persistida: ${String(billData.mesReferencia).padStart(2, "0")}/${billData.anoReferencia}  R$ ${billData.valorTotal}  pdf=${billData.pdfUrl ?? "(sem)"}`);

      await populateBillingFromBill(upserted.id).catch((e) => console.error("  populateBillingFromBill falhou:", e));
      await syncInvestorPayablesFromBill(upserted.id).catch((e) => console.error("  syncInvestorPayablesFromBill falhou:", e));
      synced++;
    }

    await prisma.cpflCredential.update({
      where: { consumerUnitId: uc.id },
      data: { statusSync: "SUCCESS", ultimaSync: new Date(), erroSync: synced === 0 ? "Nenhuma fatura encontrada" : null },
    });
    console.log(`Concluído: ${synced} fatura(s) sincronizada(s).`);
  } catch (e) {
    const msg = e instanceof InfosimplesApiError ? `${e.message} (code: ${e.code})` : e instanceof Error ? e.message : String(e);
    await prisma.cpflCredential.update({ where: { consumerUnitId: uc.id }, data: { statusSync: "ERROR", erroSync: msg } });
    console.error("ERRO:", msg);
    process.exit(1);
  }
}

main().finally(() => prisma.$disconnect());
