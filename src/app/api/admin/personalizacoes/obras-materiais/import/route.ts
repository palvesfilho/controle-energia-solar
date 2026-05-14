import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import ExcelJS from "exceljs";

type ParsedRow = {
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

const HEADER_MAP: Record<string, keyof ParsedRow> = {
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
  return String(v ?? "")
    .trim()
    .toLowerCase();
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const replaceAll = form.get("replaceAll") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Falha ao ler planilha: ${msg}` },
      { status: 400 }
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "Planilha vazia" }, { status: 400 });
  }

  const rows: ParsedRow[] = [];
  let headerIdx: Record<number, keyof ParsedRow> = {};
  let headerFound = false;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    if (!headerFound) {
      const map: Record<number, keyof ParsedRow> = {};
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

    const parsed: Partial<ParsedRow> = {};
    for (const [idx, key] of Object.entries(headerIdx)) {
      const cell = values[Number(idx)];
      const v = cell && typeof cell === "object" && "result" in (cell as object)
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

  if (!headerFound) {
    return NextResponse.json(
      {
        error:
          "Cabeçalho não reconhecido. A primeira linha precisa conter colunas como 'Potência (W)', 'Disjuntor (A)', 'Cabo (mm²)'...",
      },
      { status: 400 }
    );
  }

  if (!rows.length) {
    return NextResponse.json({ error: "Nenhuma linha válida encontrada" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (replaceAll) {
        await tx.obraMaterialPadrao.deleteMany({});
      }
      for (const row of rows) {
        await tx.obraMaterialPadrao.upsert({
          where: { potenciaW: row.potenciaW },
          create: row,
          update: row,
        });
      }
    });

    return NextResponse.json({ imported: rows.length, replaced: replaceAll });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST obras-materiais/import] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
