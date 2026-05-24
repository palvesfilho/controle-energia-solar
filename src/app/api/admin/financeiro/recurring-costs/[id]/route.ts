import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

type Body = {
  nome?: string;
  categoria?: string | null;
  valorPadrao?: number;
  ativo?: boolean;
  ordem?: number;
  observacao?: string | null;
};

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const data: Record<string, unknown> = {};

  if (body.nome !== undefined) {
    const nome = toStr(body.nome);
    if (!nome) {
      return NextResponse.json(
        { error: "Nome da rubrica é obrigatório." },
        { status: 400 },
      );
    }
    data.nome = nome;
  }
  if (body.categoria !== undefined) data.categoria = toStr(body.categoria);
  if (body.valorPadrao !== undefined) {
    const v = Number(body.valorPadrao);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json(
        { error: "Valor padrão inválido." },
        { status: 400 },
      );
    }
    data.valorPadrao = v;
  }
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);
  if (body.ordem !== undefined && Number.isInteger(body.ordem)) {
    data.ordem = Number(body.ordem);
  }
  if (body.observacao !== undefined) data.observacao = toStr(body.observacao);

  try {
    const row = await prisma.recurringCost.update({ where: { id }, data });
    return NextResponse.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Já existe rubrica com este nome.` },
        { status: 409 },
      );
    }
    console.error("[PUT recurring-costs]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.recurringCost.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE recurring-costs]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
