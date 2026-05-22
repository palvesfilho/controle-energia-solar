import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { serializeObraObservacoes } from "@/lib/obra-meta";
import { parseDateOnly } from "@/lib/obra-calendario";

const TIPOS_TELHADO = new Set([
  "FIBROCIMENTO",
  "CERAMICO",
  "LAJE",
  "CARPORT",
  "USINA_DE_SOLO",
  "CALHETAO_FIBROCIMENTO",
  "CALHETAO_METALICO",
  "MISTO",
]);

const TIPOS_COM_ESTRUTURA = new Set(["CARPORT", "USINA_DE_SOLO"]);
const ESTRUTURA_DURACAO_DIAS = 3;
const LAG_ENTRE_TAREFAS = 15;
const PRAZO_MIN_CARPORT_SOLO =
  ESTRUTURA_DURACAO_DIAS + LAG_ENTRE_TAREFAS + 1; // T1 + lag + ao menos 1 dia de T2

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// GET /api/brasil-solar/proprietarios - Lista paginada de proprietarios
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "50")));
  const search = searchParams.get("search") || "";
  const orderBy = searchParams.get("orderBy") || "nome";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";
  const all = searchParams.get("all") === "true";

  const where: Record<string, unknown> = { active: true };

  if (search) {
    where.OR = [
      { nome: { contains: search, mode: "insensitive" } },
      { cpfCnpj: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { cidade: { contains: search, mode: "insensitive" } },
    ];
  }

  // Modo "all" para o combobox de selecao (retorna id + nome apenas)
  if (all) {
    const proprietarios = await prisma.brasilSolarProprietario.findMany({
      where,
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cpfCnpj: true },
    });
    return NextResponse.json({ proprietarios });
  }

  const [proprietarios, total] = await Promise.all([
    prisma.brasilSolarProprietario.findMany({
      where,
      orderBy: { [orderBy]: order },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        nome: true,
        cpfCnpj: true,
        email: true,
        telefone: true,
        cidade: true,
        uf: true,
        createdAt: true,
        _count: {
          select: { plantas: true },
        },
      },
    }),
    prisma.brasilSolarProprietario.count({ where }),
  ]);

  return NextResponse.json({
    proprietarios,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// POST /api/brasil-solar/proprietarios - Criar proprietario
// Aceita opcionalmente body.planta {...} com os dados técnicos extraídos
// do Anexo F (latitude, longitude, módulos, inversor, UC, concessionária).
// Esses campos ficam no próprio Proprietário — a usina em si é sincronizada
// por API (Fronius/SolarEdge/...) e vinculada manualmente depois.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  // ---- Validação dos campos novos do contrato/obra ---------------------
  const tipoTelhado =
    typeof body.tipoTelhado === "string" ? body.tipoTelhado.trim() : "";
  if (!tipoTelhado || !TIPOS_TELHADO.has(tipoTelhado)) {
    return NextResponse.json(
      { error: "Tipo de telhado inválido ou ausente" },
      { status: 400 }
    );
  }

  let tipoTelhadoOutro: string | null = null;
  if (tipoTelhado === "MISTO") {
    const v =
      typeof body.tipoTelhadoOutro === "string" ? body.tipoTelhadoOutro.trim() : "";
    if (!v) {
      return NextResponse.json(
        { error: "Descreva o tipo de telhado misto" },
        { status: 400 }
      );
    }
    tipoTelhadoOutro = v;
  }

  const dataPagamento = parseDateOnly(
    typeof body.dataPagamento === "string" ? body.dataPagamento : null
  );
  if (!dataPagamento) {
    return NextResponse.json(
      { error: "Data de pagamento inválida ou ausente" },
      { status: 400 }
    );
  }

  const prazoContratoDias = toInt(body.prazoContratoDias);
  if (!prazoContratoDias || prazoContratoDias <= 0) {
    return NextResponse.json(
      { error: "Prazo do contrato deve ser maior que zero" },
      { status: 400 }
    );
  }
  if (
    TIPOS_COM_ESTRUTURA.has(tipoTelhado) &&
    prazoContratoDias < PRAZO_MIN_CARPORT_SOLO
  ) {
    return NextResponse.json(
      {
        error: `Para CARPORT/USINA DE SOLO o prazo precisa ser de no mínimo ${PRAZO_MIN_CARPORT_SOLO} dias (3d estrutura + 15d intervalo + instalação)`,
      },
      { status: 400 }
    );
  }
  // ----------------------------------------------------------------------

  const planta = body.planta && typeof body.planta === "object" ? body.planta : {};

  const proprietario = await prisma.brasilSolarProprietario.create({
    data: {
      nome: body.nome.trim(),
      cpfCnpj: body.cpfCnpj?.trim() || null,
      email: body.email?.trim() || null,
      telefone: body.telefone?.trim() || null,
      endereco: body.endereco?.trim() || null,
      cidade: body.cidade?.trim() || null,
      uf: body.uf?.trim() || null,
      observacoes: body.observacoes?.trim() || null,
      tipoTelhado,
      tipoTelhadoOutro,
      dataPagamento,
      prazoContratoDias,
      latitude: toFloat(planta.latitude),
      longitude: toFloat(planta.longitude),
      codigoUc: planta.codigoUc?.toString().trim() || null,
      concessionaria: planta.concessionaria?.toString().trim() || null,
      potenciaInstalada: toFloat(planta.potenciaInstalada),
      modulosMarca: planta.modulosMarca?.toString().trim() || null,
      modulosModelo: planta.modulosModelo?.toString().trim() || null,
      modulosQuantidade: toInt(planta.modulosQuantidade),
      inversorMarca: planta.inversorMarca?.toString().trim() || null,
      inversorModelo: planta.inversorModelo?.toString().trim() || null,
      inversorQuantidade: toInt(planta.inversorQuantidade),
      inversorPotencia: toFloat(planta.inversorPotencia),
      numeroFases: planta.numeroFases?.toString().trim() || null,
      tipoAtendimento: planta.tipoAtendimento?.toString().trim() || null,
    },
  });

  try {
    const localParts = [proprietario.endereco, proprietario.cidade, proprietario.uf].filter(Boolean);
    const dataFimPrevista = addDays(dataPagamento, prazoContratoDias);

    const obra = await prisma.obra.create({
      data: {
        nome: `Instalação — ${proprietario.nome}`,
        descricao: "Obra gerada automaticamente a partir do cadastro do proprietário.",
        cliente: proprietario.nome,
        local: localParts.length ? localParts.join(", ") : null,
        status: "PLANEJAMENTO",
        aprovacao: "PENDENTE",
        brasilSolarProprietarioId: proprietario.id,
        dataInicioPrevista: dataPagamento,
        dataFimPrevista,
        observacoes: serializeObraObservacoes(
          {
            proprietarioId: proprietario.id,
            potenciaKwp: proprietario.potenciaInstalada ?? null,
            inversorPotenciaKw: proprietario.inversorPotencia ?? null,
          },
          null
        ),
      },
    });

    if (TIPOS_COM_ESTRUTURA.has(tipoTelhado)) {
      const estruturaLabel = tipoTelhado === "CARPORT" ? "CARPORT" : "USINA DE SOLO";
      const tarefa1Fim = addDays(dataPagamento, ESTRUTURA_DURACAO_DIAS);
      const tarefa2Inicio = addDays(tarefa1Fim, LAG_ENTRE_TAREFAS);
      const tarefa2DuracaoDias = Math.max(
        1,
        prazoContratoDias - ESTRUTURA_DURACAO_DIAS - LAG_ENTRE_TAREFAS
      );
      const tarefa2Fim = addDays(tarefa2Inicio, tarefa2DuracaoDias);

      const tarefa1 = await prisma.obraTarefa.create({
        data: {
          obraId: obra.id,
          nome: `Execução da estrutura de fixação — ${estruturaLabel}`,
          ordem: 0,
          dataInicioPlan: dataPagamento,
          dataFimPlan: tarefa1Fim,
          duracaoDias: ESTRUTURA_DURACAO_DIAS,
          status: "NAO_INICIADA",
        },
      });

      const tarefa2 = await prisma.obraTarefa.create({
        data: {
          obraId: obra.id,
          nome: "Instalação do sistema fotovoltaico",
          ordem: 1,
          dataInicioPlan: tarefa2Inicio,
          dataFimPlan: tarefa2Fim,
          duracaoDias: tarefa2DuracaoDias,
          status: "NAO_INICIADA",
        },
      });

      await prisma.tarefaDependencia.create({
        data: {
          tarefaId: tarefa2.id,
          dependeDeId: tarefa1.id,
          tipo: "FS",
          lagDias: LAG_ENTRE_TAREFAS,
        },
      });
    }
  } catch (e) {
    // Não falhar a criação do proprietário se a obra/tarefas não puderem ser criadas.
    console.error("[POST /brasil-solar/proprietarios] auto-obra falhou:", e);
  }

  return NextResponse.json(proprietario, { status: 201 });
}

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
