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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.distribuidoraEmail.findMany({
    orderBy: [{ active: "desc" }, { distribuidora: "asc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const distribuidora = toStr(body.distribuidora);
  const emailDestino = toStr(body.emailDestino);
  const emailRemetente = toStr(body.emailRemetente);
  const emailCc = toStr(body.emailCc);

  if (!distribuidora) {
    return NextResponse.json({ error: "Distribuidora é obrigatória." }, { status: 400 });
  }
  if (!emailDestino || !isEmail(emailDestino)) {
    return NextResponse.json({ error: "Email de destino inválido." }, { status: 400 });
  }
  if (!emailRemetente || !isEmail(emailRemetente)) {
    return NextResponse.json({ error: "Email de remetente inválido." }, { status: 400 });
  }
  const invalidCc = validateEmailList(emailCc);
  if (invalidCc) {
    return NextResponse.json(
      { error: `Email em cópia inválido: "${invalidCc}". Separe múltiplos por ";".` },
      { status: 400 },
    );
  }

  try {
    const row = await prisma.distribuidoraEmail.create({
      data: {
        distribuidora,
        emailDestino,
        emailRemetente,
        emailCc,
        nomeResponsavel: toStr(body.nomeResponsavel),
        observacoes: toStr(body.observacoes),
        active: body.active ?? true,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Já existe cadastro para a distribuidora "${distribuidora}".` },
        { status: 409 },
      );
    }
    console.error("[POST distribuidora-emails]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
