import Database from "better-sqlite3";
import { Client } from "pg";

const SQLITE_PATH = "./prisma/dev.db.backup-2026-05-13";
const PG_URL = process.env.RAILWAY_URL!;

const BATCH_SIZE = 500;

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  console.log("✓ Conectado SQLite e PG");

  // Listar tabelas do SQLite
  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '_prisma_%'
       ORDER BY name`,
    )
    .all() as { name: string }[];

  console.log(`Encontradas ${tables.length} tabelas no SQLite`);

  // Desabilitar FK checks durante a migração
  await pg.query("SET session_replication_role = replica");
  console.log("✓ FK checks desabilitados");

  // Pegar tipos PG das colunas (cache por tabela)
  const colTypes: Record<string, Record<string, string>> = {};
  for (const t of tables) {
    const r = await pg.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [t.name],
    );
    if (r.rows.length === 0) {
      console.log(`⚠ Tabela ${t.name} não existe no PG — pulando`);
      continue;
    }
    colTypes[t.name] = Object.fromEntries(r.rows.map((row) => [row.column_name, row.data_type]));
  }

  // PRIMEIRO: limpar TODAS as tabelas (uma transação só), evita CASCADE entre passos
  const allTables = tables.filter((t) => colTypes[t.name]).map((t) => `"${t.name}"`);
  if (allTables.length > 0) {
    await pg.query(`TRUNCATE ${allTables.join(",")} RESTART IDENTITY CASCADE`);
    console.log(`✓ ${allTables.length} tabelas truncadas em uma operação`);
  }

  // Migrar em ordem (FK checks já desabilitados, ordem alfabética serve)
  const summary: { table: string; migrated: number; skipped: boolean }[] = [];

  for (const t of tables) {
    if (!colTypes[t.name]) {
      summary.push({ table: t.name, migrated: 0, skipped: true });
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM "${t.name}"`).all() as Record<string, unknown>[];
    if (rows.length === 0) {
      console.log(`  ${t.name}: 0 (vazia)`);
      summary.push({ table: t.name, migrated: 0, skipped: false });
      continue;
    }

    const cols = Object.keys(rows[0]);
    const types = colTypes[t.name];

    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let pIdx = 1;

      for (const row of batch) {
        const rowPlaceholders: string[] = [];
        for (const c of cols) {
          rowPlaceholders.push(`$${pIdx++}`);
          values.push(convertValue(row[c], types[c]));
        }
        placeholders.push(`(${rowPlaceholders.join(",")})`);
      }

      const colList = cols.map((c) => `"${c}"`).join(",");
      const sql = `INSERT INTO "${t.name}" (${colList}) VALUES ${placeholders.join(",")}`;

      try {
        await pg.query(sql, values);
        totalInserted += batch.length;
      } catch (e: any) {
        console.error(`  ✗ ${t.name} batch falhou em row ${i}:`, e.message);
        throw e;
      }
    }

    console.log(`  ${t.name}: ${totalInserted}/${rows.length}`);
    summary.push({ table: t.name, migrated: totalInserted, skipped: false });
  }

  // Reabilitar FK checks
  await pg.query("SET session_replication_role = origin");
  console.log("✓ FK checks reabilitados");

  // Resumo
  console.log("\n=== RESUMO ===");
  const total = summary.reduce((s, x) => s + x.migrated, 0);
  console.log(`Total: ${total} registros migrados em ${summary.filter((s) => !s.skipped).length} tabelas`);
  const skipped = summary.filter((s) => s.skipped);
  if (skipped.length > 0) console.log(`Tabelas puladas: ${skipped.map((s) => s.table).join(", ")}`);

  sqlite.close();
  await pg.end();
}

function convertValue(v: unknown, pgType: string | undefined): unknown {
  if (v === null || v === undefined) return null;

  // Boolean: SQLite armazena como 0/1
  if (pgType === "boolean") {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
    return Boolean(v);
  }

  // Timestamp: SQLite armazena como TEXT/INTEGER (epoch ms)
  if (pgType === "timestamp without time zone" || pgType === "timestamp with time zone") {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "number") return new Date(v).toISOString();
    if (typeof v === "string") return v;
    return null;
  }

  // Numérico: deixa
  return v;
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
