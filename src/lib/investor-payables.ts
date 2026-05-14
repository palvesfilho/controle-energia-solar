/**
 * Cria/atualiza InvestorPayable a partir de uma ConsumerBill.
 *
 * Chamado após gravação da ConsumerBill (sync Infosimples ou upload manual).
 * Se a UC está em rateio VIGENTE e a fatura traz energia compensada > 0,
 * gera um payable por investidor da usina (normalmente 1 por usina).
 *
 * Regras:
 *  - Payable é criado sob demanda (só quando ConsumerBill chega com compensação);
 *    pula o estado AGUARDANDO_COMPENSACAO e vai direto pra AGUARDANDO_PAGAMENTO.
 *  - Se o ConsumerUnitBilling da mesma referência já está pago, transiciona pra DISPONIVEL.
 *  - Payable em PAGO ou EM_COBRANCA_JUDICIAL nunca é sobrescrito (status final).
 *  - Snapshot de sharePercent/valorKwhContrato/rateioVersionId fica travado após a criação
 *    (auditoria: parcelas antigas não mudam se o contrato for renegociado depois).
 *  - sharePercent é organizacional (define o rateio submetido à concessionária),
 *    NÃO entra na remuneração. kwhCompensadoBase = energiaCompensada da UC −
 *    energiaInjetadaMedidorKwh (geração própria da UC, descontada por força da
 *    Lei 14.300: a distribuidora compensa primeiro o medidor da UC).
 *  - Cap por plant (Σ kwhCompensadoBase ≤ Σ injeção da usina) é aplicado em
 *    seguida via applyInjectionCapToPlant.
 */

import { prisma } from "@/lib/prisma";
import { parseInstallments } from "@/lib/billing-installments";
import { applyInvestorDebitsToPayable } from "@/lib/investor-debits";
import { applyInjectionCapToPlant } from "@/lib/investor-injection-cap";
import { resolvePlantBillOrigin } from "@/lib/payable-origin";

export interface PayableSyncResult {
  billId: string;
  created: number;
  updated: number;
  skipped: string[];
  payableIds: string[];
}

const STATUS_FINAIS = new Set(["PAGO", "EM_COBRANCA_JUDICIAL"]);

/**
 * Identifica plantId quando a bill é da própria usina (UC geradora ou bill
 * direta com plantId), pra disparar o cap mesmo nos paths em que essa bill
 * não gera payable.
 */
async function resolvePlantIdParaCap(bill: {
  consumerUnitId: string | null;
  plantId: string | null;
}): Promise<string | null> {
  if (bill.plantId) return bill.plantId;
  if (!bill.consumerUnitId) return null;
  const uc = await prisma.consumerUnit.findUnique({
    where: { id: bill.consumerUnitId },
    select: { id: true, codigoUc: true, plantId: true },
  });
  if (!uc?.plantId) return null;
  // Confirma que essa UC é a geradora da plant (codigoUc bate com algum dos
  // identificadores). Se não for, é UC consumidora normal — cap é disparado
  // pelo fluxo normal de payable.
  const plant = await prisma.plant.findUnique({
    where: { id: uc.plantId },
    select: { numeroUsina: true, unidadeConsumidora: true, codigoCliente: true },
  });
  if (!plant) return null;
  const codigos = [
    plant.numeroUsina,
    plant.unidadeConsumidora,
    plant.codigoCliente,
  ].filter(Boolean) as string[];
  return codigos.includes(uc.codigoUc) ? uc.plantId : null;
}

export async function syncInvestorPayablesFromBill(
  billId: string,
): Promise<PayableSyncResult> {
  const result: PayableSyncResult = {
    billId,
    created: 0,
    updated: 0,
    skipped: [],
    payableIds: [],
  };

  const bill = await prisma.consumerBill.findUnique({
    where: { id: billId },
    select: {
      id: true,
      consumerUnitId: true,
      plantId: true,
      anoReferencia: true,
      mesReferencia: true,
      energiaCompensada: true,
      energiaInjetadaMedidorKwh: true,
      dataLeituraAtual: true,
    },
  });

  if (!bill) {
    result.skipped.push("bill não encontrada");
    return result;
  }

  // Identifica plant cuja injeção depende desta bill (UC geradora ou bill direta
  // da usina). Usado pra disparar o cap mesmo nos early returns abaixo —
  // injeção mudou ⇒ cap precisa recalcular pra todas as payables da plant.
  const plantIdParaCap = await resolvePlantIdParaCap(bill);

  const recomputaCapIfPossible = async () => {
    if (plantIdParaCap) await applyInjectionCapToPlant(plantIdParaCap);
  };

  if (!bill.consumerUnitId) {
    result.skipped.push("bill sem consumerUnitId (fatura órfã ou da própria usina)");
    await recomputaCapIfPossible();
    return result;
  }
  const energiaCompensada = bill.energiaCompensada ?? 0;
  if (energiaCompensada <= 0) {
    result.skipped.push("energiaCompensada = 0 ou ausente");
    await recomputaCapIfPossible();
    return result;
  }

  // Geração própria da UC consumidora (Lei 14.300: distribuidora compensa
  // primeiro o medidor da própria UC). Subtrai pra que o investidor da
  // usina cadastrada não receba sobre kWh que vieram da geração própria
  // da UC consumidora (ex.: ZEFERINO PADARIA tem mini geração além de
  // receber rateio do BOLZAN).
  const injecaoPropriaUC = bill.energiaInjetadaMedidorKwh ?? 0;
  const kwhDoRateio = Math.max(0, energiaCompensada - injecaoPropriaUC);

  // Auto-marca a UC como tendo geração própria (fail-safe: a flag fica correta
  // sem o operador precisar lembrar de marcar no cadastro). Idempotente.
  if (injecaoPropriaUC > 0) {
    await prisma.consumerUnit.updateMany({
      where: { id: bill.consumerUnitId, temGeracaoPropria: false },
      data: { temGeracaoPropria: true },
    });
  }

  // Se TODA a compensação veio da geração própria da UC, não há remuneração ao
  // investidor — não cria payable vazio (R$ 0, kWh 0). Casos típicos: UC
  // SANTINO FÁBRICA tem solar próprio que cobre 100% do consumo em alguns meses.
  if (kwhDoRateio <= 0) {
    result.skipped.push(
      `compensação 100% da geração própria da UC (${injecaoPropriaUC}kWh) — sem rateio da usina`,
    );
    await recomputaCapIfPossible();
    return result;
  }

  // Escolhe o rateio que valia no mês de referência da fatura.
  // Considera VIGENTE e SUBSTITUIDO: um rateio substituído continua
  // válido pra faturas cujo período seja anterior ao novo rateio.
  // Compara por MÊS (não por dia): vigenteAPartirDe dentro do mês
  // da fatura ou antes vale — ex.: rateio com vigência 21/abr inclui
  // faturas de abril inteiras. Técnica: lt (1º dia do mês SEGUINTE).
  const billNextMonthStart = new Date(
    bill.anoReferencia,
    bill.mesReferencia,
    1,
  );
  const rateioItem = await prisma.rateioItem.findFirst({
    where: {
      consumerUnitId: bill.consumerUnitId,
      version: {
        status: { in: ["VIGENTE", "SUBSTITUIDO"] },
        vigenteAPartirDe: { lt: billNextMonthStart },
      },
    },
    select: {
      version: {
        select: { id: true, plantId: true, vigenteAPartirDe: true, status: true },
      },
    },
    orderBy: {
      version: { vigenteAPartirDe: "desc" },
    },
  });

  if (!rateioItem) {
    result.skipped.push(
      `UC sem rateio aplicável em ${bill.anoReferencia}-${String(bill.mesReferencia).padStart(2, "0")}`,
    );
    await recomputaCapIfPossible();
    return result;
  }

  const { plantId } = rateioItem.version;
  const rateioVersionId = rateioItem.version.id;

  // Resolve qual fatura da UC GERADORA originou os créditos compensados nesta
  // ConsumerBill — usado pra atribuir o payable à competência de geração correta
  // (fundamental pra que a tabela de UCs do mês no detalhe da usina mostre os
  // payables sob o mês de geração e não sob o mês da fatura do consumidor).
  const originatedByPlantBillId = await resolvePlantBillOrigin({
    plantId,
    consumerBill: {
      dataLeituraAtual: bill.dataLeituraAtual,
      anoReferencia: bill.anoReferencia,
      mesReferencia: bill.mesReferencia,
    },
  });

  const investorPlants = await prisma.investorPlant.findMany({
    where: { plantId },
    select: {
      investorId: true,
      sharePercent: true,
      valorKwhContrato: true,
    },
  });

  if (investorPlants.length === 0) {
    result.skipped.push("usina sem investidor vinculado");
    await recomputaCapIfPossible();
    return result;
  }

  const unitBilling = await prisma.consumerUnitBilling.findUnique({
    where: {
      consumerUnitId_ano_mes: {
        consumerUnitId: bill.consumerUnitId,
        ano: bill.anoReferencia,
        mes: bill.mesReferencia,
      },
    },
    select: { id: true, pagoEm: true },
  });
  const clientePagou = !!unitBilling?.pagoEm;

  // IDs criados/atualizados nesta passada — usados pra reaplicar débitos APÓS o cap.
  const touchedIds: string[] = [];

  for (const ip of investorPlants) {
    const shareCriacao = ip.sharePercent ?? 100;
    const valorKwhCriacao = ip.valorKwhContrato ?? 0;

    const existing = await prisma.investorPayable.findUnique({
      where: {
        investorId_consumerUnitId_anoReferencia_mesReferencia_parcelaIndex: {
          investorId: ip.investorId,
          consumerUnitId: bill.consumerUnitId,
          anoReferencia: bill.anoReferencia,
          mesReferencia: bill.mesReferencia,
          parcelaIndex: 0,
        },
      },
      select: {
        id: true,
        status: true,
        sharePercent: true,
        valorKwhContrato: true,
        kwhCompensadoAjuste: true,
        valorAjuste: true,
        originatedByPlantBillId: true,
      },
    });

    if (existing && STATUS_FINAIS.has(existing.status)) {
      result.skipped.push(
        `payable ${existing.id} em ${existing.status} — preservado`,
      );
      continue;
    }

    if (existing) {
      // sharePercent é organizacional (define o rateio submetido à concessionária),
      // NÃO entra no cálculo de R$. Remuneração = kWh do rateio × valor/kWh.
      const valorKwh = existing.valorKwhContrato;
      const kwhAjuste = existing.kwhCompensadoAjuste;
      const valorAjuste = existing.valorAjuste;

      const kwhBase = kwhDoRateio;
      const valorBruto = (kwhBase + kwhAjuste) * valorKwh;
      const valorLiquido = valorBruto + valorAjuste;
      const novoStatus = clientePagou ? "DISPONIVEL" : "AGUARDANDO_PAGAMENTO";
      const now = new Date();

      await prisma.investorPayable.update({
        where: { id: existing.id },
        data: {
          kwhCompensadoBase: kwhBase,
          // Zera o cap herdado: applyInjectionCapToPlant será chamado em
          // seguida e recalcula kwhCreditoLegadoAbatido corretamente a
          // partir do bruto reescrito. Sem zerar, o cap soma kwhBase +
          // kwhCreditoLegadoAbatido como bruto e infla o resultado.
          kwhCreditoLegadoAbatido: 0,
          valorBruto,
          valorLiquido,
          status: novoStatus,
          consumerBillId: bill.id,
          consumerUnitBillingId: unitBilling?.id ?? null,
          // Preserva origem se já preenchida (evita overwrite num re-sync se a
          // fatura da usina mudou de id por algum motivo); preenche se ainda null.
          originatedByPlantBillId:
            existing.originatedByPlantBillId ?? originatedByPlantBillId,
          compensadoEm: now,
          pagoClienteEm: clientePagou ? (unitBilling?.pagoEm ?? now) : null,
          disponibilizadoEm:
            novoStatus === "DISPONIVEL" && existing.status !== "DISPONIVEL"
              ? now
              : undefined,
        },
      });
      result.updated++;
      result.payableIds.push(existing.id);
      touchedIds.push(existing.id);
    } else {
      // sharePercent é organizacional — não multiplica o kWh remunerável.
      const kwhBase = kwhDoRateio;
      const valorBruto = kwhBase * valorKwhCriacao;
      const now = new Date();

      const created = await prisma.investorPayable.create({
        data: {
          investorId: ip.investorId,
          plantId,
          consumerUnitId: bill.consumerUnitId,
          anoReferencia: bill.anoReferencia,
          mesReferencia: bill.mesReferencia,
          sharePercent: shareCriacao,
          valorKwhContrato: valorKwhCriacao,
          rateioVersionId,
          kwhCompensadoBase: kwhBase,
          valorBruto,
          valorLiquido: valorBruto,
          status: clientePagou ? "DISPONIVEL" : "AGUARDANDO_PAGAMENTO",
          consumerBillId: bill.id,
          consumerUnitBillingId: unitBilling?.id ?? null,
          originatedByPlantBillId,
          compensadoEm: now,
          pagoClienteEm: clientePagou ? (unitBilling?.pagoEm ?? now) : null,
          disponibilizadoEm: clientePagou ? now : null,
        },
      });
      result.created++;
      result.payableIds.push(created.id);
      touchedIds.push(created.id);
    }
  }

  // Cap acumulado de remuneração: aplica DEPOIS de criar/atualizar payables
  // pra que kwhCompensadoBase reflita o que de fato vai virar pagamento.
  // Idempotente — recalcula a partir do estado atual da plant.
  await applyInjectionCapToPlant(plantId);

  // Débitos abertos vêm POR ÚLTIMO porque dependem do valorLiquido final
  // (já com cap aplicado). Reaplicar reverte aplicações prévias.
  for (const id of touchedIds) {
    await applyInvestorDebitsToPayable(id);
  }

  return result;
}

export interface BillingTransitionResult {
  billingId: string;
  transitioned: number;
  reverted: number;
  warnings: string[];
  payableIds: string[];
}

/**
 * Transiciona InvestorPayable(s) em função do estado atual do ConsumerUnitBilling.
 *
 * Chamado após o webhook Asaas atualizar o billing. Decide transições olhando
 * `billing.pagoEm` (não depende do evento bruto):
 *  - pagoEm preenchido + payable AGUARDANDO_PAGAMENTO → DISPONIVEL
 *  - pagoEm nulo + payable DISPONIVEL (ainda não pago ao investidor) → volta pra AGUARDANDO_PAGAMENTO
 *  - pagoEm nulo + payable PAGO → emite warning (investidor já pago, estorno exige ação manual)
 *  - Estados finais (PAGO, EM_COBRANCA_JUDICIAL) não são revertidos automaticamente.
 */
export async function transitionPayablesFromBilling(
  billingId: string,
): Promise<BillingTransitionResult> {
  const result: BillingTransitionResult = {
    billingId,
    transitioned: 0,
    reverted: 0,
    warnings: [],
    payableIds: [],
  };

  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    select: {
      id: true,
      consumerUnitId: true,
      ano: true,
      mes: true,
      pagoEm: true,
      installments: true,
    },
  });
  if (!billing) {
    result.warnings.push("billing não encontrado");
    return result;
  }

  const payables = await prisma.investorPayable.findMany({
    where: {
      consumerUnitId: billing.consumerUnitId,
      anoReferencia: billing.ano,
      mesReferencia: billing.mes,
    },
    select: { id: true, status: true, parcelaIndex: true },
  });

  const installments = parseInstallments(billing.installments);
  const now = new Date();

  // Helper: aplica a transição binária pra UM payable, dado se "essa parte" está paga.
  const transitionOne = async (
    p: { id: string; status: string },
    pagoCliente: boolean,
    pagoEmDate: Date | null,
  ) => {
    if (p.status === "PAGO") {
      if (!pagoCliente) {
        result.warnings.push(
          `payable ${p.id} já PAGO ao investidor, mas parcela perdeu pagamento — verificar manualmente`,
        );
      }
      return;
    }
    if (p.status === "EM_COBRANCA_JUDICIAL") return;
    if (p.status === "AGUARDANDO_COMPENSACAO") return;

    if (pagoCliente && p.status === "AGUARDANDO_PAGAMENTO") {
      await prisma.investorPayable.update({
        where: { id: p.id },
        data: {
          status: "DISPONIVEL",
          consumerUnitBillingId: billing.id,
          pagoClienteEm: pagoEmDate,
          disponibilizadoEm: now,
        },
      });
      result.transitioned++;
      result.payableIds.push(p.id);
    } else if (!pagoCliente && p.status === "DISPONIVEL") {
      await prisma.investorPayable.update({
        where: { id: p.id },
        data: {
          status: "AGUARDANDO_PAGAMENTO",
          pagoClienteEm: null,
          disponibilizadoEm: null,
        },
      });
      result.reverted++;
      result.payableIds.push(p.id);
    }
  };

  if (installments && installments.length > 0) {
    // Modo parcelado: cada payable (parcelaIndex i) transita conforme o pagoEm
    // da parcela i específica.
    for (const p of payables) {
      const item = installments[p.parcelaIndex];
      if (!item) {
        result.warnings.push(
          `payable ${p.id} parcelaIndex ${p.parcelaIndex} sem parcela correspondente`,
        );
        continue;
      }
      const pagoEmDate = item.pagoEm ? new Date(item.pagoEm) : null;
      await transitionOne(p, !!item.pagoEm, pagoEmDate);
    }
  } else {
    // Modo cobrança única: transição binária a partir de billing.pagoEm.
    const clientePagou = !!billing.pagoEm;
    for (const p of payables) {
      await transitionOne(p, clientePagou, billing.pagoEm);
    }
  }

  return result;
}

/**
 * Fragmenta os InvestorPayable existentes em N parcelas quando o billing
 * passa a ter `installments`. Atualiza o payable original (parcelaIndex 0) e cria
 * (N-1) novos com mesmo snapshot de share/valorKwh, valor proporcional.
 *
 * Idempotente: se já existem N payables, não faz nada. Se há > N (ex.: rebaixar
 * de 5 para 3), os excedentes são deletados desde que não estejam pagos.
 */
export async function fragmentPayablesForInstallments(
  billingId: string,
  n: number,
): Promise<{ created: number; updated: number; deleted: number }> {
  const out = { created: 0, updated: 0, deleted: 0 };
  if (n < 1) return out;

  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    select: { id: true, consumerUnitId: true, ano: true, mes: true },
  });
  if (!billing) return out;

  const existing = await prisma.investorPayable.findMany({
    where: {
      consumerUnitId: billing.consumerUnitId,
      anoReferencia: billing.ano,
      mesReferencia: billing.mes,
    },
    orderBy: { parcelaIndex: "asc" },
  });
  if (existing.length === 0) return out;

  // Agrupa por investidor (geralmente 1 investidor por usina, mas pode ter +1).
  const byInvestor = new Map<string, typeof existing>();
  for (const p of existing) {
    const arr = byInvestor.get(p.investorId) ?? [];
    arr.push(p);
    byInvestor.set(p.investorId, arr);
  }

  for (const [, group] of byInvestor) {
    // Pega o snapshot do parcelaIndex=0 (ou qualquer um — todos compartilham o
    // mesmo contrato/share por construção).
    const base = group.find((p) => p.parcelaIndex === 0) ?? group[0];
    const totalKwhBase =
      group.reduce((acc, p) => acc + p.kwhCompensadoBase, 0) || base.kwhCompensadoBase;
    const totalValorBruto =
      group.reduce((acc, p) => acc + p.valorBruto, 0) || base.valorBruto;
    const totalValorAjuste = group.reduce((acc, p) => acc + p.valorAjuste, 0);
    const totalKwhAjuste = group.reduce((acc, p) => acc + p.kwhCompensadoAjuste, 0);

    const kwhBasePorParcela = totalKwhBase / n;
    const valorBrutoPorParcela = totalValorBruto / n;
    // Ajuste manual fica concentrado na parcela 0 (não distribui automaticamente
    // — operador deve reaplicar se quiser dividir).
    const valorLiquidoPorParcela = valorBrutoPorParcela;

    // Atualiza/cria parcelaIndex 0..N-1
    for (let i = 0; i < n; i++) {
      const isFirst = i === 0;
      const valorAjusteI = isFirst ? totalValorAjuste : 0;
      const kwhAjusteI = isFirst ? totalKwhAjuste : 0;
      const valorLiquidoI = valorLiquidoPorParcela + valorAjusteI;

      const current = group.find((p) => p.parcelaIndex === i);
      if (current) {
        if (current.status === "PAGO" || current.status === "EM_COBRANCA_JUDICIAL") {
          // Não toca em payable já pago/judicial — preserva.
          continue;
        }
        await prisma.investorPayable.update({
          where: { id: current.id },
          data: {
            kwhCompensadoBase: kwhBasePorParcela,
            kwhCompensadoAjuste: kwhAjusteI,
            valorBruto: valorBrutoPorParcela,
            valorAjuste: valorAjusteI,
            valorLiquido: valorLiquidoI,
            // Ao re-fragmentar, se o payable estava DISPONIVEL e agora a parcela
            // ainda não foi paga, a transitionPayablesFromBilling cuidará disso.
          },
        });
        out.updated++;
      } else {
        await prisma.investorPayable.create({
          data: {
            investorId: base.investorId,
            plantId: base.plantId,
            consumerUnitId: base.consumerUnitId,
            anoReferencia: base.anoReferencia,
            mesReferencia: base.mesReferencia,
            parcelaIndex: i,
            sharePercent: base.sharePercent,
            valorKwhContrato: base.valorKwhContrato,
            rateioVersionId: base.rateioVersionId,
            kwhCompensadoBase: kwhBasePorParcela,
            kwhCompensadoAjuste: kwhAjusteI,
            valorBruto: valorBrutoPorParcela,
            valorAjuste: valorAjusteI,
            valorLiquido: valorLiquidoI,
            status: "AGUARDANDO_PAGAMENTO",
            consumerBillId: base.consumerBillId,
            consumerUnitBillingId: base.consumerUnitBillingId,
            originatedByPlantBillId: base.originatedByPlantBillId,
            compensadoEm: base.compensadoEm,
          },
        });
        out.created++;
      }
    }

    // Remove parcelas excedentes (ex.: re-parcelar de 5 → 3) se não pagas.
    for (const p of group) {
      if (p.parcelaIndex >= n) {
        if (p.status === "PAGO" || p.status === "EM_COBRANCA_JUDICIAL") continue;
        await prisma.investorPayable.delete({ where: { id: p.id } });
        out.deleted++;
      }
    }
  }

  return out;
}
