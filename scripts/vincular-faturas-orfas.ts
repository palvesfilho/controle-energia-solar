/**
 * Vincula faturas ÓRFÃS (consumerUnitId = null) à UC que o código da instalação
 * aponta hoje. Órfã nasce quando o PDF chega com um código que o cadastro ainda
 * não conhecia — tipicamente o código pré-migração da RGE. Corrigir o cadastro
 * NÃO vincula sozinho, e é isso que este script faz.
 *
 * Simula por padrão. Grava com --aplicar.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { whereCodigoUc } from "../src/lib/uc-codigo";
import { readFromStorage, saveBufferToStorage, deleteUploadedFile } from "../src/lib/file-storage";
import { populateBillingFromBill } from "../src/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "../src/lib/investor-payables";

const APLICAR = process.argv.includes("--aplicar");

type Plano = {
  billId: string; instalacao: string; ano: number; mes: number;
  ucId: string; ucNome: string; pdfUrl: string | null;
  acao: "vincular" | "conflito"; motivo?: string; conflitoBillId?: string;
};

async function main() {
  const orfas = await prisma.consumerBill.findMany({
    where: { consumerUnitId: null, instalacao: { not: null } },
    select: { id: true, instalacao: true, anoReferencia: true, mesReferencia: true, pdfUrl: true, valorTotal: true },
    orderBy: [{ instalacao: "asc" }, { anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  const planos: Plano[] = [];
  const semUc = new Map<string, number>();

  for (const b of orfas) {
    const uc = await prisma.consumerUnit.findFirst({
      where: whereCodigoUc(b.instalacao!),
      select: { id: true, nome: true },
    });
    if (!uc) {
      semUc.set(b.instalacao!, (semUc.get(b.instalacao!) ?? 0) + 1);
      continue;
    }
    // A bill é única por (UC, ano, mês). Se a UC já tem a competência, vincular
    // estouraria a constraint — e escolher qual das duas vale é decisão humana.
    const ocupada = await prisma.consumerBill.findUnique({
      where: {
        consumerUnitId_anoReferencia_mesReferencia: {
          consumerUnitId: uc.id, anoReferencia: b.anoReferencia, mesReferencia: b.mesReferencia,
        },
      },
      select: { id: true, instalacao: true, valorTotal: true },
    });
    planos.push({
      billId: b.id, instalacao: b.instalacao!, ano: b.anoReferencia, mes: b.mesReferencia,
      ucId: uc.id, ucNome: uc.nome, pdfUrl: b.pdfUrl,
      acao: ocupada ? "conflito" : "vincular",
      motivo: ocupada ? `a UC já tem ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} (instalacao ${ocupada.instalacao}, total ${ocupada.valorTotal})` : undefined,
      conflitoBillId: ocupada?.id,
    });
  }

  const vincular = planos.filter((p) => p.acao === "vincular");
  const conflitos = planos.filter((p) => p.acao === "conflito");

  console.log(`órfãs no banco: ${orfas.length}`);
  console.log(`  sem UC no cadastro (ficam como estão): ${[...semUc.values()].reduce((a, b) => a + b, 0)} em ${semUc.size} instalações`);
  console.log(`  VINCULÁVEIS: ${vincular.length}`);
  console.log(`  CONFLITO (competência já ocupada): ${conflitos.length}`);

  const porUc = new Map<string, Plano[]>();
  vincular.forEach((p) => porUc.set(p.ucNome, [...(porUc.get(p.ucNome) ?? []), p]));
  console.log("\n── a vincular ──");
  for (const [nome, ps] of porUc) {
    console.log(`  ${nome} (${ps[0].instalacao}): ${ps.length} — ${ps.map((p) => `${p.ano}-${String(p.mes).padStart(2, "0")}`).join(", ")}`);
  }

  if (conflitos.length) {
    console.log("\n── conflitos (NADA será feito, decisão humana) ──");
    conflitos.forEach((p) => console.log(`  ${p.ucNome} ${p.ano}-${String(p.mes).padStart(2, "0")} (órfã ${p.billId}): ${p.motivo}`));
  }

  if (!APLICAR) {
    console.log("\n(simulação — rode com --aplicar)");
    return;
  }

  console.log("\n── aplicando ──");
  let ok = 0;
  const falhas: string[] = [];
  for (const p of vincular) {
    try {
      // 1. Move o PDF de _pending/<instalacao>/ para bills/<ucId>/, o mesmo
      //    destino que o upload usa quando acha a UC.
      let novoPdfUrl = p.pdfUrl;
      const nomeArq = `${p.ano}-${String(p.mes).padStart(2, "0")}.pdf`;
      if (p.pdfUrl) {
        const arq = await readFromStorage(p.pdfUrl);
        if (arq && arq.size > 0) {
          const subdir = `bills/${p.ucId}`;
          await saveBufferToStorage(arq.data, subdir, nomeArq);
          novoPdfUrl = `/api/files/${subdir}/${nomeArq}`;
        } else {
          falhas.push(`${p.ucNome} ${p.ano}-${p.mes}: PDF não lido em ${p.pdfUrl} — vinculada mesmo assim, pdfUrl mantido`);
        }
      }

      // 2. Vincula.
      await prisma.consumerBill.update({
        where: { id: p.billId },
        data: { consumerUnitId: p.ucId, pdfUrl: novoPdfUrl },
      });

      // 3. Cobrança e pagável do investidor — o mesmo que importarFaturaPdf faz.
      await populateBillingFromBill(p.billId).catch((e) =>
        falhas.push(`${p.ucNome} ${p.ano}-${p.mes}: populateBilling falhou: ${e?.message ?? e}`));
      await syncInvestorPayablesFromBill(p.billId).catch((e) =>
        falhas.push(`${p.ucNome} ${p.ano}-${p.mes}: investorPayables falhou: ${e?.message ?? e}`));

      // 4. Só agora apaga a cópia em _pending, e só se a nova leu de volta.
      if (novoPdfUrl && novoPdfUrl !== p.pdfUrl) {
        const conferencia = await readFromStorage(novoPdfUrl);
        if (conferencia && conferencia.size > 0) await deleteUploadedFile(p.pdfUrl);
        else falhas.push(`${p.ucNome} ${p.ano}-${p.mes}: cópia nova não leu de volta — _pending mantido`);
      }
      ok++;
    } catch (e) {
      falhas.push(`${p.ucNome} ${p.ano}-${p.mes}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n✅ vinculadas: ${ok} de ${vincular.length}`);
  if (falhas.length) { console.log("⚠️ avisos:"); falhas.forEach((f) => console.log("  " + f)); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
