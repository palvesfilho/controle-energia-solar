import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { serializeObraObservacoes } from "@/lib/obra-meta";
import { parseDateOnly } from "@/lib/obra-calendario";
import { encrypt } from "@/lib/crypto";

const DISTRIBUIDORAS_PORTAL = new Set([
  "RGE",
  "CPFL_PAULISTA",
  "CPFL_PIRATININGA",
]);

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

const EXECUTADO_POR_VALORES = new Set(["BRASIL_SOLAR", "TERCEIRO"]);

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

  // executadoPor define se Brasil Solar executa a obra (fluxo completo,
  // com Obra+tarefas auto) ou se é só monitoramento de usina de terceiro.
  const executadoPor =
    typeof body.executadoPor === "string" ? body.executadoPor.trim() : "BRASIL_SOLAR";
  if (!EXECUTADO_POR_VALORES.has(executadoPor)) {
    return NextResponse.json(
      { error: "Campo 'executadoPor' inválido (use BRASIL_SOLAR ou TERCEIRO)" },
      { status: 400 }
    );
  }
  const isTerceiro = executadoPor === "TERCEIRO";

  // ---- Validação dos campos do contrato/obra ---------------------------
  // Quando executadoPor=TERCEIRO, Brasil Solar não executa obra: os campos
  // de telhado/data/prazo ficam nulos e o fluxo automático de Obra/tarefas
  // é pulado mais abaixo.
  let tipoTelhado: string | null = null;
  let tipoTelhadoOutro: string | null = null;
  let dataPagamento: Date | null = null;
  let prazoContratoDias: number | null = null;

  if (!isTerceiro) {
    const t = typeof body.tipoTelhado === "string" ? body.tipoTelhado.trim() : "";
    if (!t || !TIPOS_TELHADO.has(t)) {
      return NextResponse.json(
        { error: "Tipo de telhado inválido ou ausente" },
        { status: 400 }
      );
    }

    if (t === "MISTO") {
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

    const dp = parseDateOnly(
      typeof body.dataPagamento === "string" ? body.dataPagamento : null
    );
    if (!dp) {
      return NextResponse.json(
        { error: "Data de pagamento inválida ou ausente" },
        { status: 400 }
      );
    }

    const pcd = toInt(body.prazoContratoDias);
    if (!pcd || pcd <= 0) {
      return NextResponse.json(
        { error: "Prazo do contrato deve ser maior que zero" },
        { status: 400 }
      );
    }
    if (TIPOS_COM_ESTRUTURA.has(t) && pcd < PRAZO_MIN_CARPORT_SOLO) {
      return NextResponse.json(
        {
          error: `Para CARPORT/USINA DE SOLO o prazo precisa ser de no mínimo ${PRAZO_MIN_CARPORT_SOLO} dias (3d estrutura + 15d intervalo + instalação)`,
        },
        { status: 400 }
      );
    }

    tipoTelhado = t;
    dataPagamento = dp;
    prazoContratoDias = pcd;
  }
  // ----------------------------------------------------------------------

  const planta = body.planta && typeof body.planta === "object" ? body.planta : {};

  // codigoUc e concessionaria podem vir direto no body (form de cadastro manual)
  // ou dentro de `planta` (prefill do Anexo F). Direto no body tem precedência.
  const codigoUcInput =
    (typeof body.codigoUc === "string" && body.codigoUc.trim()) ||
    (typeof planta.codigoUc === "string" && planta.codigoUc.trim()) ||
    null;
  const concessionariaInput =
    (typeof body.concessionaria === "string" && body.concessionaria.trim()) ||
    (typeof planta.concessionaria === "string" && planta.concessionaria.trim()) ||
    null;

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
      executadoPor,
      tipoTelhado,
      tipoTelhadoOutro,
      dataPagamento,
      prazoContratoDias,
      latitude: toFloat(planta.latitude),
      longitude: toFloat(planta.longitude),
      codigoUc: codigoUcInput,
      concessionaria: concessionariaInput,
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

  // Cria automaticamente a ConsumerUnit quando o código UC foi informado.
  // Não falha o cadastro do proprietário se a UC não puder ser criada
  // (ex.: código já em uso).
  let consumerUnitId: string | null = null;
  if (codigoUcInput) {
    try {
      const existing = await prisma.consumerUnit.findUnique({
        where: { codigoUc: codigoUcInput },
      });
      if (existing) {
        consumerUnitId = existing.id;
      } else {
        const created = await prisma.consumerUnit.create({
          data: {
            nome: proprietario.nome,
            codigoUc: codigoUcInput,
            cpfCnpj: proprietario.cpfCnpj,
            distribuidora: concessionariaInput,
            cidade: proprietario.cidade,
            origem: "BRASIL_SOLAR_TITULAR",
          },
        });
        consumerUnitId = created.id;
      }
    } catch (e) {
      console.error("[POST /brasil-solar/proprietarios] auto-UC falhou:", e);
    }
  }

  // Cria a credencial de acesso à concessionária (CpflCredential, usada também
  // para RGE) quando o bloco `portal` veio no body e a UC já existe. Senha é
  // sempre criptografada (AES-GCM via encrypt()). Falha aqui não derruba o
  // cadastro do proprietário/UC.
  const portal =
    body.portal && typeof body.portal === "object" ? body.portal : null;
  if (consumerUnitId && portal) {
    try {
      const distribuidora =
        typeof portal.distribuidora === "string" ? portal.distribuidora.trim() : "";
      const email = typeof portal.email === "string" ? portal.email.trim() : "";
      const senha = typeof portal.senha === "string" ? portal.senha : "";
      const instalacao =
        (typeof portal.instalacao === "string" && portal.instalacao.trim()) ||
        codigoUcInput ||
        "";

      if (
        distribuidora &&
        DISTRIBUIDORAS_PORTAL.has(distribuidora) &&
        email &&
        senha &&
        instalacao
      ) {
        const existingCred = await prisma.cpflCredential.findUnique({
          where: { consumerUnitId },
        });
        if (!existingCred) {
          await prisma.cpflCredential.create({
            data: {
              consumerUnitId,
              emailCpfl: email,
              senhaCpfl: encrypt(senha),
              instalacao,
              distribuidora,
              statusSync: "PENDING",
            },
          });
        }
      }
    } catch (e) {
      console.error("[POST /brasil-solar/proprietarios] auto-credencial falhou:", e);
    }
  }

  // Sistema executado por terceiro: Brasil Solar só monitora geração e créditos,
  // não cria Obra nem tarefas de gestão de obra.
  if (!isTerceiro && dataPagamento && prazoContratoDias && tipoTelhado) {
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
