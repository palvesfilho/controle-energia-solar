import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { serializeObraObservacoes } from "@/lib/obra-meta";

// GET /api/brasil-solar/proprietarios - Lista paginada de proprietarios
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
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
      { nome: { contains: search } },
      { cpfCnpj: { contains: search } },
      { email: { contains: search } },
      { cidade: { contains: search } },
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
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.nome?.trim()) {
    return NextResponse.json({ error: "Nome e obrigatorio" }, { status: 400 });
  }

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
    await prisma.obra.create({
      data: {
        nome: `Instalação — ${proprietario.nome}`,
        descricao: "Obra gerada automaticamente a partir do cadastro do proprietário.",
        cliente: proprietario.nome,
        local: localParts.length ? localParts.join(", ") : null,
        status: "PLANEJAMENTO",
        aprovacao: "PENDENTE",
        brasilSolarProprietarioId: proprietario.id,
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
  } catch (e) {
    // Não falhar a criação do proprietário se a obra não puder ser criada.
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
