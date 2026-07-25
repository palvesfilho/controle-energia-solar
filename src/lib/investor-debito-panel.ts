import { prisma } from "@/lib/prisma";

/**
 * Painel do saldo devedor de um mês: qual era a dívida em aberto, quanto coube
 * abater (limitado pelo valor bruto) e quanto sobra para os próximos meses.
 *
 * Fonte única da tela de faturamento e do PDF do investidor — os dois mostram
 * a mesma linha "− Multas, negociações, gestão, outros" e não podem divergir.
 *
 * Reconstruído das aplicações REAIS (InvestorDebitApplication) nos payables do
 * mês, nunca de um saldo calculado por fora: assim o painel jamais diverge do
 * que de fato foi abatido.
 */
export interface DebitoPanel {
  /** Dívida em aberto ANTES do abatimento deste mês. */
  aberto: number;
  /** Quanto foi efetivamente abatido aqui (= soma de valorAbatidoDebito). */
  abatido: number;
  /** Saldo que segue para os próximos meses. */
  restante: number;
  /** Composição da dívida, um item por débito de origem, em ordem cronológica. */
  itens: Array<{ label: string; valor: number }>;
}

const MES_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/**
 * @param payableIds payables cuja ORIGEM é o mês em questão (só eles recebem
 *   abatimento pertencente à competência do mês).
 * @param ano/mes competência do relatório.
 */
export async function resolveDebitoPanel(args: {
  payableIds: string[];
  ano: number;
  mes: number;
}): Promise<DebitoPanel | null> {
  const { payableIds, ano, mes } = args;
  if (payableIds.length === 0) return null;

  const aplicacoes = await prisma.investorDebitApplication.findMany({
    where: { payableId: { in: payableIds } },
    select: { debitId: true },
  });
  const debitIds = Array.from(new Set(aplicacoes.map((a) => a.debitId)));
  if (debitIds.length === 0) return null;

  const debitos = await prisma.investorDebit.findMany({
    where: { id: { in: debitIds } },
    select: {
      valorOriginal: true,
      motivo: true,
      applications: {
        select: {
          valorAbatido: true,
          payable: {
            select: {
              anoReferencia: true,
              mesReferencia: true,
              originatedByPlantBill: {
                select: { anoReferencia: true, mesReferencia: true },
              },
            },
          },
        },
      },
    },
  });

  const ordinalRelatorio = ano * 12 + mes;
  const itens: Array<{ label: string; valor: number; ordem: number }> = [];
  let aberto = 0;
  let abatido = 0;

  for (const d of debitos) {
    let abatidoAntes = 0;
    let abatidoAgora = 0;
    for (const app of d.applications) {
      // Origem (não display, não data de aplicação): publicando out/2025 hoje,
      // o abate feito num payable de nov/2025 não pode contar como "já
      // abatido" — ele vem depois na linha do tempo do relatório.
      const a =
        app.payable.originatedByPlantBill?.anoReferencia ??
        app.payable.anoReferencia;
      const m =
        app.payable.originatedByPlantBill?.mesReferencia ??
        app.payable.mesReferencia;
      const ord = a * 12 + m;
      if (ord < ordinalRelatorio) abatidoAntes += app.valorAbatido;
      else if (ord === ordinalRelatorio) abatidoAgora += app.valorAbatido;
    }

    const abertoDoDebito = d.valorOriginal - abatidoAntes;
    if (abertoDoDebito <= 0.009 && abatidoAgora <= 0.009) continue;
    aberto += abertoDoDebito;
    abatido += abatidoAgora;

    // "Saldo negativo do relatorio Julho/2025 (usina X)" -> "Julho/2025"
    const competencia = d.motivo?.match(/relatorio\s+([A-Za-zç]+)\/(\d{4})/i);
    const mesIdx = competencia
      ? MES_LABELS.findIndex(
          (l) => l.toLowerCase() === competencia[1].toLowerCase(),
        )
      : -1;
    itens.push({
      label: competencia
        ? `Conta da usina de ${competencia[1]}/${competencia[2]}`
        : (d.motivo ?? "Débito do investidor"),
      valor: abertoDoDebito,
      ordem:
        mesIdx >= 0
          ? Number(competencia![2]) * 12 + mesIdx
          : Number.MAX_SAFE_INTEGER,
    });
  }

  if (aberto <= 0.009) return null;

  return {
    aberto,
    abatido,
    restante: aberto - abatido,
    itens: itens
      .sort((a, b) => a.ordem - b.ordem)
      .map(({ label, valor }) => ({ label, valor })),
  };
}
