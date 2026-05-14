import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { AsaasError, deletePayment, getPayment, type AsaasBillingType } from "@/lib/asaas";
import { emitBillingToAsaas } from "@/lib/billing-asaas";
import { transitionPayablesFromBilling } from "@/lib/investor-payables";
import {
  computeParentStatusFromInstallments,
  parseInstallments,
  serializeInstallments,
} from "@/lib/billing-installments";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const ASAAS_STATUS_MAP: Record<string, { billing: string; setPagoEm: boolean }> = {
  CONFIRMED: { billing: "PAGO", setPagoEm: true },
  RECEIVED: { billing: "PAGO", setPagoEm: true },
  RECEIVED_IN_CASH: { billing: "PAGO", setPagoEm: true },
  OVERDUE: { billing: "ATRASADO", setPagoEm: false },
  REFUNDED: { billing: "CANCELADO", setPagoEm: false },
};

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const billing = await prisma.consumerUnitBilling.findUnique({ where: { id } });
  if (!billing) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });
  }
  const installments = parseInstallments(billing.installments);

  // === Caminho parcelado: sincroniza cada parcela ===
  if (installments && installments.length > 0) {
    const updated = [...installments];
    for (let i = 0; i < updated.length; i++) {
      const it = updated[i];
      if (!it.asaasChargeId) continue;
      try {
        const payment = await getPayment(it.asaasChargeId);
        const setPagoEm =
          payment.status === "RECEIVED" ||
          payment.status === "CONFIRMED" ||
          payment.status === "RECEIVED_IN_CASH";
        updated[i] = {
          ...it,
          asaasStatus: payment.deleted ? "DELETED" : payment.status,
          asaasInvoiceUrl: payment.invoiceUrl ?? it.asaasInvoiceUrl,
          pagoEm: setPagoEm
            ? it.pagoEm ?? new Date().toISOString()
            : payment.deleted
              ? null
              : it.pagoEm,
        };
      } catch (err) {
        // 404 = parcela apagada no Asaas
        if (err instanceof AsaasError && err.status === 404) {
          updated[i] = {
            ...it,
            asaasStatus: "DELETED",
            pagoEm: null,
          };
          continue;
        }
        if (err instanceof AsaasError) {
          return NextResponse.json(
            {
              error: `Falha ao consultar parcela ${i + 1} no Asaas`,
              detail: err.message,
            },
            { status: err.status },
          );
        }
        throw err;
      }
    }
    const parentStatus = computeParentStatusFromInstallments(updated);
    const parentPagoEm =
      parentStatus === "PAGO"
        ? new Date(
            updated
              .map((it) => (it.pagoEm ? new Date(it.pagoEm).getTime() : 0))
              .reduce((a, b) => Math.max(a, b), 0),
          )
        : null;
    const updatedBilling = await prisma.consumerUnitBilling.update({
      where: { id: billing.id },
      data: {
        installments: serializeInstallments(updated),
        status: parentStatus,
        pagoEm: parentPagoEm,
        asaasSyncedAt: new Date(),
      },
    });
    await transitionPayablesFromBilling(billing.id).catch((e) =>
      console.error("[asaas-sync] transitionPayablesFromBilling falhou:", e),
    );
    return NextResponse.json({ ok: true, billing: updatedBilling, installments: updated });
  }

  if (!billing.asaasChargeId) {
    return NextResponse.json(
      { error: "Cobrança ainda não enviada ao Asaas" },
      { status: 400 },
    );
  }

  try {
    const payment = await getPayment(billing.asaasChargeId);
    const updates: Record<string, unknown> = {
      asaasStatus: payment.deleted ? "DELETED" : payment.status,
      asaasInvoiceUrl: payment.invoiceUrl ?? billing.asaasInvoiceUrl,
      asaasSyncedAt: new Date(),
    };
    // Prioriza a flag `deleted` (cobrança apagada pelo operador no Asaas).
    if (payment.deleted) {
      updates.status = "CANCELADO";
      updates.pagoEm = null;
    } else {
      const mapping = ASAAS_STATUS_MAP[payment.status];
      if (mapping) {
        updates.status = mapping.billing;
        if (mapping.setPagoEm && !billing.pagoEm) updates.pagoEm = new Date();
        if (mapping.billing === "CANCELADO") updates.pagoEm = null;
      }
    }
    const updated = await prisma.consumerUnitBilling.update({
      where: { id: billing.id },
      data: updates,
    });
    await transitionPayablesFromBilling(billing.id).catch((e) =>
      console.error("[asaas-sync] transitionPayablesFromBilling falhou:", e),
    );
    return NextResponse.json({ ok: true, billing: updated, payment });
  } catch (err) {
    // Alguns ambientes do Asaas retornam 404 para cobranças apagadas — tratamos
    // como cancelamento para refletir na UI sem deixar o botão "travado".
    if (err instanceof AsaasError && err.status === 404) {
      const updated = await prisma.consumerUnitBilling.update({
        where: { id: billing.id },
        data: {
          status: "CANCELADO",
          asaasStatus: "DELETED",
          asaasSyncedAt: new Date(),
          pagoEm: null,
        },
      });
      await transitionPayablesFromBilling(billing.id).catch((e) =>
        console.error("[asaas-sync 404] transitionPayablesFromBilling falhou:", e),
      );
      return NextResponse.json({
        ok: true,
        billing: updated,
        payment: null,
        note: "Cobrança não localizada no Asaas (404) — marcada como CANCELADA.",
      });
    }
    if (err instanceof AsaasError) {
      return NextResponse.json(
        { error: "Falha ao consultar Asaas", detail: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: "Erro inesperado", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ASAAS_API_KEY) {
    return NextResponse.json(
      { error: "ASAAS_API_KEY não configurado no servidor" },
      { status: 500 },
    );
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    billingType?: AsaasBillingType;
    dataVencimento?: string | null;
    notificarEmail?: boolean;
    notificarWhatsapp?: boolean;
    installments?: { dueDate: string; valor: number }[];
  };

  const result = await emitBillingToAsaas(id, {
    billingType: body.billingType || "UNDEFINED",
    dataVencimento:
      body.dataVencimento === undefined
        ? undefined
        : body.dataVencimento
          ? new Date(body.dataVencimento)
          : null,
    notificarEmail: body.notificarEmail,
    notificarWhatsapp: body.notificarWhatsapp,
    installments: body.installments,
  });
  if (!result.ok) {
    const status =
      result.skipped === "already_sent"
        ? 409
        : result.error
        ? 502
        : 400;
    return NextResponse.json(
      {
        error: result.error ?? `Pulado: ${result.skipped}`,
        detail: result.error ?? result.skipped,
      },
      { status },
    );
  }
  return NextResponse.json(result);
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const billing = await prisma.consumerUnitBilling.findUnique({ where: { id } });
  if (!billing) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });
  }
  if (billing.status === "CANCELADO") {
    return NextResponse.json(
      { error: "Cobrança já está cancelada" },
      { status: 409 },
    );
  }
  const installments = parseInstallments(billing.installments);

  // === Caminho parcelado: cancela cada parcela no Asaas ===
  if (installments && installments.length > 0) {
    const updated = [...installments];
    for (let i = 0; i < updated.length; i++) {
      const it = updated[i];
      if (!it.asaasChargeId) continue;
      // Pula parcelas já pagas — não dá pra cancelar pagamento confirmado.
      if (it.pagoEm) continue;
      try {
        await deletePayment(it.asaasChargeId);
      } catch (err) {
        if (err instanceof AsaasError && err.status === 404) {
          // já não existe — segue
        } else if (err instanceof AsaasError) {
          return NextResponse.json(
            {
              error: `Falha ao cancelar parcela ${i + 1} no Asaas`,
              detail: err.message,
            },
            { status: err.status },
          );
        } else {
          throw err;
        }
      }
      updated[i] = { ...it, asaasStatus: "DELETED" };
    }
    const updatedBilling = await prisma.consumerUnitBilling.update({
      where: { id: billing.id },
      data: {
        installments: serializeInstallments(updated),
        status: "CANCELADO",
        asaasStatus: "DELETED",
        asaasSyncedAt: new Date(),
        pagoEm: null,
      },
    });
    await transitionPayablesFromBilling(billing.id).catch((e) =>
      console.error("[asaas-delete] transitionPayablesFromBilling falhou:", e),
    );
    return NextResponse.json({ ok: true, billing: updatedBilling });
  }

  if (!billing.asaasChargeId) {
    return NextResponse.json(
      { error: "Cobrança ainda não enviada ao Asaas" },
      { status: 400 },
    );
  }

  try {
    await deletePayment(billing.asaasChargeId);
  } catch (err) {
    // 404 = já não existe no Asaas; tratamos como cancelamento local bem-sucedido.
    if (!(err instanceof AsaasError) || err.status !== 404) {
      if (err instanceof AsaasError) {
        return NextResponse.json(
          { error: "Falha ao cancelar no Asaas", detail: err.message },
          { status: err.status },
        );
      }
      return NextResponse.json(
        { error: "Erro inesperado", detail: String(err) },
        { status: 500 },
      );
    }
  }

  const updated = await prisma.consumerUnitBilling.update({
    where: { id: billing.id },
    data: {
      status: "CANCELADO",
      asaasStatus: "DELETED",
      asaasSyncedAt: new Date(),
      pagoEm: null,
    },
  });
  await transitionPayablesFromBilling(billing.id).catch((e) =>
    console.error("[asaas-delete] transitionPayablesFromBilling falhou:", e),
  );
  return NextResponse.json({ ok: true, billing: updated });
}
