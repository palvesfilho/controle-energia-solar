/**
 * Backfill: aplica enrichBillFromPdfFallback em TODAS as ConsumerBill que:
 * - têm energiaInjetada > 0 (UC com geração GD)
 * - têm energiaInjetadaMedidorKwh = null (campo afetado pelo bug OCR)
 * - têm pdfUrl setado (PDF em disco pra reparsear)
 *
 * Não sobrescreve nenhum campo que já tinha valor.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { enrichBillFromPdfFallback } from "../src/lib/infosimples-pdf-fallback";

interface Stats {
  total: number;
  fixed: number;
  skipped: number;
  errors: number;
  reasons: Record<string, number>;
}

async function main() {
  const candidates = await prisma.consumerBill.findMany({
    where: {
      energiaInjetada: { gt: 0 },
      energiaInjetadaMedidorKwh: null,
      pdfUrl: { not: null },
    },
    select: {
      id: true,
      consumerUnitId: true,
      anoReferencia: true,
      mesReferencia: true,
      pdfUrl: true,
      energiaInjetada: true,
      fonteConsulta: true,
    },
  });

  console.log(`Candidatos: ${candidates.length}\n`);

  const stats: Stats = { total: candidates.length, fixed: 0, skipped: 0, errors: 0, reasons: {} };
  const errorList: { billId: string; ano: number; mes: number; error: string }[] = [];

  let i = 0;
  for (const c of candidates) {
    i++;
    const tag = `[${i}/${candidates.length}] ${c.consumerUnitId?.substring(0, 10) ?? "(plant)"}... ${c.anoReferencia}-${String(c.mesReferencia).padStart(2, "0")} fonte=${c.fonteConsulta ?? "-"}`;
    try {
      const fullBill = await prisma.consumerBill.findUniqueOrThrow({ where: { id: c.id } });
      const r = await enrichBillFromPdfFallback(
        fullBill as unknown as Record<string, unknown>,
        c.pdfUrl,
      );
      if (r.usedFallback) {
        const updates: Record<string, unknown> = {};
        for (const f of r.fieldsBackfilled) {
          updates[f] = (r.enriched as Record<string, unknown>)[f];
        }
        await prisma.consumerBill.update({ where: { id: c.id }, data: updates });
        stats.fixed++;
        console.log(`${tag} ✅ fix: ${r.fieldsBackfilled.join(", ")} → injMedidor=${updates.energiaInjetadaMedidorKwh}`);
      } else {
        stats.skipped++;
        const reason = r.reason ?? "PDF não preenchia campos faltantes";
        stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
        console.log(`${tag} ⏭️  ${reason}`);
      }
    } catch (e) {
      stats.errors++;
      const msg = e instanceof Error ? e.message : String(e);
      errorList.push({ billId: c.id, ano: c.anoReferencia, mes: c.mesReferencia, error: msg });
      console.log(`${tag} ❌ ${msg}`);
    }
  }

  console.log(`\n========== RESUMO ==========`);
  console.log(`Total candidatos: ${stats.total}`);
  console.log(`✅ Corrigidos:   ${stats.fixed}`);
  console.log(`⏭️  Pulados:      ${stats.skipped}`);
  console.log(`❌ Erros:        ${stats.errors}`);
  if (Object.keys(stats.reasons).length > 0) {
    console.log(`\nMotivos de pulo:`);
    for (const [k, v] of Object.entries(stats.reasons)) console.log(`  ${v}× ${k}`);
  }
  if (errorList.length > 0) {
    console.log(`\nErros detalhados:`);
    for (const e of errorList.slice(0, 20)) console.log(`  ${e.billId} ${e.ano}-${String(e.mes).padStart(2,"0")}: ${e.error}`);
    if (errorList.length > 20) console.log(`  ... +${errorList.length - 20}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("FATAL:", e); await prisma.$disconnect(); process.exit(1); });
