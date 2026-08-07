/**
 * GET /api/brasil-solar/proprietarios/[id]/bills
 *
 * Faturas de TODAS as UCs do proprietário (titular + beneficiárias), já
 * agrupadas por UC. A titular vem primeiro.
 *
 * Por que existe: o card "Faturas" da tela do proprietário mostrava só a UC
 * titular, porque recebia um único `consumerUnitId`. As faturas das
 * beneficiárias entravam no banco e não apareciam em lugar nenhum daquela tela
 * — depois de um backfill isso parece que o download falhou, quando não falhou.
 * (Caso CASA ANDRÉ, 07/08/2026.)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { resolverUcsDoProprietario } from "@/lib/brasil-solar-ucs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id },
    select: { id: true, codigoUc: true },
  });
  if (!prop) {
    return NextResponse.json(
      { error: "Proprietário não encontrado" },
      { status: 404 },
    );
  }

  const ucs = await resolverUcsDoProprietario(id, prop.codigoUc);
  if (ucs.length === 0) {
    return NextResponse.json({ grupos: [], total: 0 });
  }

  // Uma consulta só para todas as UCs; o agrupamento é feito aqui.
  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: { in: ucs.map((u) => u.consumerUnitId) } },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    include: { plant: { select: { id: true, name: true } } },
  });

  // `consumerUnitId` é anulável no schema; o filtro acima já exclui os nulos,
  // mas a guarda evita depender disso.
  const porUc = new Map<string, typeof bills>();
  for (const b of bills) {
    if (!b.consumerUnitId) continue;
    const lista = porUc.get(b.consumerUnitId);
    if (lista) lista.push(b);
    else porUc.set(b.consumerUnitId, [b]);
  }

  // A ordem vem de `resolverUcsDoProprietario`: titular primeiro. UC sem
  // fatura nenhuma continua na lista — "vazia" é informação, não ausência.
  const grupos = ucs.map((u) => ({
    consumerUnitId: u.consumerUnitId,
    codigoUc: u.codigoUc,
    nome: u.nome,
    tipo: u.tipo,
    percentual: u.percentual,
    bills: porUc.get(u.consumerUnitId) ?? [],
  }));

  return NextResponse.json({ grupos, total: bills.length });
}
