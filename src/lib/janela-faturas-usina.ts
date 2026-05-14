/**
 * Calcula a janela de ConsumerBills da UC GERADORA que devem ser descontadas
 * num relatório do investidor.
 *
 * Regra de negócio:
 *  - Em meses SEM compensação (UC do rateio sem créditos compensados), o
 *    operador não gera relatório nem cobra gestão de energia. Mas a fatura
 *    da UC geradora desse mês ainda existe e precisa ser cobrada.
 *  - Solução: o próximo relatório com compensação acumula a fatura da usina
 *    dos meses pulados.
 *
 * Algoritmo:
 *  1. Encontra o último MonthlyReport PUBLISHED antes do mês atual (= relatório
 *     do investidor foi efetivamente gerado e publicado).
 *  2. Janela = [(últimoRelatório + 1 mês), (mês atual)]. Se não houver
 *     relatório anterior, usa `dataAssinaturaContrato` como início.
 *  3. Aplica safety cap: nunca pega bills antes da assinatura.
 *
 * Retorna lista ordenada de bills no formato pronto pra display/cálculo.
 */
import { prisma } from "@/lib/prisma";

interface JanelaFaturasArgs {
  plantId: string;
  ano: number;
  mes: number;
  dataAssinaturaContrato: Date | null;
}

interface FaturaUsina {
  id: string;
  anoReferencia: number;
  mesReferencia: number;
  valorTotal: number | null;
}

export async function janelaFaturasUsinaDescontadas(
  args: JanelaFaturasArgs,
): Promise<FaturaUsina[]> {
  const { plantId, ano, mes, dataAssinaturaContrato } = args;

  // 1) Último MonthlyReport PUBLISHED COM COMPENSAÇÃO REAL em mês anterior.
  //    Relatórios "vazios" (gerados sem compensação ou sem cobrança da usina)
  //    NÃO contam como marco — se o operador gerou um PDF zerado pra Jul, a
  //    fatura da usina de Jul ainda precisa entrar no próximo relatório real.
  const ultimoRelatorio = await prisma.monthlyReport.findFirst({
    where: {
      plantId,
      status: "PUBLISHED",
      OR: [
        { ano: { lt: ano } },
        { ano, mes: { lt: mes } },
      ],
      // Pelo menos um sinal de "houve algo cobrado": créditos compensados ou
      // valor bruto > 0. Se ambos zerados, o relatório é vazio e ignoramos.
      AND: [
        {
          OR: [
            { creditosUtilizados: { gt: 0 } },
            { valorBrutoGerador: { gt: 0 } },
          ],
        },
      ],
    },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    select: { ano: true, mes: true },
  });

  // 2) Determina o INÍCIO da janela.
  let inicioAno: number;
  let inicioMes: number;
  if (ultimoRelatorio) {
    if (ultimoRelatorio.mes === 12) {
      inicioAno = ultimoRelatorio.ano + 1;
      inicioMes = 1;
    } else {
      inicioAno = ultimoRelatorio.ano;
      inicioMes = ultimoRelatorio.mes + 1;
    }
  } else if (dataAssinaturaContrato) {
    inicioAno = dataAssinaturaContrato.getUTCFullYear();
    inicioMes = dataAssinaturaContrato.getUTCMonth() + 1;
  } else {
    // Sem contrato registrado e sem relatórios anteriores — só pega o mês atual.
    inicioAno = ano;
    inicioMes = mes;
  }

  // 3) Safety cap: nunca pegar antes da assinatura, mesmo que algum relatório
  //    antigo tenha sido gerado por engano com data anterior.
  if (dataAssinaturaContrato) {
    const assinAno = dataAssinaturaContrato.getUTCFullYear();
    const assinMes = dataAssinaturaContrato.getUTCMonth() + 1;
    if (
      inicioAno < assinAno ||
      (inicioAno === assinAno && inicioMes < assinMes)
    ) {
      inicioAno = assinAno;
      inicioMes = assinMes;
    }
  }

  // 4) Query bills no intervalo [inicio..atual].
  const bills = await prisma.consumerBill.findMany({
    where: {
      plantId,
      consumerUnitId: null,
      AND: [
        {
          OR: [
            { anoReferencia: { gt: inicioAno } },
            { anoReferencia: inicioAno, mesReferencia: { gte: inicioMes } },
          ],
        },
        {
          OR: [
            { anoReferencia: { lt: ano } },
            { anoReferencia: ano, mesReferencia: { lte: mes } },
          ],
        },
      ],
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
    },
  });

  return bills;
}
