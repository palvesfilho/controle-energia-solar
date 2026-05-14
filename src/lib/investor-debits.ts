/**
 * Amortização automática de InvestorDebit contra InvestorPayable.
 *
 * Fluxo: toda vez que uma payable é criada/atualizada pela geração normal
 * (syncInvestorPayablesFromBill), chamamos applyInvestorDebitsToPayable pra
 * ver se o investidor tem débitos abertos e abater deles. FIFO — débitos
 * mais antigos primeiro.
 *
 * Regras:
 *  - Só aplica em payables com status AGUARDANDO_PAGAMENTO ou DISPONIVEL
 *    (não mexe em AGUARDANDO_COMPENSACAO, PAGO, EM_COBRANCA_JUDICIAL).
 *  - Abatimento máximo por payable = valorLiquido atual (não deixa negativo).
 *  - Se já há applications prévias nesta payable (reprocessamento), primeiro
 *    reverte tudo (devolve valorRestante ao débito), depois recomeça zero.
 *    Isso garante idempotência.
 *  - Débito QUITADO/CANCELADO é ignorado.
 *
 * Reversão manual (cancelamento de débito) está em cancelInvestorDebit.
 */

import { prisma } from "@/lib/prisma";

const STATUS_APLICAVEIS = new Set(["AGUARDANDO_PAGAMENTO", "DISPONIVEL"]);

export interface DebitApplyResult {
  payableId: string;
  valorAbatidoTotal: number;
  aplicacoes: Array<{
    debitId: string;
    valorAbatido: number;
  }>;
  skipped: string | null;
}

export async function applyInvestorDebitsToPayable(
  payableId: string,
): Promise<DebitApplyResult> {
  return prisma.$transaction(async (tx) => {
    const payable = await tx.investorPayable.findUnique({
      where: { id: payableId },
      select: {
        id: true,
        investorId: true,
        status: true,
        valorBruto: true,
        valorAjuste: true,
        valorAbatidoDebito: true,
      },
    });
    if (!payable) {
      return {
        payableId,
        valorAbatidoTotal: 0,
        aplicacoes: [],
        skipped: "payable não encontrada",
      };
    }
    if (!STATUS_APLICAVEIS.has(payable.status)) {
      return {
        payableId,
        valorAbatidoTotal: 0,
        aplicacoes: [],
        skipped: `status ${payable.status} não permite aplicar débitos`,
      };
    }

    // Reverte applications existentes (devolve ao valorRestante do débito).
    const existentes = await tx.investorDebitApplication.findMany({
      where: { payableId },
      select: { id: true, debitId: true, valorAbatido: true },
    });
    for (const app of existentes) {
      await tx.investorDebit.update({
        where: { id: app.debitId },
        data: {
          valorRestante: { increment: app.valorAbatido },
          status: "ABERTO",
          quitadoEm: null,
        },
      });
    }
    if (existentes.length > 0) {
      await tx.investorDebitApplication.deleteMany({
        where: { payableId },
      });
    }

    // Valor base da payable sem abatimento nenhum.
    const valorDevido = payable.valorBruto + payable.valorAjuste;
    if (valorDevido <= 0) {
      // Zera quaisquer resíduos e sai.
      await tx.investorPayable.update({
        where: { id: payableId },
        data: {
          valorAbatidoDebito: 0,
          valorLiquido: valorDevido,
        },
      });
      return {
        payableId,
        valorAbatidoTotal: 0,
        aplicacoes: [],
        skipped: "valor devido <= 0",
      };
    }

    // Busca débitos abertos FIFO.
    const debitos = await tx.investorDebit.findMany({
      where: {
        investorId: payable.investorId,
        status: "ABERTO",
        valorRestante: { gt: 0 },
      },
      orderBy: { criadoEm: "asc" },
      select: { id: true, valorRestante: true },
    });

    let restanteNaPayable = valorDevido;
    const aplicacoes: DebitApplyResult["aplicacoes"] = [];
    const now = new Date();

    for (const d of debitos) {
      if (restanteNaPayable <= 0) break;
      const abate = Math.min(d.valorRestante, restanteNaPayable);
      if (abate <= 0) continue;

      await tx.investorDebitApplication.create({
        data: {
          debitId: d.id,
          payableId,
          valorAbatido: abate,
          aplicadoEm: now,
        },
      });

      const novoRestante = d.valorRestante - abate;
      await tx.investorDebit.update({
        where: { id: d.id },
        data: {
          valorRestante: novoRestante,
          ...(novoRestante <= 0.009
            ? { status: "QUITADO", quitadoEm: now }
            : {}),
        },
      });

      aplicacoes.push({ debitId: d.id, valorAbatido: abate });
      restanteNaPayable -= abate;
    }

    const valorAbatidoTotal = aplicacoes.reduce(
      (s, a) => s + a.valorAbatido,
      0,
    );

    await tx.investorPayable.update({
      where: { id: payableId },
      data: {
        valorAbatidoDebito: valorAbatidoTotal,
        valorLiquido: Math.max(0, valorDevido - valorAbatidoTotal),
      },
    });

    return {
      payableId,
      valorAbatidoTotal,
      aplicacoes,
      skipped: null,
    };
  });
}

/**
 * Marca uma InvestorPayable como PAGA e (se houver) registra
 * automaticamente um InvestorDebit/Credit pela diferença entre o que
 * foi transferido (valorRealPago) e o que era devido (valorLiquido).
 *
 * Regras:
 *  - valorRealPago == valorLiquido (ou não informado): paga normalmente, sem débito/crédito.
 *  - valorRealPago > valorLiquido: cria InvestorDebit pela diferença.
 *    Ligado a payableOrigemId = esta payable.
 *  - valorRealPago < valorLiquido: a diferença vira saldo a pagar ao investidor.
 *    Por ora, só registra warning no resultado (MVP — crédito será implementado depois).
 *  - Payable já em PAGO: atualiza valorRealPago se informado e recalcula delta,
 *    removendo/criando débito auto conforme necessário.
 */
export interface MarkPaidInput {
  valorRealPago?: number | null;
  motivo?: string | null;
  pagoEm?: Date;
  userId?: string | null;
}

export interface MarkPaidResult {
  payableId: string;
  valorLiquido: number;
  valorRealPago: number;
  delta: number;
  debitoCriadoId: string | null;
  warning: string | null;
}

export async function markInvestorPayableAsPaid(
  payableId: string,
  input: MarkPaidInput,
): Promise<MarkPaidResult> {
  return prisma.$transaction(async (tx) => {
    const payable = await tx.investorPayable.findUnique({
      where: { id: payableId },
      select: {
        id: true,
        investorId: true,
        valorLiquido: true,
        status: true,
        anoReferencia: true,
        mesReferencia: true,
        plant: { select: { name: true, numeroUsina: true } },
        consumerUnit: { select: { codigoUc: true, nome: true } },
      },
    });
    if (!payable) throw new Error(`Payable ${payableId} não encontrada`);
    if (payable.status === "EM_COBRANCA_JUDICIAL") {
      throw new Error(
        `Payable em EM_COBRANCA_JUDICIAL — marque manualmente fora do fluxo normal`,
      );
    }

    const valorRealPago =
      input.valorRealPago != null && Number.isFinite(input.valorRealPago)
        ? input.valorRealPago
        : payable.valorLiquido;
    const pagoEm = input.pagoEm ?? new Date();
    const delta = valorRealPago - payable.valorLiquido;

    // Se já existe débito auto-criado por esta payable, remove antes
    // (vamos recriar com o valor correto ou deixar sem débito se delta=0).
    const existenteDebitoAuto = await tx.investorDebit.findFirst({
      where: { payableOrigemId: payableId, status: { not: "CANCELADO" } },
      select: {
        id: true,
        valorOriginal: true,
        applications: { select: { id: true, valorAbatido: true, payableId: true } },
      },
    });
    if (existenteDebitoAuto) {
      // Devolve valorRestante / reverte applications do débito antigo
      for (const app of existenteDebitoAuto.applications) {
        const p = await tx.investorPayable.findUnique({
          where: { id: app.payableId },
          select: {
            valorBruto: true,
            valorAjuste: true,
            valorAbatidoDebito: true,
          },
        });
        if (p) {
          const novoAbatido = Math.max(
            0,
            p.valorAbatidoDebito - app.valorAbatido,
          );
          const valorDevido = p.valorBruto + p.valorAjuste;
          await tx.investorPayable.update({
            where: { id: app.payableId },
            data: {
              valorAbatidoDebito: novoAbatido,
              valorLiquido: Math.max(0, valorDevido - novoAbatido),
            },
          });
        }
      }
      await tx.investorDebitApplication.deleteMany({
        where: { debitId: existenteDebitoAuto.id },
      });
      await tx.investorDebit.delete({
        where: { id: existenteDebitoAuto.id },
      });
    }

    // Atualiza a payable pra PAGO
    await tx.investorPayable.update({
      where: { id: payableId },
      data: {
        status: "PAGO",
        valorRealPago,
        motivoValorRealPago: input.motivo?.trim() || null,
        pagoInvestidorEm: pagoEm,
      },
    });

    // Se delta > 0 (pagou a maior), cria débito automático
    let debitoCriadoId: string | null = null;
    let warning: string | null = null;
    if (delta > 0.009) {
      const usinaLabel =
        payable.plant.numeroUsina ?? payable.plant.name ?? "(usina)";
      const mesRef = `${String(payable.mesReferencia).padStart(2, "0")}/${payable.anoReferencia}`;
      const debit = await tx.investorDebit.create({
        data: {
          investorId: payable.investorId,
          valorOriginal: delta,
          valorRestante: delta,
          payableOrigemId: payableId,
          motivo: `Pagamento a maior de R$ ${delta.toFixed(2)} na payable ${mesRef} (usina ${usinaLabel}, UC ${payable.consumerUnit.codigoUc ?? "—"})`,
          criadoPorUserId: input.userId ?? null,
        },
        select: { id: true },
      });
      debitoCriadoId = debit.id;
    } else if (delta < -0.009) {
      // pagou a menos — crédito a gerar. MVP: só warning, implementação
      // completa (InvestorCredit) fica pra v2.
      warning = `Investidor pagou R$ ${Math.abs(delta).toFixed(2)} a MENOS. Crédito automático ainda não implementado — registre manualmente ou ajuste na próxima payable.`;
    }

    return {
      payableId,
      valorLiquido: payable.valorLiquido,
      valorRealPago,
      delta,
      debitoCriadoId,
      warning,
    };
  });
}

/**
 * Cancela um débito: estorna todas as applications, devolve valorLiquido
 * das payables e marca o débito como CANCELADO.
 */
export async function cancelInvestorDebit(
  debitId: string,
  motivo?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const debit = await tx.investorDebit.findUnique({
      where: { id: debitId },
      select: { id: true, status: true, valorOriginal: true, motivo: true },
    });
    if (!debit) throw new Error(`Débito ${debitId} não encontrado`);
    if (debit.status === "CANCELADO") return;

    const apps = await tx.investorDebitApplication.findMany({
      where: { debitId },
      select: {
        payableId: true,
        valorAbatido: true,
      },
    });

    // Reverte cada payable: reduz valorAbatidoDebito e aumenta valorLiquido
    for (const app of apps) {
      const p = await tx.investorPayable.findUnique({
        where: { id: app.payableId },
        select: {
          valorBruto: true,
          valorAjuste: true,
          valorAbatidoDebito: true,
        },
      });
      if (!p) continue;
      const novoAbatido = Math.max(0, p.valorAbatidoDebito - app.valorAbatido);
      const valorDevido = p.valorBruto + p.valorAjuste;
      await tx.investorPayable.update({
        where: { id: app.payableId },
        data: {
          valorAbatidoDebito: novoAbatido,
          valorLiquido: Math.max(0, valorDevido - novoAbatido),
        },
      });
    }

    await tx.investorDebitApplication.deleteMany({ where: { debitId } });
    await tx.investorDebit.update({
      where: { id: debitId },
      data: {
        status: "CANCELADO",
        canceladoEm: new Date(),
        valorRestante: debit.valorOriginal,
        motivo: motivo
          ? `${debit.motivo ? `${debit.motivo} | ` : ""}CANCELADO: ${motivo}`
          : debit.motivo,
      },
    });
  });
}
