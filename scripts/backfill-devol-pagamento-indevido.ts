/**
 * Backfill de `ConsumerBill.devolPagamentoIndevido` + recálculo das cobranças.
 *
 * O campo nasceu depois que essas faturas foram importadas, então o valor existe
 * só dentro do `rawJson` (as linhas do PDF, gravadas pelos três caminhos:
 * UPLOAD_MANUAL, INFOSIMPLES e CPFL_PORTAL). Aqui relemos aquelas linhas com a
 * MESMA função do parser — `extrairDevolPagamentoIndevido` — gravamos o campo e
 * recalculamos o ConsumerUnitBilling do mês.
 *
 * Sem isto, só as faturas importadas DEPOIS do deploy somariam a devolução, e o
 * mesmo cliente seria cobrado por duas regras diferentes em meses vizinhos.
 *
 * Sempre grava um CSV com o antes/depois de cada cobrança — é o documento pra
 * cobrar retroativamente quem já foi faturado a menos. UC sem regra de
 * remuneração implementada entra no CSV com o motivo, e não com silêncio.
 *
 * Uso:
 *   npx tsx scripts/backfill-devol-pagamento-indevido.ts            # dry-run
 *   npx tsx scripts/backfill-devol-pagamento-indevido.ts --apply    # grava e recalcula
 */
import { writeFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { extrairDevolPagamentoIndevido } from "../src/lib/fatura-pdf-parser";
import { populateBillingFromBill } from "../src/lib/billing-populate";

const APLICAR = process.argv.includes("--apply");

const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** Número no formato que o Excel pt-BR lê como número (vírgula decimal). */
const num = (v: number | null | undefined) =>
  v == null ? "" : v.toFixed(2).replace(".", ",");

/**
 * As linhas do PDF ficam em `rawJson.lines`. Se o JSON não trouxer o array,
 * reconstruímos pseudo-linhas quebrando nos separadores de string — é onde o
 * parser original as separou.
 */
function linhasDoRawJson(rawJson: string): string[] {
  try {
    const obj = JSON.parse(rawJson);
    if (Array.isArray(obj?.lines)) return obj.lines.map(String);
  } catch {
    /* rawJson truncado/inválido — cai no split abaixo */
  }
  return rawJson.split('","');
}

interface LinhaRelatorio {
  codigoUc: string;
  nome: string;
  competencia: string;
  regra: string;
  valorImpresso: number | null;
  devolucao: number;
  cobrancaAntes: number | null;
  cobrancaDepois: number | null;
  diferenca: number | null;
  situacao: string;
}

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: { rawJson: { contains: "Devol", mode: "insensitive" } },
    select: {
      id: true,
      consumerUnitId: true,
      mesReferencia: true,
      anoReferencia: true,
      valorTotal: true,
      devolPagamentoIndevido: true,
      rawJson: true,
      consumerUnit: { select: { codigoUc: true, nome: true, regraRemuneracao: true } },
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
  });

  console.log(`Faturas com "Devol" no rawJson: ${bills.length}`);
  console.log(APLICAR ? "MODO: GRAVANDO" : "MODO: dry-run (nada é gravado)");
  console.log("");

  const relatorio: LinhaRelatorio[] = [];
  let gravadas = 0;
  let recalculadas = 0;

  for (const b of bills) {
    const devolucao = extrairDevolPagamentoIndevido(linhasDoRawJson(b.rawJson ?? ""));
    if (devolucao == null) continue;
    const uc = b.consumerUnit;
    const valorDevolvido = Math.abs(devolucao);

    const antes = b.consumerUnitId
      ? await prisma.consumerUnitBilling.findUnique({
          where: {
            consumerUnitId_ano_mes: {
              consumerUnitId: b.consumerUnitId,
              ano: b.anoReferencia,
              mes: b.mesReferencia,
            },
          },
          select: { valorCobranca: true, asaasChargeId: true },
        })
      : null;

    if (APLICAR) {
      await prisma.consumerBill.update({
        where: { id: b.id },
        data: { devolPagamentoIndevido: devolucao },
      });
      gravadas++;
    }

    let cobrancaDepois: number | null = null;
    let situacao = "";
    if (!b.consumerUnitId) {
      situacao = "Fatura sem UC vinculada — nenhuma cobrança a recalcular";
    } else if (!APLICAR) {
      situacao = "dry-run — não recalculado";
    } else {
      const r = await populateBillingFromBill(b.id).catch((e: Error) => {
        situacao = `ERRO no recálculo: ${e.message}`;
        return null;
      });
      if (r) {
        cobrancaDepois = r.valorCobranca;
        recalculadas++;
        situacao = r.skipped
          ? `Não recalculado: ${r.skipReason}`
          : r.valorCobranca == null
            ? `Cobrança não calculada: ${r.problemas.join(" / ") || "sem motivo informado"}`
            : "Recalculado";
      }
    }

    const diferenca =
      cobrancaDepois != null ? cobrancaDepois - (antes?.valorCobranca ?? 0) : null;

    relatorio.push({
      codigoUc: uc?.codigoUc ?? "",
      nome: uc?.nome ?? "(fatura sem UC)",
      competencia: `${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}`,
      regra: uc?.regraRemuneracao ?? "(sem regra cadastrada)",
      valorImpresso: b.valorTotal,
      devolucao: valorDevolvido,
      cobrancaAntes: antes?.valorCobranca ?? null,
      cobrancaDepois,
      diferenca,
      situacao: antes?.asaasChargeId ? `${situacao} [já no Asaas]` : situacao,
    });

    console.log(
      [
        `${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}`,
        (uc?.codigoUc ?? "sem UC").padEnd(13),
        (uc?.nome ?? "—").slice(0, 24).padEnd(24),
        `devol ${brl(valorDevolvido).padStart(12)}`,
        `${brl(antes?.valorCobranca).padStart(12)} → ${brl(cobrancaDepois).padStart(12)}`,
        situacao,
      ].join("  "),
    );
  }

  // --- CSV ---
  const cab = [
    "Codigo UC", "Nome", "Competencia", "Regra de remuneracao",
    "Valor impresso da fatura", "Devolucao pagamento indevido",
    "Cobranca antes", "Cobranca depois", "Diferenca a recuperar", "Situacao",
  ];
  const linhas = relatorio.map((r) =>
    [
      r.codigoUc, r.nome, r.competencia, r.regra,
      num(r.valorImpresso), num(r.devolucao),
      num(r.cobrancaAntes), num(r.cobrancaDepois), num(r.diferenca),
      r.situacao,
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(";"),
  );
  const carimbo = new Date().toISOString().slice(0, 10);
  const arquivo = `devolucao-pagamento-indevido-${carimbo}${APLICAR ? "" : "-DRYRUN"}.csv`;
  // BOM pra o Excel abrir os acentos certos.
  writeFileSync(arquivo, "\uFEFF" + [cab.join(";"), ...linhas].join("\r\n"), "utf8");

  const totalDevolvido = relatorio.reduce((s, r) => s + r.devolucao, 0);
  const totalRecuperar = relatorio.reduce((s, r) => s + (r.diferenca ?? 0), 0);
  console.log("");
  console.log(`Faturas com devolução lida: ${relatorio.length} · campo gravado: ${gravadas} · cobranças recalculadas: ${recalculadas}`);
  console.log(`Soma das devoluções: ${brl(totalDevolvido)}`);
  console.log(`Diferença total nas cobranças recalculadas: ${brl(totalRecuperar)}`);
  console.log(`Relatório: ${arquivo}`);
}

main().finally(() => prisma.$disconnect());
