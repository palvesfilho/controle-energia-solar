import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole, isFullAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { populateBillingFromBill } from "@/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "@/lib/investor-payables";
import {
  setGeracaoInversorManual,
  syncGeracaoInversorForBill,
} from "@/lib/geracao-inversor";
import { isMesEncerradoDaConsumerBill } from "@/lib/mes-encerrado";

/**
 * GET /api/admin/faturas-energia/[id]
 * Retorna o detalhe necessário pra modal de pagamento (codigoBarras, pixCopiaCola,
 * vencimento, valor, PDF, dados da UC).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const bill = await prisma.consumerBill.findUnique({
    where: { id },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
      vencimento: true,
      codigoBarras: true,
      pixCopiaCola: true,
      pdfUrl: true,
      contaPaga: true,
      pagoEm: true,
      bancoPagamento: true,
      origemPagamento: true,
      comprovantePagamentoUrl: true,
      consumerUnit: {
        select: { codigoUc: true, nome: true, distribuidora: true },
      },
      plant: {
        select: { unidadeConsumidora: true, name: true, distribuidora: true },
      },
    },
  });
  if (!bill) {
    return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });
  }
  const uc = bill.consumerUnit
    ? {
        codigoUc: bill.consumerUnit.codigoUc,
        nome: bill.consumerUnit.nome,
        distribuidora: bill.consumerUnit.distribuidora,
      }
    : bill.plant
      ? {
          codigoUc: bill.plant.unidadeConsumidora ?? "—",
          nome: bill.plant.name,
          distribuidora: bill.plant.distribuidora,
        }
      : null;
  return NextResponse.json({
    id: bill.id,
    ano: bill.anoReferencia,
    mes: bill.mesReferencia,
    valorTotal: bill.valorTotal,
    vencimento: bill.vencimento?.toISOString() ?? null,
    codigoBarras: bill.codigoBarras,
    pixCopiaCola: bill.pixCopiaCola,
    pdfUrl: bill.pdfUrl,
    contaPaga: bill.contaPaga,
    pagoEm: bill.pagoEm?.toISOString() ?? null,
    bancoPagamento: bill.bancoPagamento,
    origemPagamento: bill.origemPagamento,
    comprovantePagamentoUrl: bill.comprovantePagamentoUrl,
    uc,
  });
}

/**
 * PATCH /api/admin/faturas-energia/[id]
 * Atualiza campos editáveis manualmente da ConsumerBill. Aceita:
 *  - geracaoInversorKwh: preenche manual (marca origem=MANUAL) ou null pra limpar
 *  - consumoInstantaneoKwh: permite ajuste direto (raramente usado — normalmente
 *    é derivado de geracaoInversorKwh - energiaInjetadaMedidorKwh)
 *  - valorTotal: ajuste manual quando o parser não conseguiu extrair do PDF
 *  - consumoKwh, energiaCompensada, energiaInjetadaMedidorKwh: campos críticos
 *    do parser que viraram editáveis pra cobrir faturas em que o parser do PDF
 *    falhou ou não foi executado (ex.: populadas só via API Infosimples).
 *  - sincronizarGeracao: true → dispara coleta AUTO via API do inversor
 *
 * Dispara re-cálculo de ConsumerUnitBilling e de InvestorPayables em cascata.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    consumoInstantaneoKwh?: number | null;
    geracaoInversorKwh?: number | null;
    valorTotal?: number | null;
    consumoKwh?: number | null;
    energiaCompensada?: number | null;
    energiaInjetadaMedidorKwh?: number | null;
    sincronizarGeracao?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Body obrigatório" }, { status: 400 });
  }

  const bill = await prisma.consumerBill.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!bill) {
    return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });
  }

  if (
    !isFullAdmin(session.user.role) &&
    (await isMesEncerradoDaConsumerBill(id))
  ) {
    return NextResponse.json(
      {
        error:
          "Mês encerrado (comprovante de pagamento já anexado). Apenas ADMIN pode editar fatura — peça reabertura.",
      },
      { status: 403 },
    );
  }

  // 1. Geração manual (se informado no body)
  if ("geracaoInversorKwh" in body) {
    const v = body.geracaoInversorKwh;
    if (v != null && (!Number.isFinite(v) || v < 0)) {
      return NextResponse.json(
        { error: "geracaoInversorKwh deve ser número >= 0 ou null" },
        { status: 400 },
      );
    }
    try {
      await setGeracaoInversorManual(id, v ?? null);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "erro" },
        { status: 400 },
      );
    }
  }

  // 2. Sincronização AUTO (se solicitada)
  let syncInfo: unknown = null;
  if (body.sincronizarGeracao) {
    syncInfo = await syncGeracaoInversorForBill(id).catch((e) => ({
      error: e instanceof Error ? e.message : "erro",
    }));
  }

  // 3. Consumo instantâneo direto (edge case — normalmente é derivado)
  if ("consumoInstantaneoKwh" in body) {
    const kwh = body.consumoInstantaneoKwh;
    if (kwh != null && (!Number.isFinite(kwh) || kwh < 0)) {
      return NextResponse.json(
        { error: "consumoInstantaneoKwh deve ser número >= 0 ou null" },
        { status: 400 },
      );
    }
    await prisma.consumerBill.update({
      where: { id },
      data: { consumoInstantaneoKwh: kwh ?? null },
    });
  }

  // 4. valorTotal manual (fallback quando parser não extraiu)
  if ("valorTotal" in body) {
    const v = body.valorTotal;
    if (v != null && (!Number.isFinite(v) || v < 0)) {
      return NextResponse.json(
        { error: "valorTotal deve ser número >= 0 ou null" },
        { status: 400 },
      );
    }
    await prisma.consumerBill.update({
      where: { id },
      data: { valorTotal: v ?? null },
    });
  }

  // 5. Campos críticos do parser (consumoKwh, energiaCompensada, energiaInjetadaMedidorKwh)
  const camposManuais: Record<string, number | null> = {};
  for (const f of ["consumoKwh", "energiaCompensada", "energiaInjetadaMedidorKwh"] as const) {
    if (f in body) {
      const v = body[f];
      if (v != null && (!Number.isFinite(v) || v < 0)) {
        return NextResponse.json(
          { error: `${f} deve ser número >= 0 ou null` },
          { status: 400 },
        );
      }
      camposManuais[f] = v ?? null;
    }
  }
  if (Object.keys(camposManuais).length > 0) {
    await prisma.consumerBill.update({
      where: { id },
      data: camposManuais,
    });
  }

  // Re-aplica cobrança + payables. populateBillingFromBill vai re-derivar
  // consumoInstantaneoKwh a partir de geracaoInversorKwh quando aplicável.
  await populateBillingFromBill(id).catch(() => {});
  await syncInvestorPayablesFromBill(id).catch(() => {});

  const updated = await prisma.consumerBill.findUnique({
    where: { id },
    select: {
      id: true,
      geracaoInversorKwh: true,
      geracaoInversorOrigem: true,
      consumoInstantaneoKwh: true,
      energiaInjetadaMedidorKwh: true,
      consumoKwh: true,
      energiaCompensada: true,
      valorTotal: true,
    },
  });

  return NextResponse.json({ ...updated, sync: syncInfo });
}
