import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

// Motivo curto demais não é registro, é ruído — "ok", "x", "sim" não explicam
// nada pra quem ler a auditoria daqui a seis meses.
const MOTIVO_MIN = 10;

// Histórico de ativação/desativação da usina, mais recente primeiro.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const historico = await prisma.plantStatusChange.findMany({
    where: { plantId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(historico);
}

// Liga/desliga a usina. Endpoint separado do PUT genérico porque aqui o motivo
// é obrigatório e a gravação do histórico não pode ser opcional — pelo PUT
// daria pra mudar `active` sem deixar rastro.
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

  const plant = await prisma.plant.findUnique({
    where: { id },
    select: { id: true, active: true },
  });
  if (!plant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (plant.active === ativa) {
    return NextResponse.json(
      { error: ativa ? "Usina já está ativa" : "Usina já está inativa" },
      { status: 409 }
    );
  }

  // Transação: usina e histórico mudam juntos ou não mudam. Sem isso dá pra
  // acabar com usina desativada e nenhum registro de quem fez.
  const [, registro] = await prisma.$transaction([
    prisma.plant.update({
      where: { id },
      data: {
        active: ativa,
        // O texto que a lista de usinas exibia antes do `active` virar a fonte
        // da verdade. Mantido em sincronia pra telas antigas não contradizerem.
        statusContrato: ativa ? "Ativo" : "Inativo",
      },
    }),
    prisma.plantStatusChange.create({
      data: {
        plantId: id,
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
