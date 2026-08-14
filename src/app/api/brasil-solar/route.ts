import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { normalizeCodigoUc } from "@/lib/uc-codigo";
import { buscarIds } from "@/lib/busca-sql";
import { marcaInversor } from "@/lib/marca-inversor";
import { chaveCidade } from "@/lib/cidade-chave";

// GET /api/brasil-solar - Lista paginada de clientes Brasil Solar
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  // Teto de 500: a modal "Vincular Usina" pedia 200 e era clampada em 100 sem
  // aviso, escondendo ~85% da base (1.8k usinas) atras de uma lista alfabetica.
  const limit = Math.min(500, Math.max(10, parseInt(searchParams.get("limit") || "50")));
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const plataforma = searchParams.get("plataforma") || "";
  const marca = searchParams.get("marca") || "";
  const cidade = searchParams.get("cidade") || "";
  const uf = searchParams.get("uf") || "";
  const contrato = searchParams.get("contrato") || "";
  const proprietarioId = searchParams.get("proprietarioId") || "";
  const semProprietario = searchParams.get("semProprietario") === "true";
  const orderBy = searchParams.get("orderBy") || "nome";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  const where: Record<string, unknown> = { active: true };

  if (search) {
    // Busca acento/caixa/pontuacao-insensivel (ver src/lib/busca-sql.ts): o
    // `contains` do Prisma nao acha "JOAO" em "JOÃO" nem casa CPF pontuado com
    // o que esta gravado em digitos.
    const [idsCliente, idsProprietario] = await Promise.all([
      buscarIds({
        tabela: "brasil_solar_clients",
        colunas: ["nome", "cpf_cnpj", "email", "codigo_uc", "codigo_uc_antigo", "cidade"],
        termo: search,
      }),
      buscarIds({
        tabela: "brasil_solar_proprietarios",
        colunas: ["nome"],
        termo: search,
      }),
    ]);
    where.OR = [
      { id: { in: idsCliente ?? [] } },
      { proprietarioId: { in: idsProprietario ?? [] } },
    ];
  }

  if (status) where.statusMonitoramento = status;
  if (plataforma) where.plataformaMonitoramento = plataforma;
  if (uf) where.uf = uf;

  // `AND` e não mais campos soltos: `where.OR` já é da busca por texto, e um
  // segundo `OR` no mesmo objeto sobrescreveria o primeiro em silêncio.
  const and: Record<string, unknown>[] = [];

  if (marca) {
    // Marca EFETIVA = declarada > plataforma (`marcaInversor`, a mesma regra da
    // tag exibida na lista). Casar só `inversorMarca` acharia 78 das 1.918
    // usinas: 1.838 têm o campo nulo e a marca que o operador vê vem da
    // plataforma. Monta-se o `where` pelos PARES realmente existentes, então o
    // resultado é exatamente o conjunto que mostra aquela tag.
    const pares = await prisma.brasilSolarClient.groupBy({
      by: ["inversorMarca", "plataformaMonitoramento"],
      where: { active: true },
    });
    const casam = pares.filter(
      (p) =>
        marcaInversor({
          inversorMarca: p.inversorMarca,
          plataformaMonitoramento: p.plataformaMonitoramento,
        }).marca === marca
    );
    and.push(
      casam.length > 0
        ? {
            OR: casam.map((p) => ({
              inversorMarca: p.inversorMarca,
              plataformaMonitoramento: p.plataformaMonitoramento,
            })),
          }
        : { id: { in: [] } } // marca inexistente: lista vazia, nunca a base toda
    );
  }

  if (cidade) {
    // O parametro é a CHAVE agrupada (ver `cidade-chave.ts`): "santa maria"
    // pega as 10 grafias — `Santa Maria`, `SANTA MARIA`, `Santa Maria/RS`, com
    // e sem espaço sobrando. Comparar o texto cru perdia 139 das 1.234.
    const distintas = await prisma.brasilSolarClient.groupBy({
      by: ["cidade"],
      where: { active: true },
    });
    const variantes = distintas
      .map((c) => c.cidade)
      .filter((c): c is string => !!c && chaveCidade(c) === cidade);
    and.push(variantes.length > 0 ? { cidade: { in: variantes } } : { id: { in: [] } });
  }

  if (and.length > 0) where.AND = and;

  if (contrato) where.statusContrato = contrato;
  if (proprietarioId) where.proprietarioId = proprietarioId;
  if (semProprietario) where.proprietarioId = null;

  const [clients, total] = await Promise.all([
    prisma.brasilSolarClient.findMany({
      where,
      orderBy: { [orderBy]: order },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        nome: true,
        cpfCnpj: true,
        cidade: true,
        uf: true,
        potenciaInstalada: true,
        plataformaMonitoramento: true,
        statusMonitoramento: true,
        statusContrato: true,
        ultimaGeracao: true,
        ultimaLeitura: true,
        geracaoMesAtual: true,
        geracaoMediaEsperada: true,
        performanceRatio: true,
        inversorMarca: true,
        concessionaria: true,
        investimento: true,
        proprietario: {
          select: { id: true, nome: true },
        },
        _count: {
          select: {
            alerts: { where: { status: "ABERTO" } },
          },
        },
      },
    }),
    prisma.brasilSolarClient.count({ where }),
  ]);

  return NextResponse.json({
    clients,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// POST /api/brasil-solar - Criar novo cliente Brasil Solar
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json();

  const client = await prisma.brasilSolarClient.create({
    data: {
      nome: body.nome,
      cpfCnpj: body.cpfCnpj,
      email: body.email,
      telefone: body.telefone,
      endereco: body.endereco,
      cidade: body.cidade,
      uf: body.uf,
      latitude: body.latitude !== "" && body.latitude != null ? parseFloat(body.latitude) : null,
      longitude: body.longitude !== "" && body.longitude != null ? parseFloat(body.longitude) : null,
      potenciaInstalada: body.potenciaInstalada ? parseFloat(body.potenciaInstalada) : null,
      dataInstalacao: body.dataInstalacao ? new Date(body.dataInstalacao) : null,
      modulosMarca: body.modulosMarca,
      modulosModelo: body.modulosModelo,
      modulosQuantidade: body.modulosQuantidade ? parseInt(body.modulosQuantidade) : null,
      inversorMarca: body.inversorMarca,
      inversorModelo: body.inversorModelo,
      inversorQuantidade: body.inversorQuantidade ? parseInt(body.inversorQuantidade) : null,
      inversorPotencia: body.inversorPotencia ? parseFloat(body.inversorPotencia) : null,
      plataformaMonitoramento: body.plataformaMonitoramento,
      monitoramentoLogin: body.monitoramentoLogin,
      monitoramentoSenha: body.monitoramentoSenha,
      monitoramentoUrl: body.monitoramentoUrl,
      monitoramentoPlantId: body.monitoramentoPlantId,
      concessionaria: body.concessionaria,
      codigoUc: normalizeCodigoUc(body.codigoUc),
      codigoUcAntigo: normalizeCodigoUc(body.codigoUcAntigo) || null,
      statusContrato: body.statusContrato || "ATIVO",
      dataContrato: body.dataContrato ? new Date(body.dataContrato) : null,
      consultor: body.consultor,
      garantiaAte: body.garantiaAte ? new Date(body.garantiaAte) : null,
      geracaoMediaEsperada: body.geracaoMediaEsperada ? parseFloat(body.geracaoMediaEsperada) : null,
      investimento: body.investimento ? parseFloat(body.investimento) : null,
      observacoesInternas: body.observacoesInternas,
      consumerId: body.consumerId,
      plantId: body.plantId,
      proprietarioId: body.proprietarioId || null,
    },
  });

  return NextResponse.json(client, { status: 201 });
}
