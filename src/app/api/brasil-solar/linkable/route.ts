import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/brasil-solar/linkable — lista leve de BrasilSolarClient com
 * monitoramento real ativo (monitoramentoPlantId preenchido) disponíveis para
 * vincular a uma Plant do Gestor de Créditos.
 *
 * Query params:
 *  - plantId: inclui também os já vinculados A ESTA plant (permite "re-show"
 *    no seletor caso o usuário queira reconfirmar).
 *  - search: filtra por nome, CPF/CNPJ, codigoUc, cidade.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const plantId = searchParams.get("plantId") || undefined;
  const search = (searchParams.get("search") || "").trim();

  const where: Record<string, unknown> = {
    active: true,
    monitoramentoPlantId: { not: null },
  };

  if (plantId) {
    where.OR = [{ plantId: null }, { plantId }];
  } else {
    where.plantId = null;
  }

  if (search) {
    const filters = [
      { nome: { contains: search } },
      { cpfCnpj: { contains: search } },
      { codigoUc: { contains: search } },
      { cidade: { contains: search } },
    ];
    if (Array.isArray(where.OR)) {
      where.AND = [{ OR: where.OR }, { OR: filters }];
      delete where.OR;
    } else {
      where.OR = filters;
    }
  }

  const clients = await prisma.brasilSolarClient.findMany({
    where,
    orderBy: { nome: "asc" },
    take: 500,
    select: {
      id: true,
      nome: true,
      cpfCnpj: true,
      codigoUc: true,
      cidade: true,
      uf: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      plantId: true,
      ultimaLeitura: true,
      geracaoMesAtual: true,
      potenciaInstalada: true,
      proprietario: { select: { id: true, nome: true } },
    },
  });

  return NextResponse.json({ clients });
}
