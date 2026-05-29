/**
 * Cálculo de economia e crédito acumulados de uma UC, somando todas as faturas
 * desde o início do contrato (ou desde a primeira fatura, se a data não estiver
 * cadastrada) até o mês de referência informado (inclusive).
 *
 * Usado pelo demonstrativo de cobrança (cards "Economia Total Acumulada" e
 * "Crédito Total Acumulado") e por qualquer outro relatório histórico.
 */
import { prisma } from "@/lib/prisma";

export interface AteMesAno {
  ano: number;
  mes: number;
}

export interface AcumuladoResultado {
  /** R$ — soma de ConsumerUnitBilling.valorEconomia (>= 0) */
  economiaR$: number;
  /** kWh — soma da energia compensada em kWh (TE + TUSD) das faturas */
  creditoKwh: number;
  /** quantos meses entraram na soma */
  mesesContados: number;
  /** primeiro ano/mês considerado (post-cutoff) */
  desde: { ano: number; mes: number } | null;
}

/**
 * Compara dois pares ano/mês como número único (ano*100 + mes).
 * Ex.: { ano:2026, mes:5 } → 202605.
 */
const codigoMes = (ano: number, mes: number) => ano * 100 + mes;

/**
 * Decide o "marco zero" do contrato:
 *  - usa `dataInicioContrato` quando disponível (campo novo)
 *  - senão tenta parsear `vigenciaCompensacao` no formato "MM/AAAA"
 *  - senão retorna null → significa "soma desde a primeira fatura"
 */
function resolveMarcoZero(uc: {
  dataInicioContrato: Date | null;
  vigenciaCompensacao: string | null;
}): { ano: number; mes: number } | null {
  if (uc.dataInicioContrato) {
    return {
      ano: uc.dataInicioContrato.getUTCFullYear(),
      mes: uc.dataInicioContrato.getUTCMonth() + 1,
    };
  }
  if (uc.vigenciaCompensacao) {
    const m = uc.vigenciaCompensacao.match(/^(\d{1,2})[/\-](\d{4})$/);
    if (m) {
      const mes = Number(m[1]);
      const ano = Number(m[2]);
      if (mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100) {
        return { ano, mes };
      }
    }
  }
  return null;
}

export async function computarAcumulados(
  consumerUnitId: string,
  ate: AteMesAno,
): Promise<AcumuladoResultado> {
  const uc = await prisma.consumerUnit.findUnique({
    where: { id: consumerUnitId },
    select: { dataInicioContrato: true, vigenciaCompensacao: true },
  });

  if (!uc) {
    return { economiaR$: 0, creditoKwh: 0, mesesContados: 0, desde: null };
  }

  const marcoZero = resolveMarcoZero(uc);
  const ateCodigo = codigoMes(ate.ano, ate.mes);

  // Busca billings da UC até o mês de referência (inclusive).
  // O Postgres não tem operador "≤(ano,mes)" nativo, então pegamos um superset
  // e filtramos em código.
  const billings = await prisma.consumerUnitBilling.findMany({
    where: {
      consumerUnitId,
      OR: [
        { ano: { lt: ate.ano } },
        { ano: ate.ano, mes: { lte: ate.mes } },
      ],
    },
    select: {
      ano: true,
      mes: true,
      valorEconomia: true,
    },
  });

  // Energia compensada vem do ConsumerBill (não está em ConsumerUnitBilling).
  // Soma injetadaOucTeKwh + injetadaOucTusdKwh (em módulo) por mês.
  const bills = await prisma.consumerBill.findMany({
    where: {
      consumerUnitId,
      OR: [
        { anoReferencia: { lt: ate.ano } },
        { anoReferencia: ate.ano, mesReferencia: { lte: ate.mes } },
      ],
    },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      injetadaOucTeKwh: true,
      injetadaOucTusdKwh: true,
    },
  });

  const marcoCodigo = marcoZero ? codigoMes(marcoZero.ano, marcoZero.mes) : 0;

  let economiaR$ = 0;
  let creditoKwh = 0;
  let mesesContados = 0;
  let menorCodigo = Infinity;

  for (const b of billings) {
    const codigo = codigoMes(b.ano, b.mes);
    if (codigo < marcoCodigo) continue;
    if (codigo > ateCodigo) continue;
    if (b.valorEconomia != null && b.valorEconomia > 0) {
      economiaR$ += b.valorEconomia;
    }
    mesesContados += 1;
    if (codigo < menorCodigo) menorCodigo = codigo;
  }

  for (const b of bills) {
    const codigo = codigoMes(b.anoReferencia, b.mesReferencia);
    if (codigo < marcoCodigo) continue;
    if (codigo > ateCodigo) continue;
    const te = b.injetadaOucTeKwh != null ? Math.abs(b.injetadaOucTeKwh) : 0;
    const tusd = b.injetadaOucTusdKwh != null ? Math.abs(b.injetadaOucTusdKwh) : 0;
    creditoKwh += te + tusd;
  }

  return {
    economiaR$: Number(economiaR$.toFixed(2)),
    creditoKwh: Number(creditoKwh.toFixed(2)),
    mesesContados,
    desde:
      menorCodigo === Infinity
        ? null
        : { ano: Math.floor(menorCodigo / 100), mes: menorCodigo % 100 },
  };
}
