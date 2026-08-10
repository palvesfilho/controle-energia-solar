/**
 * Confere a contagem de horas de sol usada pelo alerta de usina muda.
 *
 * Casos escritos à mão, com o resultado esperado calculado no papel. Se esta
 * conta errar, ou a frota inteira alerta de madrugada, ou uma usina parada
 * passa despercebida — os dois modos de falha custam caro.
 *
 * Janela solar: 05:00–20:00 BRT (15 h/dia).
 * Uso: npx tsx scripts/_verifica-horas-solares.ts
 */
import { horasSolaresEntre } from "../src/lib/janela-solar";

/** Constrói um instante a partir de hora BRT. */
function brt(dia: number, hora: number, minuto = 0): Date {
  return new Date(Date.UTC(2026, 7, dia, hora + 3, minuto, 0));
}

const casos: Array<{ nome: string; de: Date; ate: Date; esperado: number }> = [
  { nome: "meio-dia às 14h no mesmo dia", de: brt(10, 12), ate: brt(10, 14), esperado: 2 },
  { nome: "dia solar inteiro (05:00→20:00)", de: brt(10, 5), ate: brt(10, 20), esperado: 15 },
  { nome: "só madrugada (21h→04h) não conta nada", de: brt(10, 21), ate: brt(11, 4), esperado: 0 },
  { nome: "17h de um dia até 10h do seguinte", de: brt(10, 17), ate: brt(11, 10), esperado: 8 },
  { nome: "19h até 06h do dia seguinte", de: brt(10, 19), ate: brt(11, 6), esperado: 2 },
  { nome: "dois dias solares cheios", de: brt(10, 5), ate: brt(12, 5), esperado: 30 },
  { nome: "antes do nascer até depois do pôr", de: brt(10, 3), ate: brt(10, 22), esperado: 15 },
  { nome: "fim antes do início devolve zero", de: brt(10, 14), ate: brt(10, 12), esperado: 0 },
  { nome: "meia hora", de: brt(10, 9), ate: brt(10, 9, 30), esperado: 0.5 },
];

let falhas = 0;
console.log(`${"CASO".padEnd(42)} ${"ESPERADO".padStart(9)} ${"OBTIDO".padStart(8)}`);
for (const c of casos) {
  const obtido = horasSolaresEntre(c.de, c.ate);
  const ok = Math.abs(obtido - c.esperado) < 0.001;
  if (!ok) falhas++;
  console.log(
    `${c.nome.padEnd(42)} ${c.esperado.toFixed(1).padStart(9)} ${obtido.toFixed(1).padStart(8)}  ${ok ? "ok" : "✗ FALHOU"}`,
  );
}

// O limiar acordado: 8 horas de sol. Uma usina que emudece às 17h precisa
// atravessar a noite e chegar às 10h do dia seguinte pra alertar — nunca de
// madrugada.
console.log("\nQuando dispara uma usina que emudeceu às 17:00 (limiar 8h de sol):");
for (const [dia, hora] of [[10, 20], [11, 5], [11, 8], [11, 9], [11, 10], [11, 11]] as const) {
  const h = horasSolaresEntre(brt(10, 17), brt(dia, hora));
  console.log(
    `  ${String(dia).padStart(2, "0")}/08 ${String(hora).padStart(2, "0")}:00 → ${h.toFixed(1)}h de sol ${h >= 8 ? "→ ALERTA" : ""}`,
  );
}

console.log(falhas === 0 ? "\n✅ todos os casos passaram" : `\n❌ ${falhas} caso(s) falharam`);
process.exit(falhas === 0 ? 0 : 1);
