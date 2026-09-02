/**
 * Confere a conversão de células do export de tabelas
 * (`src/lib/exportar-tabela.ts`).
 *
 * O caso que justifica a guarda: um código de UC vem PONTUADO na tela
 * ("3.090.582.291"). Se a conversão o tratasse como número, o arquivo sairia
 * com o código errado e o operador não teria como perceber — o Excel mostraria
 * um número plausível. Toda regra nova de conversão precisa continuar deixando
 * código, CPF/CNPJ e competência como TEXTO.
 *
 * Roda sozinho: `npx tsx scripts/verifica-exportar-tabela.ts`.
 */
import { converterCelula } from "../src/lib/exportar-tabela";

let falhas = 0;

function ok(cond: boolean, titulo: string, detalhe = "") {
  if (cond) {
    console.log(`  ok   ${titulo}`);
  } else {
    falhas++;
    console.log(`  FALHA ${titulo}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function confere(entrada: string, esperado: string | number | null | "DATA") {
  const r = converterCelula(entrada);
  const acertou = esperado === "DATA" ? r instanceof Date : Object.is(r, esperado);
  ok(
    acertou,
    `"${entrada}"`,
    acertou ? "" : `saiu ${JSON.stringify(r)}, esperado ${JSON.stringify(esperado)}`,
  );
}

console.log("Identificadores continuam TEXTO (é o que a guarda protege)");
confere("3.090.582.291", "3.090.582.291"); // código de UC pontuado
confere("4003926123", "4003926123"); // código de UC sem pontuação
confere("12.345.678/0001-90", "12.345.678/0001-90"); // CNPJ
confere("123.456.789-00", "123.456.789-00"); // CPF
confere("08/2026", "08/2026"); // competência: virar data mostraria um dia inventado
confere("007", "007"); // zero à esquerda é código, não contagem

console.log("\nContagem vira número mesmo sem unidade (coluna só serve somada)");
confere("7", 7);
confere("0", 0);
confere("2026", 2026);

console.log("\nGrandezas viram número");
confere("R$ 1.234,56", 1234.56);
confere("R$ -89,10", -89.1);
confere("1.234,56", 1234.56);
confere("0,85", 0.85);
confere("-12,5", -12.5);
confere("1.500 kWh", 1500);
confere("33 kWp", 33);
confere("15%", 15);

console.log("\nDatas e vazios");
confere("31/12/2026", "DATA");
confere("-", null);
confere("—", null);
confere("", null);

console.log("\nTexto comum passa intacto");
confere("Ativa", "Ativa");
confere("RGE/CPFL", "RGE/CPFL");
confere("Usina Modelo 2", "Usina Modelo 2");

console.log("\nValor cru declarado pela tela ganha do texto");
{
  const r = converterCelula("R$ 1.234,56", "1234.5678");
  ok(r === 1234.5678, "data-export-valor preserva a precisão", `saiu ${JSON.stringify(r)}`);
}
{
  const r = converterCelula("31/12/2026", "2026-12-31");
  ok(r instanceof Date, "data-export-valor ISO vira Date", `saiu ${JSON.stringify(r)}`);
}

console.log(
  falhas === 0 ? "\n✅ Export de tabelas: tudo certo." : `\n❌ ${falhas} falha(s).`,
);
process.exit(falhas === 0 ? 0 : 1);
