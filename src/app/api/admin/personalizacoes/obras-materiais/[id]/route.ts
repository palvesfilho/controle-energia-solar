import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  try {
    const item = await prisma.obraMaterialPadrao.update({
      where: { id },
      data: {
        ...(body.potenciaW !== undefined && { potenciaW: toInt(body.potenciaW) ?? 0 }),
        ...(body.disjuntorA !== undefined && { disjuntorA: toInt(body.disjuntorA) }),
        ...(body.caboMm2 !== undefined && { caboMm2: toFloat(body.caboMm2) }),
        ...(body.cdPosicoes !== undefined && { cdPosicoes: toStr(body.cdPosicoes) }),
        ...(body.dpsQtd !== undefined && { dpsQtd: toInt(body.dpsQtd) }),
        ...(body.barramento !== undefined && { barramento: toStr(body.barramento) }),
        ...(body.canaleta !== undefined && { canaleta: toStr(body.canaleta) }),
        ...(body.caixaPassagem !== undefined && { caixaPassagem: toStr(body.caixaPassagem) }),
        ...(body.placaRge !== undefined && { placaRge: toInt(body.placaRge) }),
        ...(body.placaPisarModulos !== undefined && {
          placaPisarModulos: toInt(body.placaPisarModulos),
        }),
        ...(body.placaGerador !== undefined && { placaGerador: toInt(body.placaGerador) }),
        ...(body.observacoes !== undefined && { observacoes: toStr(body.observacoes) }),
      },
    });
    return NextResponse.json(item);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Já existe um registro com essa potência." },
        { status: 409 }
      );
    }
    console.error("[PUT obras-materiais] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.obraMaterialPadrao.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE obras-materiais] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
