import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

// Mesmo mínimo da rota da usina — o motivo é registro de auditoria, não um "ok".
const MOTIVO_MIN = 10;

// Histórico de ativação/desativação da UC, mais recente primeiro.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const historico = await prisma.consumerUnitStatusChange.findMany({
    where: { consumerUnitId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(historico);
}

// Liga/desliga a UC. Gêmea de POST /api/plants/[id]/status: motivo obrigatório,
// usina e histórico na mesma transação, `active` fora do PUT genérico.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ativa = body.active === true || body.active === "true";
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";

  if (motivo.length < MOTIVO_MIN) {
    return NextResponse.json(
      { error: `Descreva o motivo com pelo menos ${MOTIVO_MIN} caracteres` },
      { status: 400 }
    );
  }

  const uc = await prisma.consumerUnit.findUnique({
    where: { id },
    select: { id: true, active: true },
  });
  if (!uc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (uc.active === ativa) {
    return NextResponse.json(
      { error: ativa ? "UC já está ativa" : "UC já está inativa" },
      { status: 409 }
    );
  }

  const [, registro] = await prisma.$transaction([
    prisma.consumerUnit.update({
      where: { id },
      data: {
        active: ativa,
        // A UC tem um terceiro estado ("Pendente") que só existe neste texto.
        // Desativar sempre escreve "Inativo"; reativar volta pra "Ativo" — quem
        // estava "Pendente" e for reativado sai como "Ativo", e o motivo no
        // histórico registra o porquê.
        statusContrato: ativa ? "Ativo" : "Inativo",
      },
    }),
    prisma.consumerUnitStatusChange.create({
      data: {
        consumerUnitId: id,
        ativa,
        motivo,
        usuarioId: session.user.id ?? null,
        usuarioNome:
          session.user.name?.trim() || session.user.email?.trim() || "Operador",
        usuarioEmail: session.user.email ?? null,
      },
    }),
  ]);

  return NextResponse.json({ success: true, registro });
}
