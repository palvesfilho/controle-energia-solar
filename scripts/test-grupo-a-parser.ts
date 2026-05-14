/**
 * Smoke test do parser Grupo A.
 * Uso: npx tsx scripts/test-grupo-a-parser.ts <caminho-do-pdf>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFaturaPdf } from "../src/lib/fatura-pdf-parser";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npx tsx scripts/test-grupo-a-parser.ts <caminho-do-pdf>");
    process.exit(1);
  }

  const buffer = new Uint8Array(readFileSync(resolve(file)));
  const parsed = await parseFaturaPdf(buffer);

  console.log("=== HEADER ===");
  console.log("codigoInstalacao:", parsed.codigoInstalacao);
  console.log("mes/ano:", parsed.bill.mesReferencia, "/", parsed.bill.anoReferencia);
  console.log("valorTotal:", parsed.bill.valorTotal);
  console.log("vencimento:", parsed.bill.vencimento);
  console.log("dias:", parsed.bill.diasFaturamento);

  console.log("\n=== GRUPO A ===");
  if (!parsed.grupoA) {
    console.log("(nada extraído — Grupo B ou detecção falhou)");
    return;
  }
  const g = parsed.grupoA;
  console.log("modalidade:", g.modalidade, "subgrupo:", g.subgrupo);
  console.log("tensao contratada (V):", g.tensaoNominalContratadaV);
  console.log("\n--- Demanda contratada ---");
  console.log("geração contratada (kW):", g.geracaoContratadaKw);
  console.log("demanda contratada (kW):", g.demandaContratadaKw);
  console.log("demanda contratada Ponta (kW):", g.demandaContratadaPontaKw);

  console.log("\n--- Demanda medida + ultrapassagem ---");
  console.log("demandaMedidaKw:", g.demandaMedidaKw);
  console.log("demandaMedidaPontaKw:", g.demandaMedidaPontaKw);
  console.log("demandaTusdValor:", g.demandaTusdValor);
  console.log("tarifaDemanda:", g.tarifaDemanda);
  console.log("demandaUltrapassagemKw:", g.demandaUltrapassagemKw);
  console.log("demandaUltrapassagemValor:", g.demandaUltrapassagemValor);

  console.log("\n--- TUSD-G (geração) ---");
  console.log("tusdGeracaoKw:", g.tusdGeracaoKw);
  console.log("tusdGeracaoValor:", g.tusdGeracaoValor);
  console.log("tarifaTusdGeracao:", g.tarifaTusdGeracao);

  console.log("\n--- Consumo por posto ---");
  console.log("Ponta kWh:", g.consumoPontaKwh, " | FPonta kWh:", g.consumoForaPontaKwh);
  console.log("TE Ponta:", g.consumoTePontaKwh, "kWh / R$", g.consumoTePontaValor);
  console.log("TE FPonta:", g.consumoTeForaPontaKwh, "kWh / R$", g.consumoTeForaPontaValor);
  console.log("TUSD Ponta:", g.consumoTusdPontaKwh, "kWh / R$", g.consumoTusdPontaValor);
  console.log("TUSD FPonta:", g.consumoTusdForaPontaKwh, "kWh / R$", g.consumoTusdForaPontaValor);
  console.log("Tarifas TE: P=", g.tarifaTePonta, "FP=", g.tarifaTeForaPonta);
  console.log("Tarifas TUSD: P=", g.tarifaTusdPonta, "FP=", g.tarifaTusdForaPonta);

  console.log("\n--- Bandeira ---");
  console.log("adicional Ponta R$:", g.bandeiraValorPonta);
  console.log("adicional FPonta R$:", g.bandeiraValorForaPonta);
  console.log("crédito Ponta R$:", g.bandeiraCreditoPontaValor);
  console.log("crédito FPonta R$:", g.bandeiraCreditoForaPontaValor);

  console.log("\n--- Compensação Lei 14.300 (TUSD+TE somados) ---");
  console.log("Injeção Ponta:", g.injetadaPontaKwh, "kWh / R$", g.injetadaPontaValor);
  console.log("Injeção FPonta:", g.injetadaForaPontaKwh, "kWh / R$", g.injetadaForaPontaValor);

  console.log("\n--- Saldo ---");
  console.log("saldoPontaKwh:", g.saldoPontaKwh);
  console.log("saldoForaPontaKwh:", g.saldoForaPontaKwh);

  console.log("\n--- Reativo excedente ---");
  console.log("Ponta kVAr:", g.reativoExcedentePontaKvar, "/ R$", g.reativoExcedentePontaValor);
  console.log("FPonta kVAr:", g.reativoExcedenteForaPontaKvar, "/ R$", g.reativoExcedenteForaPontaValor);

  console.log("\n--- Leituras (8 grandezas) ---");
  for (const l of g.leiturasMedidor) {
    console.log(
      `  ${l.grandeza} [${l.posto}] ${l.unidade}: ${l.leituraAnterior} -> ${l.leituraAtual} (× ${l.constante}) = ${l.consumo}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
