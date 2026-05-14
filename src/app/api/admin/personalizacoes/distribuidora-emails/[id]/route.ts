import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

type Body = {
  distribuidora?: string;
  emailDestino?: string;
  emailRemetente?: string;
  emailCc?: string | null;
  nomeResponsavel?: string | null;
  observacoes?: string | null;
  active?: boolean;
};

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function validateEmailList(v: string | null): string | null {
  if (!v) return null;
  const parts = v.split(";").map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (!isEmail(p)) return p;
  }
  return null;
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

  if (body.distribuidora !== undefined) {
    const distribuidora = toStr(body.distribuidora);
    if (!distribuidora) {
      return NextResponse.json({ error: "Distribuidora é obrigatória." }, { status: 400 });
    }
    data.distribuidora = distribuidora;
  }

  if (body.emailDestino !== undefined) {
    const emailDestino = toStr(body.emailDestino);
    if (!emailDestino || !isEmail(emailDestino)) {
      return NextResponse.json({ error: "Email de destino inválido." }, { status: 400 });
    }
    data.emailDestino = emailDestino;
  }

  if (body.emailRemetente !== undefined) {
    const emailRemetente = toStr(body.emailRemetente);
    if (!emailRemetente || !isEmail(emailRemetente)) {
      return NextResponse.json({ error: "Email de remetente inválido." }, { status: 400 });
    }
    data.emailRemetente = emailRemetente;
  }

  if (body.emailCc !== undefined) {
    const emailCc = toStr(body.emailCc);
    const invalidCc = validateEmailList(emailCc);
    if (invalidCc) {
      return NextResponse.json(
        { error: `Email em cópia inválido: "${invalidCc}". Separe múltiplos por ";".` },
        { status: 400 },
      );
    }
    data.emailCc = emailCc;
  }

  if (body.nomeResponsavel !== undefined) {
    data.nomeResponsavel = toStr(body.nomeResponsavel);
  }

  if (body.observacoes !== undefined) {
    data.observacoes = toStr(body.observacoes);
  }

  if (body.active !== undefined) {
    data.active = Boolean(body.active);
  }

  try {
    const row = await prisma.distribuidoraEmail.update({
      where: { id },
      data,
    });
    return NextResponse.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Já existe cadastro para a distribuidora "${data.distribuidora}".` },
        { status: 409 },
      );
    }
    console.error("[PUT distribuidora-emails]", err);
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
    await prisma.distribuidoraEmail.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE distribuidora-emails]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
