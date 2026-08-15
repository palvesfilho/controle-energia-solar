import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { buscarIds } from "@/lib/busca-sql";

/**
 * GET /api/brasil-solar/linkable — lista leve de BrasilSolarClient com
 * monitoramento real ativo (monitoramentoPlantId preenchido) disponíveis para
 * vincular a uma Plant do Gestor de Créditos.
 *
 * Query params:
 *  - plantId: inclui também os já vinculados A ESTA plant (permite "re-show"
 *    no seletor caso o usuário queira reconfirmar).
 *  - search: filtra por nome, CPF/CNPJ, codigoUc, cidade.
 *  - skip / limit: paginação ("carregar mais" do seletor). A resposta sempre
 *    traz `total` — a base passa de 1.800 usinas monitoradas e uma página
 *    truncada em silêncio faz o operador achar que a usina não existe.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const plantId = searchParams.get("plantId") || undefined;
  const search = (searchParams.get("search") || "").trim();
  const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10) || 0);
  const limit = Math.min(500, Math.max(20, parseInt(searchParams.get("limit") || "100", 10) || 100));

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
    // Acento/caixa/pontuacao-insensivel (ver src/lib/busca-sql.ts).
    const [idsCliente, idsProprietario] = await Promise.all([
      buscarIds({
        tabela: "brasil_solar_clients",
        colunas: ["nome", "cpf_cnpj", "codigo_uc", "codigo_uc_antigo", "cidade"],
        termo: search,
      }),
      buscarIds({
        tabela: "brasil_solar_proprietarios",
        colunas: ["nome"],
        termo: search,
      }),
    ]);
    const filters = [
      { id: { in: idsCliente ?? [] } },
      { proprietarioId: { in: idsProprietario ?? [] } },
    ];
    if (Array.isArray(where.OR)) {
      where.AND = [{ OR: where.OR }, { OR: filters }];
      delete where.OR;
    } else {
      where.OR = filters;
    }
  }

  const [clients, total] = await Promise.all([
    prisma.brasilSolarClient.findMany({
      where,
      orderBy: { nome: "asc" },
      skip,
      take: limit,
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
    }),
    prisma.brasilSolarClient.count({ where }),
  ]);

  return NextResponse.json({
    clients,
    total,
    skip,
    limit,
    hasMore: skip + clients.length < total,
  });
}
