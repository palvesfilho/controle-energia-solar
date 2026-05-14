/**
 * Cap acumulado da remuneração ao investidor pela injeção real da usina.
 *
 * Regra: para todo mês M, Σ compensação remunerada até M ≤ Σ injeção da usina
 * até M. O excedente representa créditos legados (anteriores ao sistema,
 * propriedade do Paulo) que não devem gerar pagamento ao investidor.
 *
 * Cap por modo (`Plant.regraInstalacao`):
 *  - USINA_DEDICADA           → Σ energiaInjetadaMedidorKwh (fallback geracaoInversorKwh)
 *  - USINA_CONSUMO_PROPRIO    → Σ (energiaInjetadaMedidorKwh + consumoInstantaneoKwh)
 *  - USINA_CONSUMO_DESCONTADO → Σ (energiaInjetadaMedidorKwh + consumoInstantaneoKwh)
 *
 * Algoritmo (processa mês a mês cronologicamente, idempotente):
 *  - Para cada mês M com payables ou injeção:
 *      injecao_acum += injeção do mês
 *      consumido_acum += Σ kwhCompensadoBase de payables FINAIS do mês
 *      capDisponivel = max(0, injecao_acum - consumido_acum)
 *      Σ_bruto_não_finais = Σ (kwhBase + kwhCreditoLegadoAbatido) das não-finais do mês
 *      Se Σ_bruto ≤ capDisponivel: zera o abate, paga tudo
 *      Senão: aplica fator proporcional, registra abate
 *      consumido_acum += quanto efetivamente entrou no cap
 *
 * Status finais (PAGO, EM_COBRANCA_JUDICIAL) NUNCA são tocados — o que já
 * foi pago é considerado "consumido" e ocupa o cap. Se finais sozinhos já
 * excedem o cap, emite warning (não há como reverter pagamentos).
 */

import { prisma } from "@/lib/prisma";

const STATUS_FINAIS = new Set(["PAGO", "EM_COBRANCA_JUDICIAL"]);

export interface CapApplyResult {
  plantId: string;
  capInjecaoTotalKwh: number;
  totalCompensadoBrutoKwh: number;
  totalAbatidoKwh: number;
  payablesAfetadas: number;
  warnings: string[];
}

async function findUcGeradoraId(plantId: string): Promise<string | null> {
  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: {
      numeroUsina: true,
      unidadeConsumidora: true,
      codigoCliente: true,
    },
  });
  if (!plant) return null;

  const codigos = [
    plant.numeroUsina,
    plant.unidadeConsumidora,
    plant.codigoCliente,
  ].filter(Boolean) as string[];
  if (codigos.length === 0) return null;

  const uc = await prisma.consumerUnit.findFirst({
    where: { plantId, codigoUc: { in: codigos } },
    select: { id: true },
  });
  return uc?.id ?? null;
}

function injecaoDeBill(
  bill: {
    energiaInjetadaMedidorKwh: number | null;
    consumoInstantaneoKwh: number | null;
    geracaoInversorKwh: number | null;
  },
  isDedicada: boolean,
): number {
  const medidor = bill.energiaInjetadaMedidorKwh;
  const inversor = bill.geracaoInversorKwh ?? 0;
  if (isDedicada) return medidor ?? inversor;
  if (medidor != null) return medidor + (bill.consumoInstantaneoKwh ?? 0);
  return inversor;
}

function ymKey(ano: number, mes: number) {
  return ano * 100 + mes;
}

export async function applyInjectionCapToPlant(
  plantId: string,
): Promise<CapApplyResult> {
  const result: CapApplyResult = {
    plantId,
    capInjecaoTotalKwh: 0,
    totalCompensadoBrutoKwh: 0,
    totalAbatidoKwh: 0,
    payablesAfetadas: 0,
    warnings: [],
  };

  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: { id: true, regraInstalacao: true },
  });
  if (!plant) {
    result.warnings.push("plant não encontrada");
    return result;
  }
  const isDedicada = plant.regraInstalacao === "USINA_DEDICADA";

  // Bills da UC geradora (preferido) ou ConsumerBill com plantId direto e
  // sem consumerUnitId (fallback DEDICADA sem UC cadastrada).
  const ucGeradoraId = await findUcGeradoraId(plantId);
  const billsUsina = await prisma.consumerBill.findMany({
    where: ucGeradoraId
      ? { consumerUnitId: ucGeradoraId }
      : { plantId, consumerUnitId: null },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      energiaInjetadaMedidorKwh: true,
      consumoInstantaneoKwh: true,
      geracaoInversorKwh: true,
    },
  });

  const injecaoPorMes = new Map<number, number>();
  for (const b of billsUsina) {
    const k = ymKey(b.anoReferencia, b.mesReferencia);
    injecaoPorMes.set(
      k,
      (injecaoPorMes.get(k) ?? 0) + injecaoDeBill(b, isDedicada),
    );
  }
  result.capInjecaoTotalKwh = Array.from(injecaoPorMes.values()).reduce(
    (a, v) => a + v,
    0,
  );

  const payables = await prisma.investorPayable.findMany({
    where: { plantId },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      status: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      kwhCreditoLegadoAbatido: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorKwhContrato: true,
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  const payablesPorMes = new Map<number, typeof payables>();
  for (const p of payables) {
    const k = ymKey(p.anoReferencia, p.mesReferencia);
    const arr = payablesPorMes.get(k) ?? [];
    arr.push(p);
    payablesPorMes.set(k, arr);
  }

  // Conjunto ordenado de meses a processar (todos que tem injeção OU payable).
  const mesesSet = new Set<number>([
    ...injecaoPorMes.keys(),
    ...payablesPorMes.keys(),
  ]);
  const mesesOrdenados = Array.from(mesesSet).sort((a, b) => a - b);

  let injecaoAcum = 0;
  let consumidoAcum = 0;

  for (const mesKey of mesesOrdenados) {
    injecaoAcum += injecaoPorMes.get(mesKey) ?? 0;
    const payablesDoMes = payablesPorMes.get(mesKey) ?? [];

    const finais = payablesDoMes.filter((p) => STATUS_FINAIS.has(p.status));
    const naoFinais = payablesDoMes.filter((p) => !STATUS_FINAIS.has(p.status));

    const consumoFinaisMes = finais.reduce(
      (a, p) => a + p.kwhCompensadoBase,
      0,
    );
    consumidoAcum += consumoFinaisMes;
    if (consumidoAcum > injecaoAcum + 0.0001) {
      result.warnings.push(
        `${Math.floor(mesKey / 100)}-${String(mesKey % 100).padStart(2, "0")}: payables em status final excedem o cap (consumido ${consumidoAcum.toFixed(2)} > injeção ${injecaoAcum.toFixed(2)})`,
      );
    }

    const capDisponivelMes = Math.max(0, injecaoAcum - consumidoAcum);
    const brutoNaoFinaisPorPayable = naoFinais.map((p) => ({
      ...p,
      bruto: p.kwhCompensadoBase + p.kwhCreditoLegadoAbatido,
    }));
    const totalBrutoMes = brutoNaoFinaisPorPayable.reduce(
      (a, p) => a + p.bruto,
      0,
    );
    result.totalCompensadoBrutoKwh += totalBrutoMes + consumoFinaisMes;

    let fator: number;
    let consumidoMesNaoFinais: number;
    if (totalBrutoMes <= capDisponivelMes || totalBrutoMes < 0.0001) {
      fator = 1;
      consumidoMesNaoFinais = totalBrutoMes;
    } else {
      fator = capDisponivelMes / totalBrutoMes;
      consumidoMesNaoFinais = capDisponivelMes;
    }

    for (const p of brutoNaoFinaisPorPayable) {
      const novaBase = p.bruto * fator;
      const novoAbatido = p.bruto - novaBase;
      const novoValorBruto =
        (novaBase + p.kwhCompensadoAjuste) * p.valorKwhContrato;
      const novoValorLiquido =
        novoValorBruto + p.valorAjuste - p.valorAbatidoDebito;

      const mudouBase =
        Math.abs(novaBase - p.kwhCompensadoBase) > 0.0001 ||
        Math.abs(novoAbatido - p.kwhCreditoLegadoAbatido) > 0.0001;
      if (mudouBase) {
        await prisma.investorPayable.update({
          where: { id: p.id },
          data: {
            kwhCompensadoBase: novaBase,
            kwhCreditoLegadoAbatido: novoAbatido,
            valorBruto: novoValorBruto,
            valorLiquido: novoValorLiquido,
          },
        });
      }
      if (novoAbatido > 0.0001) {
        result.payablesAfetadas++;
        result.totalAbatidoKwh += novoAbatido;
      }
    }

    consumidoAcum += consumidoMesNaoFinais;
  }

  return result;
}
