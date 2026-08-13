import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { normalizeCodigoUc, whereCodigoUc } from "@/lib/uc-codigo";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const consumerId = searchParams.get("consumerId");
  const plantId = searchParams.get("plantId");
  const distribuidora = searchParams.get("distribuidora");
  const status = searchParams.get("status");
  const codigoUc = searchParams.get("codigoUc");

  const where: Record<string, unknown> = {};
  if (consumerId) where.consumerId = consumerId;
  if (plantId) where.plantId = plantId;
  if (distribuidora) where.distribuidora = distribuidora;
  if (status) where.statusContrato = status;
  // Busca por código: normaliza (formato pontuado → dígitos) e casa pelo novo OU
  // pelo antigo, pra achar a UC independentemente do formato/versão informada.
  if (codigoUc) {
    const norm = normalizeCodigoUc(codigoUc);
    where.OR = [{ codigoUc: norm }, { codigoUcAntigo: norm }];
  }

  // Esconde UCs que representam usinas sem investidor (sÃ£o da Ã¡rea Brasil
  // Solar, nÃ£o devem aparecer em Clientes). UCs com cliente fÃ­sico vinculado
  // (consumerId) ou sem plant continuam visÃ­veis. Override com ?showAll=1.
  // TambÃ©m esconde UCs de cliente Brasil Solar (titular + beneficiÃ¡rias):
  // elas tÃªm gestÃ£o prÃ³pria na Ã¡rea Brasil Solar e nÃ£o devem poluir a tela
  // de gestÃ£o de UCs que recebem crÃ©ditos de investidor.
  //
  // Consultas POR codigoUc especÃ­fico nÃ£o aplicam esses filtros â€” quem busca
  // um cÃ³digo quer aquela UC exata (usado p/ ex. pela pÃ¡gina do proprietÃ¡rio
  // Brasil Solar pra achar a UC titular).
  const showAll = searchParams.get("showAll") === "1";
  if (!showAll && !codigoUc) {
    where.AND = [
      {
        OR: [
          { plantId: null },
          { consumerId: { not: null } },
          { plant: { usinaDeInvestidor: true } },
        ],
      },
      {
        origem: { notIn: ["BRASIL_SOLAR_TITULAR", "BRASIL_SOLAR_BENEFICIARIA"] },
      },
    ];
  }

  const units = await prisma.consumerUnit.findMany({
    where,
    include: {
      consumer: { select: { id: true, name: true } },
      plant: { select: { id: true, name: true } },
    },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(units);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.nome || !body.codigoUc) {
    return NextResponse.json(
      { error: "Nome e CÃ³digo da UC sÃ£o obrigatÃ³rios" },
      { status: 400 }
    );
  }

  const codigoUc = normalizeCodigoUc(body.codigoUc);
  const codigoUcAntigo = normalizeCodigoUc(body.codigoUcAntigo) || null;

  // Duplicata: procura pelo código novo E pelo antigo, nos DOIS campos. Antes era um
  // `findUnique` só em `codigoUc`, e a RGE trocou os números das UCs (REN 1095/24): a
  // UC que já existe guarda o código velho em `codigoUcAntigo`, então cadastrar com o
  // número que a fatura ainda mostra passava batido e criava uma SEGUNDA UC da mesma
  // unidade — uma com o histórico, outra vazia. Aconteceu duas vezes (ROSELAINE e
  // JEFERSON, 12/08/2026). `whereCodigoUc` é a regra única de código→UC.
  const informados = [codigoUc, codigoUcAntigo].filter(Boolean) as string[];
  for (const informado of informados) {
    const existing = await prisma.consumerUnit.findFirst({
      where: whereCodigoUc(informado),
      select: { id: true, nome: true, codigoUc: true, codigoUcAntigo: true },
    });
    if (existing) {
      const porQual =
        normalizeCodigoUc(existing.codigoUc) === normalizeCodigoUc(informado)
          ? "código atual"
          : "código antigo";
      return NextResponse.json(
        {
          error:
            `Já existe uma UC com esse código: "${existing.nome}" ` +
            `(${existing.codigoUc}${existing.codigoUcAntigo ? ` / antigo ${existing.codigoUcAntigo}` : ""}) ` +
            `— casou pelo ${porQual}. Se for a mesma unidade com número novo da RGE, ` +
            `edite a UC existente e preencha o "código antigo" em vez de criar outra.`,
        },
        { status: 400 }
      );
    }
  }

  const allowedOrigem = new Set([
    "PADRAO",
    "BRASIL_SOLAR_TITULAR",
    "BRASIL_SOLAR_BENEFICIARIA",
  ]);
  const origem =
    typeof body.origem === "string" && allowedOrigem.has(body.origem)
      ? body.origem
      : "PADRAO";

  const unit = await prisma.consumerUnit.create({
    data: {
      nome: body.nome,
      codigoUc: codigoUc!,
      codigoUcAntigo,
      origem,
      consumerId: body.consumerId || null,
      plantId: body.plantId || null,
      cpfCnpj: body.cpfCnpj || null,
      distribuidora: body.distribuidora || null,
      grupo: body.grupo || null,
      subGrupo: body.subGrupo || null,
      modalidade: body.modalidade || null,
      consumoMedio: body.consumoMedio ? Number(body.consumoMedio) : null,
      cep: body.cep || null,
      logradouro: body.logradouro || null,
      complemento: body.complemento || null,
      numero: body.numero || null,
      cidade: body.cidade || null,
      consultor: body.consultor || null,
      comissao: body.comissao || null,
      metodoPagamento: body.metodoPagamento || null,
      regraRemuneracao: body.regraRemuneracao || null,
      percentCompensado: body.percentCompensado ? Number(body.percentCompensado) : null,
      percentBandeira: body.percentBandeira ? Number(body.percentBandeira) : null,
      regraVencimento: body.regraVencimento || null,
      valorVencimento: body.valorVencimento ? Number(body.valorVencimento) : null,
      statusContrato: body.statusContrato || null,
      vigenciaCompensacao: body.vigenciaCompensacao || null,
      dataInicioContrato: body.dataInicioContrato ? new Date(body.dataInicioContrato) : null,
      loginDistribuidora: body.loginDistribuidora || null,
      senhaDistribuidora: body.senhaDistribuidora || null,
      temGeracaoPropria: !!body.temGeracaoPropria,
    },
  });

  return NextResponse.json(unit, { status: 201 });
}
