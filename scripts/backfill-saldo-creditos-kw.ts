/**
 * Backfill do saldo de créditos perdido pelo defeito "kW × kWh".
 *
 * O aviso da RGE imprime "Saldo em Energia da Instalação: Convencional
 * 61.344,6000000000 kW" — sem o "h". O parser do caminho INFOSIMPLES exigia
 * "kWh" e devolvia null CALADO, então a fatura ficava sem saldo e o Balanço
 * Mensal mostrava "-".
 *
 * Este script relê o PDF já salvo (não consulta a Infosimples — não custa) e
 * grava o saldo nas faturas afetadas.
 *
 *   npx tsx scripts/backfill-saldo-creditos-kw.ts          # dry-run
 *   npx tsx scripts/backfill-saldo-creditos-kw.ts --apply  # grava
 */
import { PrismaClient } from "@prisma/client";
import { readFromStorage } from "@/lib/file-storage";

const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function parseNumBR(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

async function textoPdf(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs DRENA o buffer: passar cópia.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let last = -1;
    for (const item of tc.items as Array<{ str: string; transform: number[] }>) {
      const y = Math.round(item.transform[5]);
      if (last !== -1 && Math.abs(y - last) > 2) out += "\n";
      out += item.str;
      last = y;
    }
    out += "\n";
  }
  return out;
}

async function main() {
  const alvos = await p.consumerBill.findMany({
    where: {
      saldoInstalacaoKwh: null,
      pdfUrl: { not: null },
      saldoPontaKwh: null,
      saldoForaPontaKwh: null,
      // 🔑 NAO exigir `energiaCompensada != null` aqui. A compensacao e outra
      // pergunta: uma fatura pode ter o saldo impresso e mesmo assim ter ficado
      // sem a compensacao lida. Com aquela exigencia o script via 13 candidatas
      // e deixava 354 de fora — entre elas a CLINICA RAD. CARIDADE 08/2026,
      // cujo PDF traz "Saldo em Energia ... 55.857,64 kW" e que so nao entrava
      // porque a compensacao tambem estava nula.
      // Quem nao tiver a linha no PDF cai em "sem linha" e nao e tocado, entao
      // alargar o filtro nao grava nada indevido — so custa a leitura do PDF.
    },
    include: { consumerUnit: { select: { codigoUc: true, nome: true } } },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
  });
  console.log(`Candidatas: ${alvos.length}${APPLY ? "" : "  (DRY-RUN)"}\n`);

  let gravadas = 0, semLinha = 0, semPdf = 0;
  for (const b of alvos) {
    const ref = `${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}`;
    const tag = `${b.consumerUnit?.codigoUc ?? "?"} ${b.consumerUnit?.nome ?? "(sem UC)"} ${ref}`;
    const r = await readFromStorage(b.pdfUrl!.replace("/api/files/", ""));
    if (!r) { console.log(`  [sem PDF]     ${tag}`); semPdf++; continue; }
    let txt: string;
    try { txt = await textoPdf(r.data); }
    catch (e) { console.log(`  [erro PDF]    ${tag} — ${(e as Error).message}`); semPdf++; continue; }

    const m = txt.match(/saldo em energia[^0-9]*([\d.]+(?:,\d+)?)\s*kwh?/i);
    if (!m) { console.log(`  [sem linha]   ${tag}`); semLinha++; continue; }
    const saldo = parseNumBR(m[1]);

    const mExp = txt.match(/saldo a expirar[^0-9]*([\d.]+(?:,\d+)?)\s*kwh?/i);
    const expirar = mExp ? parseNumBR(mExp[1]) : null;

    console.log(`  [saldo ${saldo.toLocaleString("pt-BR")} kWh]  ${tag}`);
    if (APPLY) {
      await p.consumerBill.update({
        where: { id: b.id },
        data: {
          saldoInstalacaoKwh: saldo,
          saldoCreditos: saldo,
          ...(b.saldoExpirarProxMesKwh === null && expirar !== null
            ? { saldoExpirarProxMesKwh: expirar }
            : {}),
        },
      });
    }
    gravadas++;
  }

  console.log(`\n${APPLY ? "Gravadas" : "Gravaria"}: ${gravadas} | sem linha de saldo no PDF: ${semLinha} | PDF ausente/ilegível: ${semPdf}`);
  await p.$disconnect();
}
main();
