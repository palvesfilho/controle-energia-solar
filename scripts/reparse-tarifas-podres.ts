/**
 * Reparse do PDF em TODAS as faturas com tarifa implausível (OCR rotacionado).
 *
 *   npx tsx scripts/reparse-tarifas-podres.ts            (dry-run)
 *   npx tsx scripts/reparse-tarifas-podres.ts --apply     (escreve)
 *
 * Ordem: as faturas de usina em USINA_CONSUMO_DESCONTADO vêm primeiro — são as
 * únicas em que o preço do kWh vira dinheiro (parcela de consumo instantâneo).
 *
 * Respeita `tarifasManuaisEm`: tarifa digitada à mão nunca é sobrescrita.
 */
import { prisma } from "../src/lib/prisma";
import { parseFaturaPdf } from "../src/lib/fatura-pdf-parser";
import { readFromStorage } from "../src/lib/file-storage";
import { populateBillingFromBill } from "../src/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "../src/lib/investor-payables";
import { precoKwhSolar, PRECO_KWH_MAX } from "../src/lib/preco-kwh";

const APPLY = process.argv.includes("--apply");
/** Só as faturas de usina em consumo descontado — as que mexem em cobrança. */
const SO_PRIORIDADE = process.argv.includes("--prioridade");

/** Cobrança do cliente naquele mês, para comparar antes × depois. */
async function cobrancaDo(
  consumerUnitId: string | null,
  ano: number,
  mes: number,
): Promise<{ valorCobranca: number | null; instantaneoKwh: number | null } | null> {
  if (!consumerUnitId) return null;
  const cub = await prisma.consumerUnitBilling.findFirst({
    where: { consumerUnitId, ano, mes },
    select: { valorCobranca: true },
  });
  const bill = await prisma.consumerBill.findFirst({
    where: { consumerUnitId, anoReferencia: ano, mesReferencia: mes },
    select: { consumoInstantaneoKwh: true },
  });
  return {
    valorCobranca: cub?.valorCobranca ?? null,
    instantaneoKwh: bill?.consumoInstantaneoKwh ?? null,
  };
}

interface Linha {
  id: string;
  uc: string;
  ref: string;
  prioridade: boolean;
  antes: number | null;
  depois: number | null;
  status: "RECUPERA" | "PDF NAO RESOLVE" | "SEM PDF" | "PARSE FALHOU" | "MANUAL";
  detalhe?: string;
}

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: {
      OR: [
        { tarifaTusdComTributos: { gt: PRECO_KWH_MAX } },
        { tarifaTeComTributos: { gt: PRECO_KWH_MAX } },
      ],
    },
    select: {
      id: true,
      consumerUnitId: true,
      pdfUrl: true,
      anoReferencia: true,
      mesReferencia: true,
      tarifasManuaisEm: true,
      tarifaTE: true,
      tarifaTUSD: true,
      tarifaTeComTributos: true,
      tarifaTusdComTributos: true,
      consumoTeForaPontaKwh: true,
      consumoTeForaPontaValor: true,
      consumoTusdForaPontaKwh: true,
      consumoTusdForaPontaValor: true,
      tarifaTeForaPonta: true,
      tarifaTusdForaPonta: true,
      consumerUnit: {
        select: {
          codigoUc: true,
          nome: true,
          plant: { select: { name: true, regraInstalacao: true } },
        },
      },
    },
  });

  // Prioridade: UC de usina em consumo descontado (onde o preço vira dinheiro).
  const ordenadas = bills.sort((a, b) => {
    const pa = a.consumerUnit?.plant?.regraInstalacao === "USINA_CONSUMO_DESCONTADO" ? 0 : 1;
    const pb = b.consumerUnit?.plant?.regraInstalacao === "USINA_CONSUMO_DESCONTADO" ? 0 : 1;
    return pa - pb;
  });

  const alvo = SO_PRIORIDADE
    ? ordenadas.filter(
        (b) => b.consumerUnit?.plant?.regraInstalacao === "USINA_CONSUMO_DESCONTADO",
      )
    : ordenadas;

  console.log(
    `${APPLY ? "APLICANDO" : "DRY-RUN"} — ${alvo.length} fatura(s)` +
      `${SO_PRIORIDADE ? " (SÓ PRIORIDADE: usina em consumo descontado)" : " com tarifa implausível"}\n`,
  );

  const linhas: Linha[] = [];

  for (const b of alvo) {
    const prioridade =
      b.consumerUnit?.plant?.regraInstalacao === "USINA_CONSUMO_DESCONTADO";
    const ref = `${b.mesReferencia}/${b.anoReferencia}`;
    const uc = b.consumerUnit?.nome ?? b.consumerUnit?.codigoUc ?? "—";
    const antes = precoKwhSolar(b as never).precoKwh;

    if (b.tarifasManuaisEm) {
      linhas.push({ id: b.id, uc, ref, prioridade, antes, depois: antes, status: "MANUAL" });
      continue;
    }
    if (!b.pdfUrl) {
      linhas.push({ id: b.id, uc, ref, prioridade, antes, depois: null, status: "SEM PDF" });
      continue;
    }
    const file = await readFromStorage(b.pdfUrl);
    if (!file) {
      linhas.push({
        id: b.id, uc, ref, prioridade, antes, depois: null,
        status: "SEM PDF", detalhe: "PDF não está no storage",
      });
      continue;
    }
    let novo: Record<string, unknown>;
    try {
      novo = (await parseFaturaPdf(new Uint8Array(file.data))).bill as never;
    } catch (e) {
      linhas.push({
        id: b.id, uc, ref, prioridade, antes, depois: null,
        status: "PARSE FALHOU", detalhe: e instanceof Error ? e.message : "erro",
      });
      continue;
    }

    // Guarda do fallback: PDF tem que ser da MESMA referência.
    if (
      novo.mesReferencia !== b.mesReferencia ||
      novo.anoReferencia !== b.anoReferencia
    ) {
      linhas.push({
        id: b.id, uc, ref, prioridade, antes, depois: null,
        status: "PDF NAO RESOLVE",
        detalhe: `PDF é de ${novo.mesReferencia}/${novo.anoReferencia}`,
      });
      continue;
    }

    const depoisRes = precoKwhSolar(novo as never);
    const ok = depoisRes.precoKwh != null && !depoisRes.implausivel;
    linhas.push({
      id: b.id, uc, ref, prioridade, antes,
      depois: depoisRes.precoKwh,
      status: ok ? "RECUPERA" : "PDF NAO RESOLVE",
      detalhe: ok ? undefined : (depoisRes.motivo ?? "PDF também sem tarifa boa"),
    });

    if (APPLY && ok) {
      const antesCobranca = await cobrancaDo(b.consumerUnitId, b.anoReferencia, b.mesReferencia);
      const { pdfUrl: _p, fonteConsulta: _f, ...billData } = novo;
      void _p; void _f;
      await prisma.consumerBill.update({
        where: { id: b.id },
        data: { ...billData, syncedAt: new Date() } as never,
      });
      await populateBillingFromBill(b.id).catch(() => {});
      await syncInvestorPayablesFromBill(b.id).catch(() => {});
      const depoisCobranca = await cobrancaDo(b.consumerUnitId, b.anoReferencia, b.mesReferencia);

      const mudou =
        antesCobranca?.valorCobranca !== depoisCobranca?.valorCobranca ||
        antesCobranca?.instantaneoKwh !== depoisCobranca?.instantaneoKwh;
      console.log(
        `  COBRANCA ${uc} ${ref}: R$ ${antesCobranca?.valorCobranca?.toFixed(2) ?? "—"} -> ` +
          `R$ ${depoisCobranca?.valorCobranca?.toFixed(2) ?? "—"} | instantaneo ` +
          `${antesCobranca?.instantaneoKwh ?? "—"} -> ${depoisCobranca?.instantaneoKwh ?? "—"}` +
          `${mudou ? "   <<< MUDOU" : "   (sem mudanca)"}`,
      );
    }
  }

  const por = (s: Linha["status"]) => linhas.filter((l) => l.status === s);
  console.log("PRIORIDADE (usina em consumo descontado — preço vira dinheiro):");
  const prio = linhas.filter((l) => l.prioridade);
  if (!prio.length) console.log("  nenhuma");
  for (const l of prio) {
    console.log(
      `  [${l.status}] ${l.uc} ${l.ref} | antes=${l.antes ?? "barrado"} → depois=${l.depois?.toFixed(4) ?? "—"}${l.detalhe ? ` (${l.detalhe})` : ""}`,
    );
  }

  console.log(`\nRESUMO das ${linhas.length}:`);
  console.log(`  ✅ RECUPERA pelo PDF ...... ${por("RECUPERA").length}`);
  console.log(`  ⚠️  PDF NÃO RESOLVE ....... ${por("PDF NAO RESOLVE").length}  (precisam de digitação manual)`);
  console.log(`  ⚠️  SEM PDF ............... ${por("SEM PDF").length}  (precisam de digitação manual)`);
  console.log(`  ⚠️  PARSE FALHOU .......... ${por("PARSE FALHOU").length}`);
  console.log(`  🔒 MANUAL (preservadas) ... ${por("MANUAL").length}`);

  const pendentes = [...por("PDF NAO RESOLVE"), ...por("SEM PDF"), ...por("PARSE FALHOU")];
  if (pendentes.length) {
    console.log(`\nAs que sobram para digitar à mão:`);
    for (const l of pendentes) {
      console.log(`  · ${l.uc} ${l.ref} — ${l.detalhe ?? l.status}`);
    }
  }

  if (!APPLY) console.log(`\nDRY-RUN — nada foi escrito. Use --apply para gravar.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
