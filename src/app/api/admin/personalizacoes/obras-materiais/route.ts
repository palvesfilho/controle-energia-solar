import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";

type Body = {
  potenciaW?: number | string;
  disjuntorA?: number | string | null;
  caboMm2?: number | string | null;
  cdPosicoes?: string | null;
  dpsQtd?: number | string | null;
  barramento?: string | null;
  canaleta?: string | null;
  caixaPassagem?: string | null;
  placaRge?: number | string | null;
  placaPisarModulos?: number | string | null;
  placaGerador?: number | string | null;
  observacoes?: string | null;
};

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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "persObras")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const itens = await prisma.obraMaterialPadrao.findMany({
      orderBy: { potenciaW: "asc" },
    });
    return NextResponse.json(itens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/personalizacoes/obras-materiais] erro:", err);
    return NextResponse.json(
      {
        error: msg,
        hint: "Se mencionar 'obraMaterialPadrao' ou 'Unknown arg', rode `npx prisma generate` com o dev server parado.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "persObras")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const potenciaW = toInt(body.potenciaW);

  if (!potenciaW || potenciaW <= 0) {
    return NextResponse.json(
      { error: "Potência (W) é obrigatória e deve ser maior que zero." },
      { status: 400 }
    );
  }

  try {
    const item = await prisma.obraMaterialPadrao.create({
      data: {
        potenciaW,
        disjuntorA: toInt(body.disjuntorA),
        caboMm2: toFloat(body.caboMm2),
        cdPosicoes: toStr(body.cdPosicoes),
        dpsQtd: toInt(body.dpsQtd),
        barramento: toStr(body.barramento),
        canaleta: toStr(body.canaleta),
        caixaPassagem: toStr(body.caixaPassagem),
        placaRge: toInt(body.placaRge),
        placaPisarModulos: toInt(body.placaPisarModulos),
        placaGerador: toInt(body.placaGerador),
        observacoes: toStr(body.observacoes),
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Já existe um registro para a potência ${potenciaW} W.` },
        { status: 409 }
      );
    }
    console.error("[POST /api/admin/personalizacoes/obras-materiais] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
