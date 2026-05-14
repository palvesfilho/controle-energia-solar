import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

type Body = {
  nome?: string;
  telefoneResponsavel?: string | null;
  cor?: string | null;
  active?: boolean;
};

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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const equipes = await prisma.equipeExecucao.findMany({
      orderBy: [{ active: "desc" }, { nome: "asc" }],
    });
    return NextResponse.json(equipes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/personalizacoes/equipes] erro:", err);
    return NextResponse.json(
      {
        error: msg,
        hint: "Se mencionar 'equipeExecucao' ou 'Unknown arg', rode `npx prisma generate` com o dev server parado.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const nome = toStr(body.nome);

  if (!nome) {
    return NextResponse.json(
      { error: "Nome da equipe é obrigatório." },
      { status: 400 }
    );
  }

  try {
    const equipe = await prisma.equipeExecucao.create({
      data: {
        nome,
        telefoneResponsavel: toStr(body.telefoneResponsavel),
        cor: toHexColor(body.cor),
        active: body.active ?? true,
      },
    });
    return NextResponse.json(equipe, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Já existe uma equipe com o nome "${nome}".` },
        { status: 409 }
      );
    }
    console.error("[POST /api/admin/personalizacoes/equipes] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
