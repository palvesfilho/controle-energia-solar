import { Client } from "pg";

const RAILWAY_URL = process.env.RAILWAY_URL!;

(async () => {
  const client = new Client({ connectionString: RAILWAY_URL });
  try {
    await client.connect();
    console.log("✓ Conectado ao Railway PG");

    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (tables.rows.length === 0) {
      console.log("✓ Banco VAZIO (schema public sem tabelas)");
    } else {
      console.log(`⚠ Banco tem ${tables.rows.length} tabela(s):`);
      for (const t of tables.rows) {
        const count = await client.query(`SELECT COUNT(*) as n FROM "${t.table_name}"`);
        console.log(`  - ${t.table_name}: ${count.rows[0].n} registros`);
      }
    }
  } catch (e: any) {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
