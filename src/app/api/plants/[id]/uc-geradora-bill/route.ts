import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/plants/[id]/uc-geradora-bill?ano=YYYY&mes=MM
 *
 * Retorna a ConsumerBill da UC geradora da plant no mês solicitado, junto
 * com campos relevantes pra edição de geração do inversor (DESCONTADO).
 *
 * Retorna { bill: null, reason: ... } se:
 *  - Plant não é DESCONTADO
 *  - Plant não tem UC geradora cadastrada
 *  - UC geradora não tem fatura nesse mês
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId } = await params;
  const { searchParams } = new URL(req.url);
  const ano = Number(searchParams.get("ano"));
  const mes = Number(searchParams.get("mes"));
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json(
      { error: "Informe ano e mes válidos" },
      { status: 400 },
    );
  }

  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: {
      id: true,
      numeroUsina: true,
      unidadeConsumidora: true,
      codigoCliente: true,
      regraInstalacao: true,
    },
  });
  if (!plant) {
    return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
  }

  if (plant.regraInstalacao !== "USINA_CONSUMO_DESCONTADO") {
    return NextResponse.json({
      bill: null,
      reason: "Plant não é USINA_CONSUMO_DESCONTADO",
      regraInstalacao: plant.regraInstalacao,
    });
  }

  const codigosGeradora = [
    plant.numeroUsina,
    plant.unidadeConsumidora,
    plant.codigoCliente,
  ].filter(Boolean) as string[];
  if (codigosGeradora.length === 0) {
    return NextResponse.json({
      bill: null,
      reason: "Plant sem código de UC geradora cadastrado (numeroUsina/unidadeConsumidora/codigoCliente)",
    });
  }

  const uc = await prisma.consumerUnit.findFirst({
    where: {
      plantId,
      codigoUc: { in: codigosGeradora },
    },
    select: { id: true, codigoUc: true, nome: true },
  });
  if (!uc) {
    return NextResponse.json({
      bill: null,
      reason: "UC geradora não encontrada entre as UCs vinculadas à plant",
    });
  }

  const bill = await prisma.consumerBill.findFirst({
    where: {
      consumerUnitId: uc.id,
      anoReferencia: ano,
      mesReferencia: mes,
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      geracaoInversorKwh: true,
      geracaoInversorOrigem: true,
      consumoInstantaneoKwh: true,
      tarifaTE: true,
      tarifaTUSD: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
    },
  });
  if (!bill) {
    return NextResponse.json({
      bill: null,
      reason: `UC geradora ${uc.codigoUc} não tem fatura de ${String(mes).padStart(2, "0")}/${ano}`,
      uc,
    });
  }

  return NextResponse.json({ bill, uc });
}
