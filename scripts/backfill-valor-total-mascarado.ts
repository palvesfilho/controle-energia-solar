/**
 * Backfill de `ConsumerBill.valorTotal` nas faturas em que a RGE MASCAROU o
 * total no cabeçalho (`R$ **********`, que ela imprime quando há débito em
 * aberto) e a página 2 veio sem camada de texto.
 *
 * Nessas faturas o total ficava `null`, a tela de Fechamento Mensal marcava
 * "Sem valor total" e a UC aparecia **com erro** mesmo com a cobrança correta —
 * é o que acontece com as contas zeradas por "Devol Pagamento Indevido"
 * ("Conta quitada, em razão de crédito de valor faturado à maior").
 *
 * Lê pela MESMA função do parser (`extrairTotalPelaLinhaDeTributos`), que
 * localiza a linha de totais do quadro de tributos validando a coluna do ICMS.
 *
 * Uso:
 *   npx tsx scripts/backfill-valor-total-mascarado.ts            # dry-run
 *   npx tsx scripts/backfill-valor-total-mascarado.ts --apply    # grava e recalcula
 */
import { prisma } from "../src/lib/prisma";
import { extrairTotalPelaLinhaDeTributos } from "../src/lib/fatura-pdf-parser";
import { populateBillingFromBill } from "../src/lib/billing-populate";

const APLICAR = process.argv.includes("--apply");
const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function linhasDoRawJson(rawJson: string): string[] {
  try {
    const obj = JSON.parse(rawJson);
    if (Array.isArray(obj?.lines)) return obj.lines.map(String);
  } catch {
    /* ignora */
  }
  return rawJson.split('","');
}

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: { valorTotal: null, rawJson: { not: null } },
    select: {
      id: true, icms: true, rawJson: true, consumerUnitId: true,
      mesReferencia: true, anoReferencia: true,
      consumerUnit: { select: { codigoUc: true, nome: true, regraRemuneracao: true } },
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
  });

  console.log(`Faturas sem valorTotal: ${bills.length}`);
  console.log(APLICAR ? "MODO: GRAVANDO" : "MODO: dry-run (nada é gravado)");
  console.log("");

  let recuperadas = 0, zeradas = 0, semAncora = 0, recalculadas = 0;

  for (const b of bills) {
    const total = extrairTotalPelaLinhaDeTributos(linhasDoRawJson(b.rawJson ?? ""), b.icms);
    if (total == null) { semAncora++; continue; }
    recuperadas++;
    if (Math.abs(total) < 0.005) zeradas++;

    const antes = b.consumerUnitId
      ? await prisma.consumerUnitBilling.findUnique({
          where: { consumerUnitId_ano_mes: { consumerUnitId: b.consumerUnitId, ano: b.anoReferencia, mes: b.mesReferencia } },
          select: { valorCobranca: true },
        })
      : null;

    let depois: number | null = null;
    if (APLICAR) {
      await prisma.consumerBill.update({ where: { id: b.id }, data: { valorTotal: total } });
      if (b.consumerUnitId) {
        const r = await populateBillingFromBill(b.id).catch(() => null);
        if (r) { depois = r.valorCobranca; recalculadas++; }
      }
    }

    console.log(
      [
        `${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}`,
        (b.consumerUnit?.codigoUc ?? "sem UC").padEnd(13),
        (b.consumerUnit?.nome ?? "—").slice(0, 24).padEnd(24),
        `total ${brl(total).padStart(12)}`,
        `cobrança ${brl(antes?.valorCobranca).padStart(12)} → ${brl(depois).padStart(12)}`,
      ].join("  "),
    );
  }

  console.log("");
  console.log(`Total recuperado em ${recuperadas} faturas (${zeradas} delas com R$ 0,00 — conta quitada).`);
  console.log(`Sem âncora de ICMS pra validar (seguem null): ${semAncora}`);
  console.log(`Cobranças recalculadas: ${recalculadas}`);
}

main().finally(() => prisma.$disconnect());
