/**
 * Teste de regressão do parser da NOVA PALMA ENERGIA.
 *
 * Roda o parseFaturaPdf real (o mesmo do upload manual) contra a pasta de PDFs
 * e confere os totais apurados à mão nas 12 faturas de 07/2025 a 06/2026 da UC
 * 21.779.063-74 (Fundação Antonio Meneghetti, Restinga Sêca/RS).
 *
 * Uso: npx tsx scripts/test-nova-palma-parser.ts [pasta]
 *      (default: ../faturas_nova_palma)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFaturaPdf, type ParsedFaturaPdf } from "../src/lib/fatura-pdf-parser";

/** Totais conferidos manualmente sobre as 12 faturas — não alterar sem reconferir. */
const ESPERADO = { faturas: 12, consumo: 56713, pago: 40086.62, compensado: 23451, cip: 1800.92 };

const fmt = (n: number | null | undefined, casas = 0) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

async function main() {
  const dir = resolve(process.argv[2] ?? join(__dirname, "..", "..", "faturas_nova_palma"));
  const pdfs = readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 0) {
    console.error(`Nenhum PDF em ${dir}`);
    process.exit(1);
  }

  const faturas: ParsedFaturaPdf[] = [];
  for (const nome of pdfs) {
    const parsed = await parseFaturaPdf(new Uint8Array(readFileSync(join(dir, nome))));
    faturas.push(parsed);
  }
  faturas.sort(
    (a, b) =>
      a.bill.anoReferencia * 100 + a.bill.mesReferencia -
      (b.bill.anoReferencia * 100 + b.bill.mesReferencia),
  );

  console.table(
    faturas.map((f) => ({
      comp: `${String(f.bill.mesReferencia).padStart(2, "0")}/${f.bill.anoReferencia}`,
      UC: f.codigoInstalacao,
      dias: f.bill.diasFaturamento,
      consumo: f.bill.consumoKwh,
      compensado: f.bill.energiaCompensada,
      injMedidor: f.bill.energiaInjetadaMedidorKwh,
      saldo: f.bill.saldoInstalacaoKwh,
      bandeira: f.bill.bandeiraTarifaria ?? "—",
      CIP: f.bill.iluminacaoPublicaCip,
      total: f.bill.valorTotal,
      pago: f.bill.contaPaga ? "sim" : "não",
      hist: f.bill.historicoConsumo ? JSON.parse(f.bill.historicoConsumo).length : 0,
      avisos: f.avisos?.length ?? 0,
    })),
  );

  const soma = (fn: (f: ParsedFaturaPdf) => number | null | undefined) =>
    faturas.reduce((a, f) => a + (fn(f) ?? 0), 0);

  const consumoTotal = soma((f) => f.bill.consumoKwh);
  const pagoTotal = soma((f) => f.bill.valorTotal);
  const compensadoTotal = soma((f) => f.bill.energiaCompensada);
  const cipTotal = soma((f) => f.bill.iluminacaoPublicaCip);
  const diasTotal = soma((f) => f.bill.diasFaturamento);

  console.log("\n--- CONSOLIDADO ---");
  console.log(`consumo total ......... ${fmt(consumoTotal)} kWh`);
  console.log(`consumo médio 30d ..... ${fmt(Math.round((consumoTotal / diasTotal) * 30))} kWh`);
  console.log(`total pago ............ R$ ${fmt(pagoTotal, 2)}`);
  console.log(`custo médio ........... R$ ${(pagoTotal / consumoTotal).toFixed(4)}/kWh`);
  console.log(`compensado ............ ${fmt(compensadoTotal)} kWh (${((compensadoTotal / consumoTotal) * 100).toFixed(1)}%)`);
  console.log(`CIP no ano ............ R$ ${fmt(cipTotal, 2)}`);

  const avisos = faturas.flatMap((f) =>
    (f.avisos ?? []).map((a) => `${String(f.bill.mesReferencia).padStart(2, "0")}/${f.bill.anoReferencia}: ${a}`),
  );
  console.log("\n--- AVISOS ---");
  if (avisos.length === 0) console.log("(nenhum)");
  else avisos.forEach((a) => console.log(`  ⚠ ${a}`));

  // A identidade "comprado + compensado = consumo" já roda dentro do parser e
  // vira aviso; aqui checamos que o ÚNICO aviso esperado é a troca de medidor.
  const checks: Array<[string, boolean]> = [
    [`${ESPERADO.faturas} faturas lidas`, faturas.length === ESPERADO.faturas],
    [`consumo total = ${ESPERADO.consumo} kWh`, consumoTotal === ESPERADO.consumo],
    [`total pago = R$ ${ESPERADO.pago}`, Math.abs(pagoTotal - ESPERADO.pago) < 0.01],
    [`compensado = ${ESPERADO.compensado} kWh`, compensadoTotal === ESPERADO.compensado],
    [`CIP = R$ ${ESPERADO.cip}`, Math.abs(cipTotal - ESPERADO.cip) < 0.01],
    ["UC extraída em todas", faturas.every((f) => !!f.codigoInstalacao)],
    ["competência + venc + valor em todas", faturas.every((f) => f.bill.mesReferencia > 0 && f.bill.vencimento && f.bill.valorTotal)],
    ["histórico de 13 meses em todas", faturas.every((f) => (f.bill.historicoConsumo ? JSON.parse(f.bill.historicoConsumo).length : 0) === 13)],
    ["dias faturados em todas", faturas.every((f) => f.bill.diasFaturamento != null)],
    ["contaPaga = true em todas", faturas.every((f) => f.bill.contaPaga)],
    ["nenhuma conferência aritmética falhou", !avisos.some((a) => a.includes("Conferência falhou"))],
    ["troca de medidor sinalizada em 11/2025", avisos.some((a) => a.startsWith("11/2025") && a.includes("troca de medidor"))],
  ];

  console.log("\n--- CONFERÊNCIAS ---");
  checks.forEach(([nome, ok]) => console.log(`${ok ? "OK    " : "FALHOU"} ${nome}`));
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
