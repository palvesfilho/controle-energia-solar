/**
 * Confere a janela de ciclo usada pela cobertura do diagnóstico do cliente.
 *
 * Casos escritos à mão. Se esta conta errar, o relatório compara geração de um
 * conjunto de meses com consumo de outro — foi assim que a mesma UC mediu 90% e
 * 63,7% de cobertura na mesma tarde, e a recomendação ao cliente trocou de lado
 * entre duas aberturas da tela.
 *
 * Uso: npx tsx scripts/verifica-janela-ciclo.ts
 */
import { janelaDeCiclo } from "../src/lib/brasil-solar-relatorio";
import type { RelatorioMonthRow } from "../src/lib/brasil-solar-relatorio";

/**
 * Mês do histórico. `g` = geração do inversor, `c` = consumo total.
 * `null` em qualquer um dos dois torna o mês INCOMPLETO.
 */
function mes(ano: number, m: number, g: number | null, c: number | null) {
  return { ano, mes: m, geracaoInversorKwh: g, consumoTotalKwh: c } as RelatorioMonthRow;
}

/** "2025-08,2025-09" — o resultado em forma comparável. */
const chave = (linhas: RelatorioMonthRow[]) =>
  linhas.map((l) => `${l.ano}-${String(l.mes).padStart(2, "0")}`).join(",");

/** 12 meses seguidos, todos completos, terminando em 12/2025. */
const doze: RelatorioMonthRow[] = Array.from({ length: 12 }, (_, i) =>
  mes(2025, i + 1, 500, 700),
);

const casos: Array<{ nome: string; entrada: RelatorioMonthRow[]; esperado: string }> = [
  {
    nome: "12 meses completos: pega os 12",
    entrada: doze,
    esperado: "2025-01,2025-02,2025-03,2025-04,2025-05,2025-06,2025-07,2025-08,2025-09,2025-10,2025-11,2025-12",
  },
  {
    nome: "14 meses completos: teto de 12, mantém os MAIS RECENTES",
    entrada: [mes(2024, 11, 500, 700), mes(2024, 12, 500, 700), ...doze],
    esperado: "2025-01,2025-02,2025-03,2025-04,2025-05,2025-06,2025-07,2025-08,2025-09,2025-10,2025-11,2025-12",
  },
  {
    nome: "datalogger morreu nos 3 últimos: janela recua e termina antes",
    entrada: [
      mes(2025, 1, 500, 700), mes(2025, 2, 500, 700), mes(2025, 3, 500, 700),
      mes(2025, 4, null, 700), mes(2025, 5, null, 700), mes(2025, 6, null, 700),
    ],
    esperado: "2025-01,2025-02,2025-03",
  },
  {
    nome: "buraco no MEIO: para no buraco, não pula por cima",
    entrada: [
      mes(2025, 1, 500, 700), mes(2025, 2, 500, 700),
      mes(2025, 3, null, 700),
      mes(2025, 4, 500, 700), mes(2025, 5, 500, 700),
    ],
    esperado: "2025-04,2025-05",
  },
  {
    nome: "mês de calendário faltando (fatura ausente) quebra a sequência",
    entrada: [
      mes(2025, 1, 500, 700), mes(2025, 2, 500, 700),
      // 03/2025 não existe no histórico
      mes(2025, 4, 500, 700), mes(2025, 5, 500, 700),
    ],
    esperado: "2025-04,2025-05",
  },
  {
    nome: "vira o ano corretamente (12/2024 → 01/2025)",
    entrada: [mes(2024, 12, 500, 700), mes(2025, 1, 500, 700)],
    esperado: "2024-12,2025-01",
  },
  {
    nome: "consumo faltando também torna o mês incompleto",
    entrada: [mes(2025, 1, 500, 700), mes(2025, 2, 500, null), mes(2025, 3, 500, 700)],
    esperado: "2025-03",
  },
  {
    nome: "geração zero conta como sem dado (usina não operava)",
    entrada: [mes(2025, 1, 500, 700), mes(2025, 2, 0, 700), mes(2025, 3, 500, 700)],
    esperado: "2025-03",
  },
  { nome: "histórico vazio devolve vazio", entrada: [], esperado: "" },
  {
    nome: "nenhum mês completo devolve vazio",
    entrada: [mes(2025, 1, null, 700), mes(2025, 2, null, 700)],
    esperado: "",
  },
];

let falhas = 0;
for (const c of casos) {
  const obtido = chave(janelaDeCiclo(c.entrada));
  const ok = obtido === c.esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "  ok  " : "FALHA "} ${c.nome}`);
  if (!ok) {
    console.log(`         esperado: ${c.esperado || "(vazio)"}`);
    console.log(`         obtido  : ${obtido || "(vazio)"}`);
  }
}

console.log(`\n${casos.length - falhas}/${casos.length} casos passaram`);
process.exit(falhas === 0 ? 0 : 1);
