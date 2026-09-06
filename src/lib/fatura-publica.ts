/**
 * A fatura de energia vista por QUEM VAI PAGAR — sem login.
 *
 * O cliente recebe `${APP_BASE_URL}/fatura/<tokenPublico>` no email e no
 * WhatsApp, em vez do checkout hospedado do Asaas. Lá ele paga por PIX ou
 * boleto e abre o demonstrativo, tudo no domínio da empresa.
 *
 * 🔒 **A chave é o `tokenPublico` (UUID), não a sessão** — o pagador não tem
 * conta e nunca vai ter. Isso impõe duas regras a tudo que passa por aqui:
 *
 *   1. **Devolver só o necessário para pagar.** Nada de id interno, nada de
 *      dado de outro cliente, nada de campo que não apareça na tela. Uma rota
 *      pública que devolve "o objeto inteiro por conveniência" é vazamento
 *      esperando acontecer.
 *   2. **Nunca aceitar caminho de arquivo vindo da URL.** A chave do PDF é
 *      DERIVADA do billing (ver `chaveDoDemonstrativo`).
 *
 * Espelha `portal-cobranca.ts`, que faz o mesmo para o acesso ao portal Brasil
 * Solar; a conversa com o Asaas é compartilhada em `asaas-cobranca-view.ts`.
 */
import { prisma } from "@/lib/prisma";
import { parseInstallments } from "@/lib/billing-installments";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { isOrigemBrasilSolar } from "@/lib/uc-origem";
import { loadDemonstrativoFaturaData } from "@/lib/demonstrativo-fatura";
import {
  situacaoDaCobranca,
  viewBoleto,
  viewPix,
  type BoletoView,
  type PixView,
  type SituacaoCobranca,
} from "@/lib/asaas-cobranca-view";

export interface FaturaContexto {
  billingId: string;
  consumerUnitId: string;
  ano: number;
  mes: number;
  valor: number;
  vencimento: Date | null;
  codigoUc: string;
  clienteNome: string;
  chargeId: string | null;
  cancelada: boolean;
}

/**
 * Resolve o token. `null` quando não existe — e a rota devolve 404 para
 * qualquer motivo, sem distinguir "não existe" de "não pode": diferenciar os
 * dois deixaria alguém enumerar tokens válidos pela mensagem de erro.
 */
export async function resolverFaturaPorToken(
  token: string,
): Promise<FaturaContexto | null> {
  // Um token nosso é UUID (36 chars). O corte barato evita ir ao banco a cada
  // varredura de scanner.
  if (!token || token.length < 16) return null;

  const b = await prisma.consumerUnitBilling.findUnique({
    where: { tokenPublico: token },
    select: {
      id: true,
      ano: true,
      mes: true,
      valorCobranca: true,
      dataVencimento: true,
      status: true,
      asaasChargeId: true,
      installments: true,
      consumerUnitId: true,
      consumerUnit: {
        select: {
          codigoUc: true,
          nome: true,
          origem: true,
          consumer: { select: { name: true } },
        },
      },
    },
  });
  if (!b) return null;

  // Cinto e suspensório: UC do módulo Brasil Solar não é faturada por aqui, e
  // uma página pública não é lugar de descobrir isso pela primeira vez.
  if (isOrigemBrasilSolar(b.consumerUnit.origem)) return null;

  return {
    billingId: b.id,
    consumerUnitId: b.consumerUnitId,
    ano: b.ano,
    mes: b.mes,
    valor: b.valorCobranca ?? 0,
    vencimento: b.dataVencimento,
    codigoUc: b.consumerUnit.codigoUc,
    clienteNome: b.consumerUnit.consumer?.name ?? b.consumerUnit.nome,
    chargeId: chargeIdDaCobranca(b),
    cancelada: b.status === "CANCELADO",
  };
}

/**
 * 🪤 Cobrança PARCELADA não tem `asaasChargeId` — o "principal" é virtual e cada
 * parcela guarda o seu id dentro do JSON `installments`. Sem isto o cliente
 * parcelado abriria a página e veria "indisponível" para sempre. Vale a
 * primeira parcela ainda não paga; se todas foram pagas, a última.
 */
function chargeIdDaCobranca(b: {
  asaasChargeId: string | null;
  installments: string | null;
}): string | null {
  if (b.asaasChargeId) return b.asaasChargeId;
  const parcelas = parseInstallments(b.installments);
  if (!parcelas?.length) return null;
  const emAberto = parcelas.find((p) => !p.pagoEm && p.asaasChargeId);
  return (emAberto ?? parcelas[parcelas.length - 1])?.asaasChargeId ?? null;
}

const MES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * O resumo que a página mostra — os mesmos números do demonstrativo em PDF.
 *
 * 🔑 Vem de `loadDemonstrativoFaturaData` com `semBoletos: true`, e não de um
 * cálculo próprio: economia e custo sem desconto passam por regras que já
 * moram lá (multiplicador de exibição, crédito compensado, acumulados). Um
 * segundo cálculo aqui envelheceria à parte, e um dia o PDF e a página diriam
 * economias diferentes para o mesmo mês — do jeito mais difícil de perceber.
 */
export interface ResumoFatura {
  custoSemDesconto: number;
  /**
   * `custoSemDesconto − economiaMes` dá exatamente o valor cobrado?
   *
   * 🪤 **Quase nunca dá.** Só nas regras com multiplicador de exibição (a
   * DIMARZARI) o "sem desconto" é derivado da própria cobrança, e aí a conta
   * fecha. Nas demais o "sem desconto" é `fatura da RGE + crédito compensado` e
   * a economia vem de outro campo — dois números que descrevem a mesma
   * realidade por caminhos diferentes, sem obrigação de reconciliar.
   *
   * O PDF mostra os três como CARDS separados por causa disso. A página só pode
   * apresentá-los como extrato (com o sinal de menos e um total) quando isto é
   * verdadeiro; caso contrário o cliente faz a conta de cabeça, vê que não bate
   * e perde a confiança no documento inteiro.
   */
  extratoFecha: boolean;
  economiaMes: number;
  economiaAcumulada: number;
  descontoPercentual: number;
  bandeira: string;
  consumoKwh: number;
  creditoRecebidoKwh: number;
  /** 12 meses, do mais antigo ao mais recente. */
  historico: { m: string; consumo: number }[];
}

export interface FaturaView {
  clienteNome: string;
  /** Código da UC já pontuado, como o cliente lê na conta de energia. */
  unidadeConsumidora: string;
  referencia: string;
  valor: number;
  vencimento: string | null;
  situacao: SituacaoCobranca;
  /** Só existe quando há PDF a mostrar. */
  temDemonstrativo: boolean;
  /**
   * Null quando o resumo não pôde ser montado. A página então mostra só valor,
   * vencimento e pagamento — degrada, não quebra: quem abriu o link quer pagar,
   * e um erro de cálculo do resumo não pode impedir isso.
   */
  resumo: ResumoFatura | null;
}

export async function getFaturaView(token: string): Promise<FaturaView | null> {
  const ctx = await resolverFaturaPorToken(token);
  if (!ctx) return null;

  let resumo: ResumoFatura | null = null;
  try {
    const d = await loadDemonstrativoFaturaData(ctx.billingId, { semBoletos: true });
    if (d) {
      const custoSemDesconto = d.resumoDoMes.custoTotalSemDesconto.valor;
      const economiaMes = d.resumoDoMes.economiaMensal.valor;
      resumo = {
        custoSemDesconto,
        // Tolerância de um centavo: arredondamento não pode reprovar uma conta
        // que fecha.
        extratoFecha: Math.abs(custoSemDesconto - economiaMes - ctx.valor) < 0.011,
        economiaMes,
        economiaAcumulada: d.resumoDoMes.economiaTotalAcumulada.valor,
        descontoPercentual: d.fatura.descontoTotalPercentual,
        bandeira: d.fatura.bandeira,
        consumoKwh: d.energia.consumoTotalDeEnergiaKwh,
        creditoRecebidoKwh: d.energia.creditoTotalRecebidoKwh,
        historico: d.historico12Meses,
      };
    }
  } catch (err) {
    console.error("[fatura-publica] resumo indisponível:", err);
  }

  return {
    clienteNome: ctx.clienteNome,
    unidadeConsumidora: formatCodigoUc(ctx.codigoUc),
    referencia: `${MES_EXTENSO[ctx.mes - 1]} de ${ctx.ano}`,
    valor: ctx.valor,
    vencimento: ctx.vencimento ? ctx.vencimento.toISOString().slice(0, 10) : null,
    // Cancelada nunca aparece como "aberto": seria oferecer pagamento de uma
    // cobrança que não existe mais no gateway.
    situacao: ctx.cancelada ? "indisponivel" : await situacaoDaCobranca(ctx.chargeId),
    temDemonstrativo: true,
    resumo,
  };
}

export async function getPixDaFatura(token: string): Promise<PixView | null> {
  const ctx = await resolverFaturaPorToken(token);
  if (!ctx?.chargeId || ctx.cancelada) return null;
  return viewPix(ctx.chargeId);
}

export async function getBoletoDaFatura(token: string): Promise<BoletoView | null> {
  const ctx = await resolverFaturaPorToken(token);
  if (!ctx?.chargeId || ctx.cancelada) return null;
  return viewBoleto(ctx.chargeId);
}

/**
 * Caminho do demonstrativo no storage, DERIVADO do billing.
 *
 * 🔒 Nunca use `billing.demonstrativoUrl` nem nada vindo da URL para montar
 * isto. Numa rota pública, aceitar caminho do cliente é abrir o bucket inteiro.
 * Tem que casar com `gerarESalvarDemonstrativo` (`lib/demonstrativo-pdf.ts`).
 */
export function chaveDoDemonstrativo(ctx: {
  consumerUnitId: string;
  ano: number;
  mes: number;
}): string {
  const mes2 = String(ctx.mes).padStart(2, "0");
  return `demonstrativos/${ctx.consumerUnitId}/${ctx.ano}-${mes2}-demonstrativo.pdf`;
}

/** Nome do arquivo como o cliente o vê ao baixar. */
export function nomeDoDemonstrativo(ctx: { codigoUc: string; ano: number; mes: number }): string {
  return `fatura-${ctx.codigoUc}-${ctx.ano}-${String(ctx.mes).padStart(2, "0")}.pdf`;
}

/**
 * Link público desta fatura. `APP_BASE_URL` já é usado pelo convite de acesso
 * (`brasil-solar-acesso.ts`) — mesma variável, mesmo significado.
 */
export function linkPublicoDaFatura(token: string): string {
  const base = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
  return `${base}/fatura/${token}`;
}
