/**
 * Importa proprietários da planilha "PROPRIETÁRIOS USINAS.xlsx"
 * e vincula às usinas já existentes em BrasilSolarClient via monitoramentoPlantId
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FILE = "c:/Users/thoma/Downloads/PROPRIETÁRIOS USINAS.xlsx";

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const v = value as { text?: string; richText?: { text: string }[]; result?: unknown };
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("").trim() || null;
    }
    if ("text" in v && v.text) return String(v.text).trim() || null;
    if ("result" in v && v.result !== undefined) return String(v.result).trim() || null;
  }
  const str = String(value).trim();
  if (!str || str === "-" || str === "null" || str === "undefined") return null;
  return str;
}

interface RawRow {
  usina: string | null;
  nome: string | null;
  email: string | null;
  cpfCnpj: string | null;
  codPais: string | null;
  telefone: string | null;
  idUsina: string | null; // Fronius pvSystemId
  cep: string | null;
  logradouro: string | null;
  bairro: string | null;
  numero: string | null;
}

async function readRows(): Promise<RawRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.worksheets[0];
  const rows: RawRow[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const nome = clean(row.getCell(2).value);
    if (!nome) continue;

    rows.push({
      usina: clean(row.getCell(1).value),
      nome,
      email: clean(row.getCell(3).value),
      cpfCnpj: clean(row.getCell(4).value),
      codPais: clean(row.getCell(5).value),
      telefone: clean(row.getCell(6).value),
      idUsina: clean(row.getCell(8).value),
      cep: clean(row.getCell(10).value),
      logradouro: clean(row.getCell(11).value),
      bairro: clean(row.getCell(12).value),
      numero: clean(row.getCell(13).value),
    });
  }

  return rows;
}

function buildEndereco(row: RawRow): string | null {
  const parts = [row.logradouro, row.numero, row.bairro].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatTelefone(codPais: string | null, telefone: string | null): string | null {
  if (!telefone) return null;
  const tel = telefone.replace(/\D/g, "");
  if (!tel) return null;
  if (codPais) {
    const cod = codPais.replace(/\D/g, "");
    if (cod && !tel.startsWith(cod)) return `+${cod}${tel}`;
  }
  return tel;
}

async function main() {
  console.log("Importando proprietarios da planilha...\n");

  const rows = await readRows();
  console.log(`Total de linhas lidas: ${rows.length}`);

  // Agrupar por nome do proprietário (normalizado)
  // Um proprietário pode ter várias usinas
  const proprietarioMap = new Map<
    string,
    { nome: string; email: string | null; cpfCnpj: string | null; telefone: string | null; endereco: string | null; cep: string | null; usinaIds: string[] }
  >();

  for (const row of rows) {
    const key = row.nome!.toUpperCase().trim();
    const existing = proprietarioMap.get(key);

    if (existing) {
      // Adicionar usina e preencher dados faltantes
      if (row.idUsina) existing.usinaIds.push(row.idUsina);
      if (!existing.email && row.email && !row.email.includes("pendente")) existing.email = row.email;
      if (!existing.cpfCnpj && row.cpfCnpj) existing.cpfCnpj = row.cpfCnpj;
      if (!existing.telefone && row.telefone) existing.telefone = formatTelefone(row.codPais, row.telefone);
      if (!existing.endereco) existing.endereco = buildEndereco(row);
      if (!existing.cep && row.cep) existing.cep = row.cep;
    } else {
      proprietarioMap.set(key, {
        nome: row.nome!,
        email: row.email && !row.email.includes("pendente") ? row.email : null,
        cpfCnpj: row.cpfCnpj || null,
        telefone: formatTelefone(row.codPais, row.telefone),
        endereco: buildEndereco(row),
        cep: row.cep,
        usinaIds: row.idUsina ? [row.idUsina] : [],
      });
    }
  }

  console.log(`Proprietarios unicos: ${proprietarioMap.size}`);

  // Buscar usinas existentes indexadas por monitoramentoPlantId
  const existingClients = await prisma.brasilSolarClient.findMany({
    where: { plataformaMonitoramento: "FRONIUS" },
    select: { id: true, monitoramentoPlantId: true, nome: true },
  });
  const clientByPlantId = new Map(
    existingClients.filter((c) => c.monitoramentoPlantId).map((c) => [c.monitoramentoPlantId!, c])
  );
  console.log(`Usinas Fronius no banco: ${existingClients.length}`);

  // Buscar proprietários já existentes
  const existingProps = await prisma.brasilSolarProprietario.findMany({
    where: { active: true },
    select: { id: true, nome: true, cpfCnpj: true },
  });
  const propByName = new Map(existingProps.map((p) => [p.nome.toUpperCase().trim(), p]));

  let propsCreated = 0;
  let propsUpdated = 0;
  let linked = 0;
  let notFound = 0;
  let errors = 0;

  for (const [key, data] of proprietarioMap) {
    try {
      let propId: string;

      // Verificar se já existe (por nome)
      const existingProp = propByName.get(key);

      if (existingProp) {
        // Atualizar com dados novos se houver
        await prisma.brasilSolarProprietario.update({
          where: { id: existingProp.id },
          data: {
            email: data.email || existingProp.cpfCnpj ? undefined : data.email,
            cpfCnpj: data.cpfCnpj || undefined,
            telefone: data.telefone || undefined,
            endereco: data.endereco || undefined,
          },
        });
        propId = existingProp.id;
        propsUpdated++;
      } else {
        // Criar novo proprietário
        const prop = await prisma.brasilSolarProprietario.create({
          data: {
            nome: data.nome,
            email: data.email,
            cpfCnpj: data.cpfCnpj,
            telefone: data.telefone,
            endereco: data.endereco,
          },
        });
        propId = prop.id;
        propsCreated++;
      }

      // Vincular usinas ao proprietário
      for (const usinaId of data.usinaIds) {
        const client = clientByPlantId.get(usinaId);
        if (client) {
          await prisma.brasilSolarClient.update({
            where: { id: client.id },
            data: { proprietarioId: propId },
          });
          linked++;
        } else {
          notFound++;
        }
      }
    } catch (e) {
      errors++;
      console.error(`  Erro em "${data.nome}": ${(e as Error).message}`);
    }
  }

  console.log(`\nResultado:`);
  console.log(`  Proprietarios criados:     ${propsCreated}`);
  console.log(`  Proprietarios atualizados: ${propsUpdated}`);
  console.log(`  Usinas vinculadas:         ${linked}`);
  console.log(`  Usinas nao encontradas:    ${notFound} (ID Fronius nao bate)`);
  console.log(`  Erros:                     ${errors}`);

  const totalProps = await prisma.brasilSolarProprietario.count({ where: { active: true } });
  const linkedClients = await prisma.brasilSolarClient.count({ where: { proprietarioId: { not: null } } });
  console.log(`\n  Total proprietarios no banco: ${totalProps}`);
  console.log(`  Usinas com proprietario:      ${linkedClients}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
