import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import path from "path";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

type Row = {
  potenciaW: number;
  disjuntorA: number | null;
  caboMm2: number | null;
  cdPosicoes: string | null;
  dpsQtd: number | null;
  barramento: string | null;
  canaleta: string | null;
  caixaPassagem: string | null;
  placaRge: number | null;
  placaPisarModulos: number | null;
  placaGerador: number | null;
};

const HEADER_MAP: Record<string, keyof Row> = {
  "potencia (w)": "potenciaW",
  "potência (w)": "potenciaW",
  "disjuntor (a)": "disjuntorA",
  "cabo (mm²)": "caboMm2",
  "cabo (mm2)": "caboMm2",
  "cd (posicoes)": "cdPosicoes",
  "cd (posições)": "cdPosicoes",
  "dps 275vca": "dpsQtd",
  barramento: "barramento",
  canaleta: "canaleta",
  "caixa de passagem": "caixaPassagem",
  "placa rge": "placaRge",
  "placa pisar modulos": "placaPisarModulos",
  "placa pisar módulos": "placaPisarModulos",
  "placa gerador": "placaGerador",
};

function normKey(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}
function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

async function parseXlsx(file: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Planilha vazia");

  const rows: Row[] = [];
  let headerIdx: Record<number, keyof Row> = {};
  let headerFound = false;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    if (!headerFound) {
      const map: Record<number, keyof Row> = {};
      let hits = 0;
      values.forEach((cell, i) => {
        const key = HEADER_MAP[normKey(cell)];
        if (key) {
          map[i] = key;
          hits++;
        }
      });
      if (hits >= 3) {
        headerIdx = map;
        headerFound = true;
      }
      return;
    }
    const parsed: Partial<Row> = {};
    for (const [idx, key] of Object.entries(headerIdx)) {
      const cell = values[Number(idx)];
      const v =
        cell && typeof cell === "object" && "result" in (cell as object)
          ? (cell as { result: unknown }).result
          : cell;
      switch (key) {
        case "potenciaW":
        case "disjuntorA":
        case "dpsQtd":
        case "placaRge":
        case "placaPisarModulos":
        case "placaGerador":
          parsed[key] = toInt(v) as never;
          break;
        case "caboMm2":
          parsed[key] = toFloat(v) as never;
          break;
        default:
          parsed[key] = toStr(v) as never;
      }
    }
    if (parsed.potenciaW && parsed.potenciaW > 0) {
      rows.push({
        potenciaW: parsed.potenciaW,
        disjuntorA: parsed.disjuntorA ?? null,
        caboMm2: parsed.caboMm2 ?? null,
        cdPosicoes: parsed.cdPosicoes ?? null,
        dpsQtd: parsed.dpsQtd ?? null,
        barramento: parsed.barramento ?? null,
        canaleta: parsed.canaleta ?? null,
        caixaPassagem: parsed.caixaPassagem ?? null,
        placaRge: parsed.placaRge ?? null,
        placaPisarModulos: parsed.placaPisarModulos ?? null,
        placaGerador: parsed.placaGerador ?? null,
      });
    }
  });

  if (!headerFound) throw new Error("Cabeçalho não reconhecido");
  return rows;
}

async function main() {
  const file =
    process.argv[2] ||
    "C:/Users/thoma/Downloads/LISTA DE MATERIAIS PARA OBRAS.xlsx";
  console.log(`→ Lendo ${path.resolve(file)}`);

  const rows = await parseXlsx(file);
  console.log(`→ ${rows.length} linhas válidas`);

  for (const r of rows) {
    const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM obra_materiais_padrao WHERE potencia_w = ?`,
      r.potenciaW
    );

    if (existing.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE obra_materiais_padrao
           SET disjuntor_a = ?, cabo_mm2 = ?, cd_posicoes = ?, dps_qtd = ?,
               barramento = ?, canaleta = ?, caixa_passagem = ?,
               placa_rge = ?, placa_pisar_modulos = ?, placa_gerador = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE potencia_w = ?`,
        r.disjuntorA, r.caboMm2, r.cdPosicoes, r.dpsQtd,
        r.barramento, r.canaleta, r.caixaPassagem,
        r.placaRge, r.placaPisarModulos, r.placaGerador,
        r.potenciaW
      );
      console.log(`  = ${r.potenciaW} W (atualizado)`);
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO obra_materiais_padrao
           (id, potencia_w, disjuntor_a, cabo_mm2, cd_posicoes, dps_qtd,
            barramento, canaleta, caixa_passagem,
            placa_rge, placa_pisar_modulos, placa_gerador,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        randomUUID(),
        r.potenciaW, r.disjuntorA, r.caboMm2, r.cdPosicoes, r.dpsQtd,
        r.barramento, r.canaleta, r.caixaPassagem,
        r.placaRge, r.placaPisarModulos, r.placaGerador
      );
      console.log(`  + ${r.potenciaW} W (inserido)`);
    }
  }

  console.log(`\n✓ Seed concluído (${rows.length} registros)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
