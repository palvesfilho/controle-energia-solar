import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `PRAGMA table_info("${table}")`
  );
  return result.some((c) => c.name === column);
}

async function tableExists(table: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    table
  );
  return result.length > 0;
}

async function addColumnIfMissing(table: string, column: string, type: string) {
  if (!(await columnExists(table, column))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`
    );
    console.log(`  + ${table}.${column}`);
  } else {
    console.log(`  = ${table}.${column} (já existe)`);
  }
}

async function main() {
  console.log("Aplicando alterações no schema do banco...\n");

  // ─── Plant: novos campos ───
  console.log("→ Tabela plants:");
  await addColumnIfMissing("plants", "fonte", "TEXT");
  await addColumnIfMissing("plants", "numero_usina", "TEXT");
  await addColumnIfMissing("plants", "potencia_instalada", "REAL");
  await addColumnIfMissing("plants", "grupo", "TEXT");
  await addColumnIfMissing("plants", "cpf_cnpj", "TEXT");
  await addColumnIfMissing("plants", "distribuidora", "TEXT");
  await addColumnIfMissing("plants", "acesso", "TEXT");
  await addColumnIfMissing("plants", "status_contrato", "TEXT");
  await addColumnIfMissing("plants", "login_distribuidora", "TEXT");
  await addColumnIfMissing("plants", "senha_distribuidora", "TEXT");

  // ─── Consumer: novos campos ───
  console.log("\n→ Tabela consumers:");
  await addColumnIfMissing("consumers", "cpf_cnpj", "TEXT");
  await addColumnIfMissing("consumers", "login_portal", "TEXT");
  await addColumnIfMissing("consumers", "emails_recebimento", "TEXT");
  await addColumnIfMissing("consumers", "data_cadastro", "DATETIME");

  // ─── ConsumerUnit: nova tabela ───
  console.log("\n→ Tabela consumer_units:");
  if (!(await tableExists("consumer_units"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "consumer_units" (
        "id"                    TEXT NOT NULL PRIMARY KEY,
        "consumer_id"           TEXT,
        "plant_id"              TEXT,
        "nome"                  TEXT NOT NULL,
        "codigo_uc"             TEXT NOT NULL,
        "cpf_cnpj"              TEXT,
        "distribuidora"         TEXT,
        "grupo"                 TEXT,
        "sub_grupo"             TEXT,
        "modalidade"            TEXT,
        "consumo_medio"         REAL,
        "cep"                   TEXT,
        "logradouro"            TEXT,
        "complemento"           TEXT,
        "numero"                TEXT,
        "cidade"                TEXT,
        "consultor"             TEXT,
        "comissao"              TEXT,
        "metodo_pagamento"      TEXT,
        "regra_remuneracao"     TEXT,
        "percent_compensado"    REAL,
        "percent_bandeira"      REAL,
        "regra_vencimento"      TEXT,
        "valor_vencimento"      REAL,
        "status_contrato"       TEXT,
        "vigencia_compensacao"  TEXT,
        "login_distribuidora"   TEXT,
        "senha_distribuidora"   TEXT,
        "active"                INTEGER NOT NULL DEFAULT 1,
        "created_at"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE SET NULL,
        FOREIGN KEY ("plant_id")    REFERENCES "plants"("id")    ON DELETE SET NULL
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "consumer_units_codigo_uc_key" ON "consumer_units"("codigo_uc")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX "consumer_units_consumer_id_idx" ON "consumer_units"("consumer_id")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX "consumer_units_plant_id_idx" ON "consumer_units"("plant_id")`
    );
    console.log("  + tabela consumer_units criada");
  } else {
    console.log("  = consumer_units (já existe)");
  }

  console.log("\n✓ Schema aplicado com sucesso!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
