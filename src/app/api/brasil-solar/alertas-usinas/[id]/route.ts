import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ACOES_REQUERIDAS, type AcaoRequerida } from "@/lib/alertas-usinas";

const STATUS_VALIDOS = ["ABERTO", "EM_ANDAMENTO", "RESOLVIDO", "IGNORADO"] as const;
type StatusAlerta = (typeof STATUS_VALIDOS)[number];

// PATCH /api/brasil-solar/alertas-usinas/[id]
// body: { acaoRequerida?: AcaoRequerida | null, status?: StatusAlerta,
//         codigoErroFabricante?: string | null, observacaoResolucao?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    acaoRequerida?: AcaoRequerida | null;
    status?: StatusAlerta;
    codigoErroFabricante?: string | null;
    observacaoResolucao?: string;
  };

  const data: {
    acaoRequerida?: AcaoRequerida | null;
    status?: StatusAlerta;
    codigoErroFabricante?: string | null;
    resolvidoPor?: string | null;
    resolvidoEm?: Date | null;
    observacaoResolucao?: string | null;
  } = {};

  if (body.acaoRequerida !== undefined) {
    if (
      body.acaoRequerida !== null &&
      !ACOES_REQUERIDAS.includes(body.acaoRequerida)
    ) {
      return NextResponse.json(
        { error: "acaoRequerida inválida" },
        { status: 400 },
      );
    }
    data.acaoRequerida = body.acaoRequerida;
  }

  if (body.codigoErroFabricante !== undefined) {
    if (body.codigoErroFabricante === null) {
      data.codigoErroFabricante = null;
    } else if (typeof body.codigoErroFabricante === "string") {
      const trimmed = body.codigoErroFabricante.trim();
      data.codigoErroFabricante = trimmed.length > 0 ? trimmed : null;
    } else {
      return NextResponse.json(
        { error: "codigoErroFabricante inválido" },
        { status: 400 },
      );
    }
  }

  if (body.status !== undefined) {
    if (!STATUS_VALIDOS.includes(body.status)) {
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    }
    data.status = body.status;
    if (body.status === "RESOLVIDO") {
      data.resolvidoPor = session.user.name ?? "Operador";
      data.resolvidoEm = new Date();
      data.observacaoResolucao = body.observacaoResolucao ?? null;
    } else if (body.status === "ABERTO" || body.status === "EM_ANDAMENTO") {
      data.resolvidoPor = null;
      data.resolvidoEm = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada a atualizar" }, { status: 400 });
  }

  try {
    const alert = await prisma.monitoringAlert.update({
      where: { id },
      data,
    });
    return NextResponse.json(alert);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
