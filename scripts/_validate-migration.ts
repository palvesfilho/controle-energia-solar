import Database from "better-sqlite3";
import { Client } from "pg";

const SQLITE_PATH = "./prisma/dev.db.backup-2026-05-13";
const PG_URL = process.env.RAILWAY_URL!;

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'
       ORDER BY name`,
    )
    .all() as { name: string }[];

  const mismatches: string[] = [];
  let totalSqlite = 0;
  let totalPg = 0;

  for (const t of tables) {
    const sqliteN = (sqlite.prepare(`SELECT COUNT(*) as n FROM "${t.name}"`).get() as { n: number }).n;
    try {
      const r = await pg.query<{ n: string }>(`SELECT COUNT(*)::text as n FROM "${t.name}"`);
      const pgN = parseInt(r.rows[0].n, 10);
      totalSqlite += sqliteN;
      totalPg += pgN;
      if (sqliteN !== pgN) {
        mismatches.push(`  ✗ ${t.name}: SQLite=${sqliteN} PG=${pgN}`);
        console.log(`  ✗ ${t.name}: SQLite=${sqliteN} PG=${pgN}`);
      } else if (sqliteN > 0) {
        console.log(`  ✓ ${t.name}: ${pgN}`);
      }
    } catch (e: any) {
      console.log(`  ⚠ ${t.name}: erro - ${e.message}`);
    }
  }

  console.log(`\n=== RESULTADO ===`);
  console.log(`SQLite total: ${totalSqlite}`);
  console.log(`PG total:     ${totalPg}`);
  if (mismatches.length === 0) {
    console.log(`✅ TUDO BATE — migração validada`);
  } else {
    console.log(`❌ ${mismatches.length} divergência(s):`);
    mismatches.forEach((m) => console.log(m));
  }

  sqlite.close();
  await pg.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
