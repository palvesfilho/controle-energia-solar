import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toHexColor(v: unknown): string | null {
  const s = toStr(v);
  if (!s) return null;
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
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
    const equipe = await prisma.equipeExecucao.update({
      where: { id },
      data: {
        ...(body.nome !== undefined && { nome: toStr(body.nome) ?? "" }),
        ...(body.telefoneResponsavel !== undefined && {
          telefoneResponsavel: toStr(body.telefoneResponsavel),
        }),
        ...(body.cor !== undefined && { cor: toHexColor(body.cor) }),
        ...(body.active !== undefined && { active: Boolean(body.active) }),
      },
    });
    return NextResponse.json(equipe);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Já existe uma equipe com esse nome." },
        { status: 409 }
      );
    }
    console.error("[PUT equipes] erro:", err);
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
    await prisma.equipeExecucao.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE equipes] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
