import Database from "better-sqlite3";

const db = new Database("./prisma/dev.db.backup-2026-05-13", { readonly: true });

const tables = db
  .prepare(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'
     ORDER BY name`,
  )
  .all() as { name: string }[];

const result: Record<string, number> = {};
for (const t of tables) {
  const row = db.prepare(`SELECT COUNT(*) as n FROM "${t.name}"`).get() as { n: number };
  result[t.name] = row.n;
}

console.log(JSON.stringify(result, null, 2));
db.close();
