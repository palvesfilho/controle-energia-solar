/**
 * Backfill: normaliza datas-calendário para 12:00 UTC.
 *
 * Contexto: `vencimento`, `pago_em`, `proxima_leitura` e as datas de leitura
 * eram gravadas com `new Date(y, m, d)` — meia-noite LOCAL do processo. Rodando
 * no Brasil isso vira 03:00Z; rodando no Railway (UTC) vira 00:00Z, que no
 * navegador brasileiro exibe o DIA ANTERIOR. Ver src/lib/date-only.ts.
 *
 * O dia-calendário correto é sempre o componente UTC do valor gravado (vale
 * para 00:00Z, 03:00Z e 12:00Z), então a conversão é só reancorar a hora —
 * nenhuma data muda de dia.
 *
 * Uso:
 *   npx cross-env NODE_OPTIONS=--use-system-ca tsx scripts/backfill-datas-calendario.ts          (dry-run)
 *   npx cross-env NODE_OPTIONS=--use-system-ca tsx scripts/backfill-datas-calendario.ts --apply
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

// tabela → colunas de data-calendário
const ALVOS: Array<{ tabela: string; colunas: string[] }> = [
  {
    tabela: "consumer_bills",
    colunas: [
      "vencimento",
      "pago_em",
      "proxima_leitura",
      "data_leitura_anterior",
      "data_leitura_atual",
    ],
  },
];

async function colunaExiste(tabela: string, coluna: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2`,
    tabela,
    coluna,
  );
  return (r[0]?.n ?? 0) > 0;
}

async function main() {
  console.log(APPLY ? "=== APLICANDO ===\n" : "=== DRY-RUN (use --apply para gravar) ===\n");

  for (const { tabela, colunas } of ALVOS) {
    for (const coluna of colunas) {
      if (!(await colunaExiste(tabela, coluna))) {
        console.log(`${tabela}.${coluna}: coluna não existe — pulando`);
        continue;
      }

      const antes = await prisma.$queryRawUnsafe<Array<{ hora: string; n: number }>>(
        `SELECT to_char("${coluna}", 'HH24:MI') AS hora, count(*)::int AS n
           FROM "${tabela}" WHERE "${coluna}" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      );
      const total = antes.reduce((s, r) => s + r.n, 0);
      const forinhas = antes.filter((r) => r.hora !== "12:00");
      const aCorrigir = forinhas.reduce((s, r) => s + r.n, 0);

      console.log(
        `${tabela}.${coluna}: ${total} preenchidas · ${aCorrigir} fora do padrão ` +
          `(${forinhas.map((r) => `${r.hora}×${r.n}`).join(", ") || "nenhuma"})`,
      );

      if (aCorrigir === 0) continue;

      // Amostra de conferência: dia antes × depois (o dia não pode mudar).
      const amostra = await prisma.$queryRawUnsafe<Array<{ antes: string; depois: string }>>(
        `SELECT to_char("${coluna}", 'YYYY-MM-DD HH24:MI') AS antes,
                to_char(date_trunc('day', "${coluna}") + interval '12 hours', 'YYYY-MM-DD HH24:MI') AS depois
           FROM "${tabela}"
          WHERE "${coluna}" IS NOT NULL AND to_char("${coluna}", 'HH24:MI') <> '12:00'
          LIMIT 3`,
      );
      for (const a of amostra) console.log(`    ${a.antes}  →  ${a.depois}`);

      if (!APPLY) continue;

      const n = await prisma.$executeRawUnsafe(
        `UPDATE "${tabela}"
            SET "${coluna}" = date_trunc('day', "${coluna}") + interval '12 hours'
          WHERE "${coluna}" IS NOT NULL
            AND to_char("${coluna}", 'HH24:MI') <> '12:00'`,
      );
      console.log(`    ✓ ${n} linhas atualizadas`);
    }
  }

  // Conferência final: nenhuma data pode ter mudado de dia.
  console.log("\n=== Distribuição final ===");
  for (const { tabela, colunas } of ALVOS) {
    for (const coluna of colunas) {
      if (!(await colunaExiste(tabela, coluna))) continue;
      const r = await prisma.$queryRawUnsafe<Array<{ hora: string; n: number }>>(
        `SELECT to_char("${coluna}", 'HH24:MI') AS hora, count(*)::int AS n
           FROM "${tabela}" WHERE "${coluna}" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      );
      console.log(`  ${tabela}.${coluna}: ${r.map((x) => `${x.hora}×${x.n}`).join(", ") || "—"}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
