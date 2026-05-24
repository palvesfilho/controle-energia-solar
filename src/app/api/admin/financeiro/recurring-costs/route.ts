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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.recurringCost.findMany({
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }],
  });
  return NextResponse.json(rows);
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
      { error: "Nome da rubrica é obrigatório." },
      { status: 400 },
    );
  }
  const valorPadrao = Number(body.valorPadrao ?? 0);
  if (!Number.isFinite(valorPadrao) || valorPadrao < 0) {
    return NextResponse.json(
      { error: "Valor padrão inválido." },
      { status: 400 },
    );
  }

  try {
    const row = await prisma.recurringCost.create({
      data: {
        nome,
        categoria: toStr(body.categoria),
        valorPadrao,
        ativo: body.ativo ?? true,
        ordem: Number.isInteger(body.ordem) ? Number(body.ordem) : 0,
        observacao: toStr(body.observacao),
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Já existe rubrica com o nome "${nome}".` },
        { status: 409 },
      );
    }
    console.error("[POST recurring-costs]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
