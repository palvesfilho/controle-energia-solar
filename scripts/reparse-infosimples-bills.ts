/**
 * Reparser todas as ConsumerBill com fonteConsulta=INFOSIMPLES usando o rawJson armazenado.
 * Corrige os campos de injeção (energiaCompensada, injetadaOuc*) após o fix do parser
 * que passou a reconhecer linhas com colunas deslocadas no OCR do Infosimples.
 *
 * Uso:
 *   npx tsx scripts/reparse-infosimples-bills.ts            # aplica
 *   npx tsx scripts/reparse-infosimples-bills.ts --dry-run  # só mostra o que mudaria
 */

import { parseBillData } from "../src/lib/infosimples";
import { prisma } from "../src/lib/prisma";
import { populateBillingFromBill } from "../src/lib/billing-populate";
const DRY_RUN = process.argv.includes("--dry-run");

interface Diff {
  id: string;
  codigoUc: string;
  ref: string;
  antes: {
    energiaCompensada: number | null;
    injetadaOucTeKwh: number | null;
    injetadaOucTusdKwh: number | null;
  };
  depois: {
    energiaCompensada: number | null;
    injetadaOucTeKwh: number | null;
    injetadaOucTusdKwh: number | null;
  };
}

const EPS = 0.5; // tolerância para considerar mudança relevante (kWh)

function same(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < EPS;
}

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: { fonteConsulta: "INFOSIMPLES", rawJson: { not: null } },
    include: { consumerUnit: { select: { codigoUc: true, nome: true } } },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
  });

  console.log(`Faturas INFOSIMPLES encontradas: ${bills.length}`);
  if (DRY_RUN) console.log("(--dry-run — nenhuma alteração será gravada)");

  const changed: Diff[] = [];
  let parseErrors = 0;

  for (const bill of bills) {
    if (!bill.rawJson) continue;
    let parsed: ReturnType<typeof parseBillData>;
    try {
      const raw = JSON.parse(bill.rawJson);
      parsed = parseBillData(raw);
    } catch (e) {
      parseErrors++;
      console.warn(
        `  ! erro re-parser bill ${bill.id} UC ${bill.consumerUnit?.codigoUc}: ${(e as Error).message}`
      );
      continue;
    }

    const mudou =
      !same(bill.energiaCompensada, parsed.energiaCompensada) ||
      !same(bill.injetadaOucTeKwh, parsed.injetadaOucTeKwh) ||
      !same(bill.injetadaOucTusdKwh, parsed.injetadaOucTusdKwh);

    if (!mudou) continue;

    const diff: Diff = {
      id: bill.id,
      codigoUc: bill.consumerUnit?.codigoUc ?? "?",
      ref: `${String(bill.mesReferencia).padStart(2, "0")}/${bill.anoReferencia}`,
      antes: {
        energiaCompensada: bill.energiaCompensada,
        injetadaOucTeKwh: bill.injetadaOucTeKwh,
        injetadaOucTusdKwh: bill.injetadaOucTusdKwh,
      },
      depois: {
        energiaCompensada: parsed.energiaCompensada,
        injetadaOucTeKwh: parsed.injetadaOucTeKwh,
        injetadaOucTusdKwh: parsed.injetadaOucTusdKwh,
      },
    };
    changed.push(diff);

    if (!DRY_RUN) {
      await prisma.consumerBill.update({
        where: { id: bill.id },
        data: {
          energiaInjetada: parsed.energiaInjetada,
          energiaCompensada: parsed.energiaCompensada,
          injetadaOucTeKwh: parsed.injetadaOucTeKwh,
          injetadaOucTeValor: parsed.injetadaOucTeValor,
          injetadaOucTusdKwh: parsed.injetadaOucTusdKwh,
          injetadaOucTusdValor: parsed.injetadaOucTusdValor,
          injetadaDetalhes: parsed.injetadaDetalhes,
        },
      });
      // Repopula ConsumerUnitBilling (valorEconomia/valorCobranca dependem dos valores de injeção)
      const pop = await populateBillingFromBill(bill.id);
      if (pop.skipped) {
        console.log(
          `  ${bill.consumerUnit?.codigoUc} ${bill.mesReferencia}/${bill.anoReferencia}: billing skip — ${pop.skipReason}`
        );
      }
    }
  }

  console.log("");
  console.log(`Mudanças detectadas: ${changed.length}`);
  console.log(`Erros de parse: ${parseErrors}`);
  console.log("");

  for (const d of changed) {
    console.log(`UC ${d.codigoUc} — ${d.ref}`);
    console.log(
      `  compensada: ${fmt(d.antes.energiaCompensada)} → ${fmt(d.depois.energiaCompensada)}`
    );
    console.log(
      `  TE: ${fmt(d.antes.injetadaOucTeKwh)} → ${fmt(d.depois.injetadaOucTeKwh)} | ` +
        `TUSD: ${fmt(d.antes.injetadaOucTusdKwh)} → ${fmt(d.depois.injetadaOucTusdKwh)}`
    );
  }

  console.log("");
  if (DRY_RUN) console.log("Dry-run concluído.");
  else console.log(`Atualizadas ${changed.length} faturas.`);
}

function fmt(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toFixed(2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
