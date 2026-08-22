/**
 * Confere a sugestão de percentuais do rateio (`src/lib/rateio-sugestao.ts`)
 * contra os casos que ela precisa acertar — inclusive os rateios VIGENTES de
 * produção, onde o que importa é a soma fechar 100,00% exato.
 *
 * Roda sozinho: `npx tsx scripts/verifica-rateio-sugestao.ts`.
 */
import { sugerirPercentuais } from "../src/lib/rateio-sugestao";

let falhas = 0;

function ok(cond: boolean, titulo: string, detalhe = "") {
  if (cond) {
    console.log(`  ok   ${titulo}`);
  } else {
    falhas++;
    console.log(`  FALHA ${titulo}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function soma(s: ReturnType<typeof sugerirPercentuais>): number {
  return Number(s.linhas.reduce((acc, l) => acc + l.percentual, 0).toFixed(2));
}

console.log("Caso do pedido: usina 100 kWh, 1 UC de 70 kWh");
{
  const s = sugerirPercentuais([{ id: "a", consumoMedio: 70 }], 100);
  ok(s.linhas[0].percentual === 100, "UC única fica com 100%", `deu ${s.linhas[0].percentual}`);
  ok(s.ocupacao === 0.7, "ocupação 70%", `deu ${s.ocupacao}`);
  ok(s.linhas[0].kwhDestinado === 100, "recebe os 100 kWh gerados");
}

console.log("\nSegunda UC entra: percentuais se atualizam");
{
  const s = sugerirPercentuais(
    [
      { id: "a", consumoMedio: 70 },
      { id: "b", consumoMedio: 30 },
    ],
    100,
  );
  ok(s.linhas[0].percentual === 70, "70/100 → 70%", `deu ${s.linhas[0].percentual}`);
  ok(s.linhas[1].percentual === 30, "30/100 → 30%", `deu ${s.linhas[1].percentual}`);
  ok(soma(s) === 100, "soma 100%");
}

console.log("\nGeradora fica fora da conta (0% fixo)");
{
  const s = sugerirPercentuais(
    [
      { id: "g", consumoMedio: 5000, isGeradora: true },
      { id: "a", consumoMedio: 100 },
      { id: "b", consumoMedio: 100 },
    ],
    10_000,
  );
  ok(s.linhas[0].percentual === 0, "geradora em 0%");
  ok(s.linhas[1].percentual === 50 && s.linhas[2].percentual === 50, "resto divide 50/50");
  ok(s.consumoTotal === 200, "consumo somado ignora a geradora", `deu ${s.consumoTotal}`);
}

console.log("\nUC sem consumo médio: 0% e SINALIZADA, nunca estimada");
{
  const s = sugerirPercentuais(
    [
      { id: "a", consumoMedio: 100 },
      { id: "b", consumoMedio: null },
      { id: "c", consumoMedio: 0 },
    ],
    1000,
  );
  ok(s.linhas[0].percentual === 100, "quem tem consumo leva os 100%");
  ok(s.semConsumo.join(",") === "b,c", "b e c devolvidas em semConsumo", s.semConsumo.join(","));
  ok(s.linhas[1].contabilizada === false, "b não contabilizada");
}

console.log("\nNenhuma UC com consumo: sugestão indisponível, não inventa nada");
{
  const s = sugerirPercentuais([{ id: "a", consumoMedio: null }], 1000);
  ok(s.indisponivel, "indisponivel = true");
  ok(soma(s) === 0, "não distribui percentual nenhum");
}

console.log("\nSem geração cadastrada: ainda sugere, só não mostra kWh");
{
  const s = sugerirPercentuais(
    [
      { id: "a", consumoMedio: 300 },
      { id: "b", consumoMedio: 100 },
    ],
    null,
  );
  ok(s.linhas[0].percentual === 75, "75/25 pelo consumo");
  ok(s.ocupacao === null && s.linhas[0].kwhDestinado === null, "ocupação e kWh ficam null");
}

console.log("\nSobrecarga (consumo > geração) NÃO é truncada");
{
  // ALEXANDRE DALLA PASQUA em produção: 18.950 kWh de consumo para 8.800 de geração.
  const s = sugerirPercentuais([{ id: "a", consumoMedio: 18_950 }], 8_800);
  ok(s.ocupacao !== null && s.ocupacao > 2.1, "ocupação passa de 100%", String(s.ocupacao));
  ok(s.linhas[0].percentual === 100, "percentual segue 100% mesmo assim");
}

console.log("\nArredondamento: casos que não dividem redondo");
{
  const casos: Array<{ nome: string; consumos: number[] }> = [
    { nome: "3 UCs iguais", consumos: [100, 100, 100] },
    { nome: "7 UCs iguais", consumos: [1, 1, 1, 1, 1, 1, 1] },
    { nome: "14 UCs (FERNANDO ESCOBAR)", consumos: [
      1200, 900, 850, 800, 780, 760, 740, 720, 700, 680, 660, 640, 620, 609,
    ] },
    { nome: "consumos quebrados", consumos: [333.33, 333.33, 333.34] },
    { nome: "uma UC domina", consumos: [99_999, 1] },
  ];
  for (const c of casos) {
    const s = sugerirPercentuais(
      c.consumos.map((v, i) => ({ id: `uc${i}`, consumoMedio: v })),
      10_000,
    );
    ok(soma(s) === 100, `${c.nome}: soma 100,00%`, `deu ${soma(s)}`);
    const doisDecimais = s.linhas.every(
      (l) => Math.abs(l.percentual * 100 - Math.round(l.percentual * 100)) < 1e-9,
    );
    ok(doisDecimais, `${c.nome}: só 2 casas decimais`);
  }
}

console.log("\nOrdem das UCs não muda o resultado");
{
  const ucs = [
    { id: "a", consumoMedio: 1000 },
    { id: "b", consumoMedio: 1000 },
    { id: "c", consumoMedio: 1000 },
  ];
  const s1 = sugerirPercentuais(ucs, 5000);
  const s2 = sugerirPercentuais([...ucs].reverse(), 5000);
  const pct = (s: typeof s1, id: string) => s.linhas.find((l) => l.id === id)!.percentual;
  ok(
    pct(s1, "a") === pct(s2, "a") && pct(s1, "c") === pct(s2, "c"),
    "mesma UC, mesmo percentual nas duas ordens",
  );
}

console.log(falhas === 0 ? "\n✅ Sugestão de rateio: tudo certo." : `\n❌ ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
