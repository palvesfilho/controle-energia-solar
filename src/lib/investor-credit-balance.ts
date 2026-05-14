/**
 * Saldo acumulado de crédito de energia (kWh) do investidor numa usina.
 *
 * Definição operacional:
 *   saldo(N) = max(0, saldo(N−1) + injetado(N) − compensado(N))
 *   creditoLegado(N) = max(0, compensado(N) − (saldo(N−1) + injetado(N)))
 *
 *   - injetado(N): ConsumerBill.energiaInjetadaMedidorKwh da UC da usina no mês N
 *     (usa a fatura mais recente daquele mês, em caso de re-sync).
 *   - compensado(N): soma de kwhCompensadoBase + kwhCompensadoAjuste de todos
 *     os InvestorPayable do investidor cuja ORIGEM (originatedByPlantBill) é o
 *     mês N. Status diferente de AGUARDANDO_COMPENSACAO. Se um payable não tem
 *     origem mapeada, usa fallback (ano/mes do payable).
 *   - creditoLegado(N): excedente que ultrapassa o cap = compensação que veio
 *     de créditos pré-existentes nas UCs (não originados pela usina). Não
 *     remunerável ao investidor; deve ser sinalizado.
 *   - Marco zero: primeira ConsumerBill da usina cadastrada no sistema.
 */

import { prisma } from "@/lib/prisma";

export interface SaldoCreditoMensal {
  ano: number;
  mes: number;
  injetado: number;
  /** Compensação bruta do mês (sem cap aplicado). */
  compensadoBruto: number;
  /** Compensação remunerável após cap (= bruto − legado). */
  compensadoEfetivo: number;
  /** Excedente não remunerável (créditos legados das UCs). */
  creditoLegado: number;
  saldoFim: number;
}

export interface SaldoCreditoResult {
  /** Saldo acumulado no início do mês de referência (= fim do mês anterior). */
  saldoAnterior: number;
  /** kWh injetado pela usina no mês de referência. */
  injetadoMes: number;
  /** kWh compensado bruto no mês de referência (antes do cap). */
  compensadoBrutoMes: number;
  /** kWh efetivamente remunerado no mês de referência (após cap). */
  compensadoEfetivoMes: number;
  /** kWh de crédito legado abatido no mês de referência (cap excedente). */
  creditoLegadoMes: number;
  /** Saldo acumulado no final do mês de referência (≥ 0). */
  saldoFinal: number;
  /** Histórico mês a mês desde o marco zero até o mês de referência. */
  historico: SaldoCreditoMensal[];
}

export async function calcularSaldoCredito(args: {
  plantId: string;
  investorId: string;
  ano: number;
  mes: number;
}): Promise<SaldoCreditoResult> {
  const { plantId, investorId, ano, mes } = args;

  // Marco zero do saldo: data em que o RATEIO começou a vigorar. Antes disso,
  // os créditos da usina ficam trancados na própria UC geradora (não distribuem
  // pras receptoras), então não devem entrar no saldo do investidor.
  // Pega a vigência MAIS ANTIGA entre as RateioVersion vigentes/substituídas.
  // Fallback pra dataAssinaturaContrato quando não há rateio (compat).
  const [plant, primeiroRateio] = await Promise.all([
    prisma.plant.findUnique({
      where: { id: plantId },
      select: { dataAssinaturaContrato: true },
    }),
    prisma.rateioVersion.findFirst({
      where: {
        plantId,
        status: { in: ["VIGENTE", "SUBSTITUIDO"] },
      },
      orderBy: { vigenteAPartirDe: "asc" },
      select: { vigenteAPartirDe: true },
    }),
  ]);

  const dataMarcoZero =
    primeiroRateio?.vigenteAPartirDe ?? plant?.dataAssinaturaContrato ?? null;
  const anoMarco = dataMarcoZero?.getUTCFullYear() ?? null;
  const mesMarco =
    dataMarcoZero != null ? dataMarcoZero.getUTCMonth() + 1 : null;

  // Filtro por ano/mes (fallback quando bill não tem dataLeituraAtual).
  const filtroAnoMes =
    anoMarco != null && mesMarco != null
      ? {
          OR: [
            { anoReferencia: { gt: anoMarco } },
            { anoReferencia: anoMarco, mesReferencia: { gte: mesMarco } },
          ],
        }
      : {};

  const ateOMes = {
    OR: [
      { anoReferencia: { lt: ano } },
      { anoReferencia: ano, mesReferencia: { lte: mes } },
    ],
  };

  // 1) Bills da UC da usina — pega a mais recente por (ano, mês) caso haja re-sync.
  //    Filtra primeiro pelo intervalo (ano,mes) por simplicidade da query, depois
  //    aplica o filtro fino de dataLeituraAtual >= vigenteAPartirDe in-memory
  //    (porque pode haver bills com dataLeituraAtual null que precisamos tratar
  //    com fallback).
  const billsRaw = await prisma.consumerBill.findMany({
    where: {
      plantId,
      consumerUnitId: null,
      AND: [filtroAnoMes, ateOMes],
    },
    orderBy: { syncedAt: "desc" },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      energiaInjetadaMedidorKwh: true,
      dataLeituraAtual: true,
    },
  });

  const injetadoPorMes = new Map<string, number>();
  for (const b of billsRaw) {
    // Filtro fino: se temos a data marco e a bill tem leitura, exige
    // dataLeituraAtual >= vigenteAPartirDe (regra: a primeira fatura cuja
    // leitura foi feita DEPOIS do rateio entrar em vigor já conta).
    if (dataMarcoZero != null && b.dataLeituraAtual != null) {
      if (b.dataLeituraAtual < dataMarcoZero) continue;
    }
    // Sem dataLeituraAtual: cai no fallback de comparar mês-referência.
    // (já garantido pelo filtroAnoMes acima)
    const key = `${b.anoReferencia}-${b.mesReferencia}`;
    if (!injetadoPorMes.has(key)) {
      injetadoPorMes.set(key, b.energiaInjetadaMedidorKwh ?? 0);
    }
  }

  // 2) Payables — agrupa pelo MÊS DE ORIGEM (originatedByPlantBill).
  //    Saldo lines (carriedFromPayableId != null) sao kWh do mes de origem
  //    real que foram carregados pra mes seguinte por inadimplencia ou edicao
  //    manual. A compensacao FISICA aconteceu no mes de origem, entao o saldo
  //    formula deve contabilizar essas linhas no mes do payable ORIGEM, nao
  //    no mes onde elas aparecem.
  const payables = await prisma.investorPayable.findMany({
    where: {
      investorId,
      plantId,
      status: { not: "AGUARDANDO_COMPENSACAO" },
    },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      carriedFromPayableId: true,
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
      carriedFromPayable: {
        select: {
          anoReferencia: true,
          mesReferencia: true,
          originatedByPlantBill: {
            select: { anoReferencia: true, mesReferencia: true },
          },
        },
      },
    },
  });
  const compensadoPorMes = new Map<string, number>();
  for (const p of payables) {
    // Origem real: pra natural payable, eh seu proprio originatedByPlantBill;
    // pra saldo line, eh o originatedByPlantBill do payable ORIGEM (a saldo
    // line tem originatedByPlantBill apontando pro mes onde aparece, nao pro
    // mes de origem). Convencao do cascade-unpaid-payables.
    const origem = p.carriedFromPayableId
      ? p.carriedFromPayable
      : { originatedByPlantBill: p.originatedByPlantBill, anoReferencia: p.anoReferencia, mesReferencia: p.mesReferencia };
    const ano2 =
      origem?.originatedByPlantBill?.anoReferencia ??
      origem?.anoReferencia ??
      p.anoReferencia;
    const mes2 =
      origem?.originatedByPlantBill?.mesReferencia ??
      origem?.mesReferencia ??
      p.mesReferencia;
    if (ano2 > ano || (ano2 === ano && mes2 > mes)) continue; // só até o mês de referência
    if (
      anoMarco != null &&
      mesMarco != null &&
      (ano2 < anoMarco || (ano2 === anoMarco && mes2 < mesMarco))
    ) {
      continue; // ignora origens anteriores ao marco zero (vigência do rateio)
    }
    const key = `${ano2}-${mes2}`;
    const cur = compensadoPorMes.get(key) ?? 0;
    compensadoPorMes.set(
      key,
      cur + (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0),
    );
  }

  // 3) União das chaves (ano, mês), ordenada cronologicamente.
  const chaves = new Set<string>([
    ...injetadoPorMes.keys(),
    ...compensadoPorMes.keys(),
  ]);
  const meses = Array.from(chaves)
    .map((k) => {
      const [a, m] = k.split("-").map(Number);
      return { ano: a, mes: m };
    })
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);

  // 4) Caminhada cumulativa com cap.
  const historico: SaldoCreditoMensal[] = [];
  let saldoAcumulado = 0;
  let saldoAnterior = 0;
  let injetadoMes = 0;
  let compensadoBrutoMes = 0;
  let compensadoEfetivoMes = 0;
  let creditoLegadoMes = 0;
  for (const { ano: a, mes: m } of meses) {
    const key = `${a}-${m}`;
    const inj = injetadoPorMes.get(key) ?? 0;
    const compBruto = compensadoPorMes.get(key) ?? 0;
    const disponivel = saldoAcumulado + inj;
    const compEfetivo = Math.min(compBruto, disponivel);
    const legado = Math.max(0, compBruto - disponivel);
    const novoSaldo = disponivel - compEfetivo; // ≥ 0

    if (a === ano && m === mes) {
      saldoAnterior = saldoAcumulado;
      injetadoMes = inj;
      compensadoBrutoMes = compBruto;
      compensadoEfetivoMes = compEfetivo;
      creditoLegadoMes = legado;
    }
    saldoAcumulado = novoSaldo;
    historico.push({
      ano: a,
      mes: m,
      injetado: inj,
      compensadoBruto: compBruto,
      compensadoEfetivo: compEfetivo,
      creditoLegado: legado,
      saldoFim: novoSaldo,
    });
  }

  // Se o mês de referência não tinha movimento, "anterior" é o saldo até o último
  // mês com movimento; "final" é o mesmo.
  if (!chaves.has(`${ano}-${mes}`)) {
    saldoAnterior = saldoAcumulado;
  }

  return {
    saldoAnterior,
    injetadoMes,
    compensadoBrutoMes,
    compensadoEfetivoMes,
    creditoLegadoMes,
    saldoFinal: saldoAcumulado,
    historico,
  };
}
