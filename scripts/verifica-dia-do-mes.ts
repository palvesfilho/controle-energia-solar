/**
 * Casos à mão para `diaDoMesUTC` — a guarda que impede dia vindo da API de
 * rolar para o mês seguinte. Rodar: npx tsx scripts/verifica-dia-do-mes.ts
 */
import { diaDoMesUTC, diasNoMes } from "../src/lib/date-only";

let falhas = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome} ${detalhe}`); }
};

console.log("\nlib/date-only · diaDoMesUTC\n");
ok("setembro tem 30 dias", diasNoMes(2026, 9) === 30);
ok("31 de setembro NÃO vira 1º de outubro", diaDoMesUTC(2026, 9, 31) === null,
   String(diaDoMesUTC(2026, 9, 31)));
ok("30 de setembro passa", diaDoMesUTC(2026, 9, 30)?.toISOString() === "2026-09-30T12:00:00.000Z");
ok("31 de agosto passa", diaDoMesUTC(2026, 8, 31)?.toISOString() === "2026-08-31T12:00:00.000Z");
ok("29 de fevereiro em ano comum é descartado", diaDoMesUTC(2026, 2, 29) === null);
ok("29 de fevereiro em bissexto passa", diaDoMesUTC(2024, 2, 29)?.toISOString() === "2024-02-29T12:00:00.000Z");
ok("dia 0 é descartado", diaDoMesUTC(2026, 9, 0) === null);
ok("dia fracionário é descartado", diaDoMesUTC(2026, 9, 10.5) === null);
ok("dia 1º passa", diaDoMesUTC(2026, 9, 1)?.toISOString() === "2026-09-01T12:00:00.000Z");

console.log(falhas === 0 ? "\n  todos os casos passam\n" : `\n  ${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
