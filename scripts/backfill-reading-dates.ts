/**
 * Backfill de dataLeituraAnterior/dataLeituraAtual nas faturas existentes.
 *
 * Sem chamar API paga: usa o `rawJson` já armazenado em cada ConsumerBill.
 *  - INFOSIMPLES: re-roda parseBillData → puxa leituras.leitura_anterior_data
 *    e leitura_atual_data.
 *  - UPLOAD_MANUAL: re-aplica a regex de datas sobre `lines` salvas em rawJson.
 *
 * Uso:
 *   npx tsx scripts/backfill-reading-dates.ts          # dry-run
 *   npx tsx scripts/backfill-reading-dates.ts --apply  # grava no banco
 */
import { prisma } from "../src/lib/prisma";
import { parseBillData, type InfosimplesBillData } from "../src/lib/infosimples";

const APPLY = process.argv.includes("--apply");

function parseDateBR(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])));
}

function extractFromUploadManualLines(lines: string[]): { ant: Date | null; atu: Date | null } {
  for (const line of lines) {
    // Lookahead (?!\/) — mesmo motivo do parser: o número de dias não pode ser
    // o início de outra data (ex.: "28" em "28/04/2026").
    const m = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,3})(?!\/)\b/);
    if (m) {
      // Convenção do parser: 1ª data = leitura ATUAL, 2ª = ANTERIOR (ordem RGE).
      return { atu: parseDateBR(m[1]), ant: parseDateBR(m[2]) };
    }
  }
  return { ant: null, atu: null };
}

interface Outcome {
  id: string;
  fonte: string | null;
  ref: string;
  ant: Date | null;
  atu: Date | null;
  status: "OK" | "SEM_RAW" | "JSON_INVALIDO" | "SEM_DATAS";
}

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: {
      OR: [{ dataLeituraAnterior: null }, { dataLeituraAtual: null }],
    },
    select: {
      id: true,
      fonteConsulta: true,
      anoReferencia: true,
      mesReferencia: true,
      rawJson: true,
    },
  });

  console.log(`Faturas a processar: ${bills.length}`);
  const outcomes: Outcome[] = [];

  for (const b of bills) {
    const ref = `${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}`;
    if (!b.rawJson) {
      outcomes.push({ id: b.id, fonte: b.fonteConsulta, ref, ant: null, atu: null, status: "SEM_RAW" });
      continue;
    }

    let ant: Date | null = null;
    let atu: Date | null = null;
    try {
      const raw = JSON.parse(b.rawJson) as Record<string, unknown>;
      const fonte = (b.fonteConsulta ?? "").toUpperCase();

      if (fonte === "UPLOAD_MANUAL") {
        const lines = Array.isArray(raw.lines) ? (raw.lines as string[]) : [];
        const r = extractFromUploadManualLines(lines);
        ant = r.ant;
        atu = r.atu;
      } else {
        // Default: tratar como Infosimples bill data e re-rodar o parser
        const parsed = parseBillData(raw as unknown as InfosimplesBillData);
        ant = parsed.dataLeituraAnterior ?? null;
        atu = parsed.dataLeituraAtual ?? null;
      }
    } catch {
      outcomes.push({ id: b.id, fonte: b.fonteConsulta, ref, ant: null, atu: null, status: "JSON_INVALIDO" });
      continue;
    }

    if (!ant && !atu) {
      outcomes.push({ id: b.id, fonte: b.fonteConsulta, ref, ant, atu, status: "SEM_DATAS" });
      continue;
    }

    if (APPLY) {
      await prisma.consumerBill.update({
        where: { id: b.id },
        data: { dataLeituraAnterior: ant, dataLeituraAtual: atu },
      });
    }
    outcomes.push({ id: b.id, fonte: b.fonteConsulta, ref, ant, atu, status: "OK" });
  }

  // Resumo
  const ok = outcomes.filter((o) => o.status === "OK").length;
  const semRaw = outcomes.filter((o) => o.status === "SEM_RAW").length;
  const jsonRuim = outcomes.filter((o) => o.status === "JSON_INVALIDO").length;
  const semDatas = outcomes.filter((o) => o.status === "SEM_DATAS").length;

  console.log();
  console.log(`=== RESUMO (${APPLY ? "APLICADO" : "DRY-RUN"}) ===`);
  console.log(`OK: ${ok}`);
  console.log(`Sem rawJson: ${semRaw}`);
  console.log(`JSON inválido: ${jsonRuim}`);
  console.log(`Sem datas no rawJson: ${semDatas}`);

  if (semDatas + semRaw + jsonRuim > 0) {
    console.log();
    console.log("=== FATURAS SEM DATAS (precisarão de re-sync via API) ===");
    for (const o of outcomes.filter((o) => o.status !== "OK")) {
      console.log(`  ${o.ref} | fonte=${o.fonte} | id=${o.id.slice(0, 12)} | ${o.status}`);
    }
  }

  if (!APPLY) {
    console.log();
    console.log(">>> Dry-run apenas. Rode com --apply pra gravar.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
