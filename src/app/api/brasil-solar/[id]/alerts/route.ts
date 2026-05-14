import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getAcaoRequeridaDefault } from "@/lib/alertas-usinas";

// POST /api/brasil-solar/[id]/alerts - Criar alerta
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const alert = await prisma.monitoringAlert.create({
    data: {
      clientId: id,
      tipo: body.tipo,
      severidade: body.severidade || "MEDIA",
      acaoRequerida: body.acaoRequerida ?? getAcaoRequeridaDefault(body.tipo),
      titulo: body.titulo,
      descricao: body.descricao,
    },
  });

  // Atualizar status do cliente se alerta critico
  if (body.severidade === "CRITICA" || body.severidade === "ALTA") {
    await prisma.brasilSolarClient.update({
      where: { id },
      data: { statusMonitoramento: "ALERTA" },
    });
  }

  return NextResponse.json(alert, { status: 201 });
}

// PUT /api/brasil-solar/[id]/alerts - Atualizar alerta (resolver/ignorar)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json();

  const alert = await prisma.monitoringAlert.update({
    where: { id: body.alertId },
    data: {
      status: body.status,
      resolvidoPor: body.status === "RESOLVIDO" ? session.user.name : undefined,
      resolvidoEm: body.status === "RESOLVIDO" ? new Date() : undefined,
      observacaoResolucao: body.observacaoResolucao,
      notificadoCliente: body.notificadoCliente ?? undefined,
      notificadoEngenharia: body.notificadoEngenharia ?? undefined,
    },
  });

  return NextResponse.json(alert);
}
