import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { normalizeCodigoUc } from "@/lib/uc-codigo";

const EXECUTADO_POR_VALORES = new Set(["BRASIL_SOLAR", "TERCEIRO"]);

// GET /api/brasil-solar/proprietarios/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const proprietario = await prisma.brasilSolarProprietario.findUnique({
    where: { id },
    include: {
      // Nome da empresa executora, quando executadoPor = TERCEIRO.
      empresaTerceira: { select: { id: true, nome: true } },
      plantas: {
        where: { active: true },
        orderBy: { nome: "asc" },
        select: {
          id: true,
          nome: true,
          potenciaInstalada: true,
          plataformaMonitoramento: true,
          statusMonitoramento: true,
          geracaoMesAtual: true,
          ultimaLeitura: true,
          performanceRatio: true,
          cidade: true,
          uf: true,
          _count: {
            select: { alerts: { where: { status: "ABERTO" } } },
          },
          monitoringPlans: {
            select: { id: true, dataInicio: true, dataFim: true },
          },
        },
      },
    },
  });

  if (!proprietario) {
    return NextResponse.json({ error: "Proprietario nao encontrado" }, { status: 404 });
  }

  return NextResponse.json(proprietario);
}

// PUT /api/brasil-solar/proprietarios/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  // Quem executou o sistema, e — quando é TERCEIRO — qual empresa.
  //
  // `undefined` significa "não mexe neste campo" pro Prisma, e é isso que
  // preserva o resto do PUT: telas que não enviam esses campos continuam
  // funcionando iguais. Só entra no update quem veio no body.
  let executadoPor: string | undefined;
  let empresaTerceiraId: string | null | undefined;

  if (typeof body.executadoPor === "string") {
    const v = body.executadoPor.trim();
    if (!EXECUTADO_POR_VALORES.has(v)) {
      return NextResponse.json(
        { error: "Campo 'executadoPor' inválido (use BRASIL_SOLAR ou TERCEIRO)" },
        { status: 400 },
      );
    }
    executadoPor = v;
  }

  if (body.empresaTerceiraId !== undefined) {
    const bruto = body.empresaTerceiraId;
    const idEmpresa = typeof bruto === "string" ? bruto.trim() : "";
    if (!idEmpresa) {
      empresaTerceiraId = null;
    } else {
      // Valida a FK aqui pra devolver mensagem útil em vez de P2003 cru.
      const empresa = await prisma.empresaTerceira.findUnique({
        where: { id: idEmpresa },
        select: { id: true },
      });
      if (!empresa) {
        return NextResponse.json(
          { error: "Empresa executora não encontrada — recarregue a lista e escolha de novo" },
          { status: 400 },
        );
      }
      empresaTerceiraId = empresa.id;
    }
  }

  // Voltar para BRASIL_SOLAR limpa a empresa: guardá-la deixaria a ficha com uma
  // executora que contradiz o próprio executadoPor.
  if (executadoPor === "BRASIL_SOLAR") empresaTerceiraId = null;

  const proprietario = await prisma.brasilSolarProprietario.update({
    where: { id },
    data: {
      executadoPor,
      empresaTerceiraId,
      nome: body.nome,
      cpfCnpj: body.cpfCnpj,
      email: body.email,
      telefone: body.telefone,
      endereco: body.endereco,
      cidade: body.cidade,
      uf: body.uf,
      observacoes: body.observacoes,
      latitude: body.latitude !== undefined ? toFloat(body.latitude) : undefined,
      longitude: body.longitude !== undefined ? toFloat(body.longitude) : undefined,
      codigoUc: normalizeCodigoUc(body.codigoUc),
      codigoUcAntigo: normalizeCodigoUc(body.codigoUcAntigo),
      concessionaria: body.concessionaria,
      potenciaInstalada: body.potenciaInstalada !== undefined ? toFloat(body.potenciaInstalada) : undefined,
      modulosMarca: body.modulosMarca,
      modulosModelo: body.modulosModelo,
      modulosQuantidade: body.modulosQuantidade !== undefined ? toInt(body.modulosQuantidade) : undefined,
      inversorMarca: body.inversorMarca,
      inversorModelo: body.inversorModelo,
      inversorQuantidade: body.inversorQuantidade !== undefined ? toInt(body.inversorQuantidade) : undefined,
      inversorPotencia: body.inversorPotencia !== undefined ? toFloat(body.inversorPotencia) : undefined,
      numeroFases: body.numeroFases,
      tipoAtendimento: body.tipoAtendimento,
    },
  });

  return NextResponse.json(proprietario);
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

// DELETE /api/brasil-solar/proprietarios/[id] - Soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  // Desvincular plantas antes de desativar
  await prisma.brasilSolarClient.updateMany({
    where: { proprietarioId: id },
    data: { proprietarioId: null },
  });

  await prisma.brasilSolarProprietario.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ message: "Proprietario desativado" });
}
