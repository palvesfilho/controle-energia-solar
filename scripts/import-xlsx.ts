import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const FILES = {
  usinas: "C:/Users/thoma/Downloads/usinas_10_04_2026.xlsx",
  ucs: "C:/Users/thoma/Downloads/ucs_10_04_2026.xlsx",
  consumidores: "C:/Users/thoma/Downloads/consumidores_10_04_2026.xlsx",
};

// Cabeçalhos estão na linha 4, dados começam na linha 5
const HEADER_ROW = 4;
const DATA_START_ROW = 5;

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const v = value as { text?: string; result?: unknown };
    if ("text" in v && v.text) return String(v.text).trim() || null;
    if ("result" in v && v.result !== undefined) value = v.result;
  }
  const str = String(value).trim();
  if (!str || str === "-") return null;
  return str;
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object") {
    const v = value as { result?: unknown };
    if ("result" in v && typeof v.result === "number") return v.result;
  }
  const parsed = parseFloat(String(value).replace(",", "."));
  return isNaN(parsed) ? null : parsed;
}

function cleanDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

async function readSheet(filePath: string): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];

  const headers: string[] = [];
  const headerRow = sheet.getRow(HEADER_ROW);
  for (let c = 1; c <= sheet.columnCount; c++) {
    headers[c] = String(headerRow.getCell(c).value ?? "").trim();
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = DATA_START_ROW; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    for (let c = 1; c <= sheet.columnCount; c++) {
      const cell = row.getCell(c);
      let value: unknown = cell.value;
      if (value && typeof value === "object" && "text" in value) {
        value = (value as { text: string }).text;
      }
      if (value && typeof value === "object" && "result" in value) {
        value = (value as { result: unknown }).result;
      }
      if (value !== null && value !== undefined && value !== "") {
        obj[headers[c]] = value;
        hasValue = true;
      }
    }
    if (hasValue) rows.push(obj);
  }
  return rows;
}

async function clearExistingData() {
  console.log("\n🗑  Limpando dados existentes...");

  // Ordem importa pelas FKs
  await prisma.$executeRawUnsafe(`DELETE FROM consumer_units`);
  await prisma.$executeRawUnsafe(`DELETE FROM cpfl_credentials`);
  await prisma.$executeRawUnsafe(`DELETE FROM consumer_bills`);
  await prisma.$executeRawUnsafe(`DELETE FROM consumer_monthly`);
  await prisma.$executeRawUnsafe(`DELETE FROM consumer_plants`);
  await prisma.$executeRawUnsafe(`DELETE FROM monthly_reports`);
  await prisma.$executeRawUnsafe(`DELETE FROM plant_monthly`);
  await prisma.$executeRawUnsafe(`DELETE FROM investor_plants`);
  await prisma.$executeRawUnsafe(`DELETE FROM consumers`);
  await prisma.$executeRawUnsafe(`DELETE FROM plants`);

  console.log("✓ Dados removidos");
}

async function importPlants(): Promise<Map<string, string>> {
  console.log("\n🏭 Importando usinas...");
  const rows = await readSheet(FILES.usinas);
  const nameToId = new Map<string, string>();

  for (const row of rows) {
    const nome = cleanText(row["Nome da Usina"]);
    if (!nome) continue;

    const id = randomUUID();
    nameToId.set(nome.toUpperCase(), id);

    await prisma.$executeRawUnsafe(
      `INSERT INTO plants (
        id, name, fonte, numero_usina, potencia_instalada, grupo, cpf_cnpj,
        distribuidora, acesso, status_contrato, login_distribuidora, senha_distribuidora,
        active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      nome,
      cleanText(row["Fonte"]),
      cleanText(row["Número da Usina"]),
      cleanNumber(row["Potência instalada"]),
      cleanText(row["Grupo"]),
      cleanText(row["CPF/CNPJ"]),
      cleanText(row["Distribuidora"]),
      cleanText(row["Acesso"]),
      cleanText(row["Status do contrato"]),
      cleanText(row["Login"]),
      cleanText(row["Senha Distribuidora"])
    );
  }
  console.log(`✓ ${rows.length} usinas importadas`);
  return nameToId;
}

async function importConsumers(): Promise<Map<string, string>> {
  console.log("\n👥 Importando consumidores...");
  const rows = await readSheet(FILES.consumidores);
  const nameToId = new Map<string, string>();

  for (const row of rows) {
    const nome = cleanText(row["Nome"]);
    if (!nome) continue;

    const id = randomUUID();
    nameToId.set(nome.toUpperCase(), id);

    const dataCadastro = cleanDate(row["Data de Cadastro"]);

    await prisma.$executeRawUnsafe(
      `INSERT INTO consumers (
        id, name, cpf_cnpj, login_portal, phone, emails_recebimento, data_cadastro,
        active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      nome,
      cleanText(row["CPF/CNPJ"]),
      cleanText(row["Login"]),
      cleanText(row["Telefone"]),
      cleanText(row["Emails de recebimento"]),
      dataCadastro ? dataCadastro.toISOString() : null
    );
  }
  console.log(`✓ ${rows.length} consumidores importados`);
  return nameToId;
}

async function importUCs(plantMap: Map<string, string>, consumerMap: Map<string, string>) {
  console.log("\n⚡ Importando unidades consumidoras...");
  const rows = await readSheet(FILES.ucs);
  let imported = 0;
  let skipped = 0;
  const orphanConsumers: string[] = [];
  const orphanPlants: string[] = [];

  for (const row of rows) {
    const nome = cleanText(row["Nome da UC"]);
    const codigo = cleanText(row["Código da UC"]);
    if (!nome || !codigo) {
      skipped++;
      continue;
    }

    const consumerName = cleanText(row["Consumidor"]);
    const plantName = cleanText(row["Usina Geradora"]);

    let consumerId: string | null = null;
    let plantId: string | null = null;

    if (consumerName) {
      consumerId = consumerMap.get(consumerName.toUpperCase()) ?? null;
      if (!consumerId) orphanConsumers.push(consumerName);
    }
    if (plantName) {
      plantId = plantMap.get(plantName.toUpperCase()) ?? null;
      if (!plantId) orphanPlants.push(plantName);
    }

    const id = randomUUID();

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO consumer_units (
          id, consumer_id, plant_id, nome, codigo_uc, cpf_cnpj, distribuidora,
          grupo, sub_grupo, modalidade, consumo_medio, cep, logradouro, complemento,
          numero, cidade, consultor, comissao, metodo_pagamento, regra_remuneracao,
          percent_compensado, percent_bandeira, regra_vencimento, valor_vencimento,
          status_contrato, vigencia_compensacao, login_distribuidora, senha_distribuidora,
          active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        id,
        consumerId,
        plantId,
        nome,
        codigo,
        cleanText(row["CPF/CNPJ"]),
        cleanText(row["Distribuidora"]),
        cleanText(row["Grupo"]),
        cleanText(row["Sub Grupo"]),
        cleanText(row["Modalidade"]),
        cleanNumber(row["Consumo médio"]),
        cleanText(row["CEP"]),
        cleanText(row["Logradouro"]),
        cleanText(row["Complemento"]),
        cleanText(row["Numero"]),
        cleanText(row["Cidade"]),
        cleanText(row["Consultor"]),
        cleanText(row["Comissão"]),
        cleanText(row["Método de pagamento"]),
        cleanText(row["Regra de remuneração"]),
        cleanNumber(row["Percentual sobre Compensado"]),
        cleanNumber(row["Percentual sobre Bandeira"]),
        cleanText(row["Regra de vencimento"]),
        cleanNumber(row["Valor de vencimento"]),
        cleanText(row["Status de contrato"]),
        cleanText(row["Vigência Real de Compensação"]),
        cleanText(row["Login"]),
        cleanText(row["Senha Distribuidora"])
      );
      imported++;
    } catch (e) {
      console.error(`  ✗ Erro ao importar UC ${codigo}:`, (e as Error).message);
      skipped++;
    }
  }
  console.log(`✓ ${imported} unidades consumidoras importadas, ${skipped} ignoradas`);
  if (orphanConsumers.length > 0) {
    const unique = [...new Set(orphanConsumers)];
    console.log(`  ⚠  ${unique.length} consumidores referenciados não encontrados:`, unique.slice(0, 5));
  }
  if (orphanPlants.length > 0) {
    const unique = [...new Set(orphanPlants)];
    console.log(`  ⚠  ${unique.length} usinas referenciadas não encontradas:`, unique.slice(0, 5));
  }
}

async function main() {
  console.log("📊 Importação de dados das planilhas\n");
  console.log("=".repeat(50));

  await clearExistingData();

  const plantMap = await importPlants();
  const consumerMap = await importConsumers();
  await importUCs(plantMap, consumerMap);

  console.log("\n" + "=".repeat(50));
  console.log("✅ Importação concluída!");

  // Resumo
  const plantCount = await prisma.plant.count();
  const consumerCount = await prisma.consumer.count();
  const ucCount = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM consumer_units`
  );

  console.log(`\nResumo final:`);
  console.log(`  Usinas:                ${plantCount}`);
  console.log(`  Consumidores:          ${consumerCount}`);
  console.log(`  Unidades Consumidoras: ${ucCount[0].count}`);
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
