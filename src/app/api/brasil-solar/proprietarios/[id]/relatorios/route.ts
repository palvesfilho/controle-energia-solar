import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/brasil-solar/proprietarios/[id]/relatorios
 *
 * Lista as UCs do proprietário Brasil Solar. Modelo de ligação:
 *   BrasilSolarProprietario.codigoUc → ConsumerUnit.codigoUc
 * (1 proprietário tem 1 UC; agrega N usinas monitoradas/BSCs nessa UC).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const proprietario = await prisma.brasilSolarProprietario.findUnique({
    where: { id },
    select: { id: true, nome: true, cidade: true, uf: true, codigoUc: true },
  });
  if (!proprietario) {
    return NextResponse.json(
      { error: "Proprietário não encontrado" },
      { status: 404 },
    );
  }

  if (!proprietario.codigoUc) {
    return NextResponse.json({ proprietario, ucs: [] });
  }

  // UC no cadastro interno com mesmo código
  const uc = await prisma.consumerUnit.findFirst({
    where: { codigoUc: proprietario.codigoUc },
    select: {
      id: true,
      codigoUc: true,
      nome: true,
      distribuidora: true,
      active: true,
    },
  });

  if (!uc) {
    return NextResponse.json({ proprietario, ucs: [] });
  }

  // Usinas monitoradas (BSCs) ativas do proprietário
  const monitoringClients = await prisma.brasilSolarClient.findMany({
    where: { proprietarioId: id, active: true },
    select: {
      id: true,
      nome: true,
      potenciaInstalada: true,
      investimento: true,
    },
  });

  const investimentoTotal = monitoringClients.reduce(
    (sum, c) => sum + (c.investimento ?? 0),
    0,
  );
  const potenciaTotalKwp = monitoringClients.reduce(
    (sum, c) => sum + (c.potenciaInstalada ?? 0),
    0,
  );

  const ultimaBill = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: uc.id },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: { anoReferencia: true, mesReferencia: true },
  });

  return NextResponse.json({
    proprietario,
    ucs: [
      {
        ucId: uc.id,
        codigoUc: uc.codigoUc,
        nome: uc.nome,
        distribuidora: uc.distribuidora,
        active: uc.active,
        usinasMonitoradas: monitoringClients.length,
        potenciaTotalKwp,
        investimentoTotal,
        ultimaFatura: ultimaBill,
      },
    ],
  });
}
