import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/brasil-solar/proprietarios/[id]/relatorios
 *
 * Lista as UCs do proprietário Brasil Solar. Inclui a UC titular (mesmo
 * codigoUc do proprietário) + beneficiárias ativas (autoconsumo remoto
 * com rateio). Cada UC vira um relatório próprio.
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

  // Coleta IDs das UCs: titular (busca por codigoUc) + beneficiárias.
  const ucIds = new Set<string>();
  let ucTitular: { id: string; codigoUc: string; nome: string; distribuidora: string | null; active: boolean } | null = null;
  if (proprietario.codigoUc) {
    ucTitular = await prisma.consumerUnit.findFirst({
      where: { codigoUc: proprietario.codigoUc },
      select: { id: true, codigoUc: true, nome: true, distribuidora: true, active: true },
    });
    if (ucTitular) ucIds.add(ucTitular.id);
  }

  const beneficiarias = await prisma.brasilSolarBeneficiaria.findMany({
    where: { proprietarioId: id, active: true, consumerUnitId: { not: null } },
    select: {
      percentual: true,
      consumerUnit: {
        select: { id: true, codigoUc: true, nome: true, distribuidora: true, active: true },
      },
    },
  });
  const beneficiariasInfo = beneficiarias
    .filter((b) => b.consumerUnit != null)
    .map((b) => ({ uc: b.consumerUnit!, percentual: b.percentual }));
  for (const b of beneficiariasInfo) ucIds.add(b.uc.id);

  if (ucIds.size === 0) {
    return NextResponse.json({ proprietario, ucs: [] });
  }

  // Usinas monitoradas (BSCs) ativas do proprietário — totais usados nos cards.
  const monitoringClients = await prisma.brasilSolarClient.findMany({
    where: { proprietarioId: id, active: true },
    select: { id: true, potenciaInstalada: true, investimento: true },
  });
  const investimentoTotal = monitoringClients.reduce(
    (sum, c) => sum + (c.investimento ?? 0),
    0,
  );
  const potenciaTotalKwp = monitoringClients.reduce(
    (sum, c) => sum + (c.potenciaInstalada ?? 0),
    0,
  );

  // Última fatura por UC (em batch)
  const ultimasBills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: { in: Array.from(ucIds) } },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: { consumerUnitId: true, anoReferencia: true, mesReferencia: true },
  });
  const ultimaBillByUc = new Map<string, { anoReferencia: number; mesReferencia: number }>();
  for (const b of ultimasBills) {
    if (!b.consumerUnitId || ultimaBillByUc.has(b.consumerUnitId)) continue;
    ultimaBillByUc.set(b.consumerUnitId, {
      anoReferencia: b.anoReferencia,
      mesReferencia: b.mesReferencia,
    });
  }

  const ucs: Array<{
    ucId: string;
    codigoUc: string;
    nome: string;
    distribuidora: string | null;
    active: boolean;
    papel: "TITULAR" | "BENEFICIARIA";
    percentual: number | null;
    usinasMonitoradas: number;
    potenciaTotalKwp: number;
    investimentoTotal: number;
    ultimaFatura: { anoReferencia: number; mesReferencia: number } | null;
  }> = [];

  if (ucTitular) {
    ucs.push({
      ucId: ucTitular.id,
      codigoUc: ucTitular.codigoUc,
      nome: ucTitular.nome,
      distribuidora: ucTitular.distribuidora,
      active: ucTitular.active,
      papel: "TITULAR",
      percentual: null,
      usinasMonitoradas: monitoringClients.length,
      potenciaTotalKwp,
      investimentoTotal,
      ultimaFatura: ultimaBillByUc.get(ucTitular.id) ?? null,
    });
  }
  for (const b of beneficiariasInfo) {
    ucs.push({
      ucId: b.uc.id,
      codigoUc: b.uc.codigoUc,
      nome: b.uc.nome,
      distribuidora: b.uc.distribuidora,
      active: b.uc.active,
      papel: "BENEFICIARIA",
      percentual: b.percentual,
      usinasMonitoradas: monitoringClients.length,
      potenciaTotalKwp,
      investimentoTotal,
      ultimaFatura: ultimaBillByUc.get(b.uc.id) ?? null,
    });
  }

  return NextResponse.json({ proprietario, ucs });
}
