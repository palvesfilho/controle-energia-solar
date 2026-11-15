/**
 * DUPLA CONFERÊNCIA da fatura da distribuidora — Infosimples × PDF.
 *
 * 🔑 **Por que existe.** Os números da fatura que vem pela Infosimples saem do
 * OCR DELES. Quando o OCR perde um pedaço (caso TAMARA VOLCATO 10/26: a linha
 * "Ajuste Saldo −26,69" estava só na página 2 do PDF e não veio no texto), o
 * campo fica vazio, calado, e a cobrança do cliente sai errada. O PDF original
 * é baixado em TODA sincronização — então lemos o PDF com o nosso leitor
 * (`parseFaturaPdf`, o mesmo do upload manual) e comparamos campo a campo.
 *
 * Regra do Paulo (14/11/2026): divergência TRAVA a cobrança e aparece na tela
 * de faturamento de clientes; o operador escolhe o valor certo e libera.
 *
 * Só entram os campos que mexem no valor cobrado (ver `BillInput` em
 * billing-calculator.ts) + vencimento e consumo, que vão no demonstrativo.
 * Juros, multa, atualização monetária e CIP ficaram DE FORA de propósito: não
 * entram no cálculo e a Infosimples quase nunca os traz (na 1ª rodada, 14/11,
 * eram 70% das "divergências" — ruído que esconderia as reais). O total da
 * fatura, que é conferido, já os contém.
 *
 * Status gravado em `ConsumerBill.conferenciaStatus`:
 *   - CONFERIDA   — as duas leituras batem.
 *   - DIVERGENTE  — ao menos um campo difere → TRAVA a cobrança.
 *   - ERRO_PDF    — não deu para ler o PDF (sem arquivo / leitor falhou) → TRAVA.
 *   - CORRIGIDA   — operador mandou usar os valores do PDF (libera).
 *   - LIBERADA    — operador conferiu e manteve a Infosimples (libera).
 *   - null        — fatura nunca conferida (legado / upload manual, que JÁ é
 *                   lido pelo nosso leitor) → não trava.
 */
import { prisma } from "@/lib/prisma";
import { readFromStorage } from "@/lib/file-storage";
import { parseFaturaPdf } from "@/lib/fatura-pdf-parser";

export const STATUS_TRAVA_CONFERENCIA = ["DIVERGENTE", "ERRO_PDF"] as const;

/** Código de recusa devolvido em `skipped`, no mesmo formato de `no_value`. */
export const SKIP_FATURA_DIVERGENTE = "fatura_divergente";

/** Texto único da recusa — API, toast e tooltip dizem a mesma frase. */
export const MENSAGEM_FATURA_DIVERGENTE =
  "A fatura da distribuidora tem divergência entre a leitura da Infosimples e o PDF. " +
  "Confira os valores na tela de faturamento e escolha o correto antes de cobrar.";

type Tipo = "brl" | "kwh" | "data";

interface CampoConferido {
  campo: string;
  rotulo: string;
  tipo: Tipo;
  /** Compara em módulo: a fatura imprime créditos com "-" e cada leitor grava o sinal de um jeito. */
  modulo?: boolean;
}

/**
 * Campos comparados. A ordem é a da tela.
 * Tolerância: R$ 0,01 · 1 kWh · mesmo dia.
 */
export const CAMPOS_CONFERIDOS: CampoConferido[] = [
  { campo: "valorTotal", rotulo: "Total da fatura", tipo: "brl" },
  { campo: "vencimento", rotulo: "Vencimento", tipo: "data" },
  { campo: "consumoKwh", rotulo: "Consumo", tipo: "kwh" },
  { campo: "injetadaOucTeKwh", rotulo: "Energia injetada TE (kWh)", tipo: "kwh", modulo: true },
  { campo: "injetadaOucTusdKwh", rotulo: "Energia injetada TUSD (kWh)", tipo: "kwh", modulo: true },
  { campo: "injetadaOucTeValor", rotulo: "Energia injetada TE (R$)", tipo: "brl", modulo: true },
  { campo: "injetadaOucTusdValor", rotulo: "Energia injetada TUSD (R$)", tipo: "brl", modulo: true },
  { campo: "energiaInjetadaPropriaTeValor", rotulo: "Geração própria TE (R$)", tipo: "brl", modulo: true },
  { campo: "energiaInjetadaPropriaTusdValor", rotulo: "Geração própria TUSD (R$)", tipo: "brl", modulo: true },
  { campo: "ajusteSaldoCredito", rotulo: "Ajuste de saldo", tipo: "brl", modulo: true },
  { campo: "bandeiraAmarelaCreditoValor", rotulo: "Crédito bandeira amarela", tipo: "brl", modulo: true },
  { campo: "bandeiraVermelhaCreditoValor", rotulo: "Crédito bandeira vermelha 1", tipo: "brl", modulo: true },
  { campo: "bandeiraVermelha2CreditoValor", rotulo: "Crédito bandeira vermelha 2", tipo: "brl", modulo: true },
  { campo: "devolPagamentoIndevido", rotulo: "Devolução de pagamento indevido", tipo: "brl", modulo: true },
];

export interface Divergencia {
  campo: string;
  rotulo: string;
  tipo: Tipo;
  infosimples: number | string | null;
  pdf: number | string | null;
}

export interface ResultadoConferencia {
  status: "CONFERIDA" | "DIVERGENTE" | "ERRO_PDF";
  divergencias: Divergencia[];
  erro?: string;
  /** Valores lidos do PDF para os campos conferidos (usado no "usar PDF"). */
  valoresPdf?: Record<string, number | string | null>;
}

const SELECT_CAMPOS = Object.fromEntries(
  CAMPOS_CONFERIDOS.map((c) => [c.campo, true]),
) as Record<string, true>;

function normaliza(v: unknown, c: CampoConferido): number | string | null {
  if (v == null) return null;
  if (c.tipo === "data") {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return c.modulo ? Math.abs(n) : n;
}

function iguais(a: number | string | null, b: number | string | null, c: CampoConferido): boolean {
  if (c.tipo === "data") return a === b;
  // Vazio e zero são a mesma coisa: "não há essa linha na fatura".
  const x = (a as number | null) ?? 0;
  const y = (b as number | null) ?? 0;
  const tol = c.tipo === "kwh" ? 1 : 0.011;
  return Math.abs(x - y) < tol;
}

/** Compara os valores gravados (Infosimples) com os lidos do PDF. Função pura. */
export function compararLeituras(
  gravado: Record<string, unknown>,
  pdf: Record<string, unknown>,
): { divergencias: Divergencia[]; valoresPdf: Record<string, number | string | null> } {
  const divergencias: Divergencia[] = [];
  const valoresPdf: Record<string, number | string | null> = {};
  for (const c of CAMPOS_CONFERIDOS) {
    const a = normaliza(gravado[c.campo], c);
    const b = normaliza(pdf[c.campo], c);
    valoresPdf[c.campo] = pdf[c.campo] instanceof Date
      ? (pdf[c.campo] as Date).toISOString()
      : ((pdf[c.campo] as number | null | undefined) ?? null);
    if (!iguais(a, b, c)) {
      divergencias.push({ campo: c.campo, rotulo: c.rotulo, tipo: c.tipo, infosimples: a, pdf: b });
    }
  }
  return { divergencias, valoresPdf };
}

/** Lê o PDF guardado da fatura e compara com o que está gravado. NÃO grava nada. */
export async function conferirFatura(billId: string): Promise<ResultadoConferencia> {
  const bill = await prisma.consumerBill.findUnique({
    where: { id: billId },
    select: { pdfUrl: true, ...SELECT_CAMPOS },
  });
  if (!bill) return { status: "ERRO_PDF", divergencias: [], erro: "fatura não encontrada" };
  if (!bill.pdfUrl) return { status: "ERRO_PDF", divergencias: [], erro: "fatura sem PDF guardado" };
  const arq = await readFromStorage(bill.pdfUrl);
  if (!arq) return { status: "ERRO_PDF", divergencias: [], erro: "PDF não encontrado no armazenamento" };
  let lido: Record<string, unknown>;
  try {
    lido = (await parseFaturaPdf(new Uint8Array(arq.data))).bill as unknown as Record<string, unknown>;
  } catch (e) {
    return { status: "ERRO_PDF", divergencias: [], erro: `não foi possível ler o PDF: ${(e as Error).message}` };
  }
  const { divergencias, valoresPdf } = compararLeituras(bill as unknown as Record<string, unknown>, lido);
  return { status: divergencias.length ? "DIVERGENTE" : "CONFERIDA", divergencias, valoresPdf };
}

/**
 * Confere e GRAVA o resultado na fatura. Chamado pelas rotas de sincronização
 * da Infosimples logo depois do upsert e ANTES de calcular a cobrança.
 *
 * Se o operador já tinha LIBERADO exatamente estas mesmas divergências, a
 * liberação vale: re-sincronizar a mesma fatura não pode retravar o que já foi
 * conferido por uma pessoa.
 */
export async function conferirEGravar(billId: string): Promise<ResultadoConferencia> {
  const r = await conferirFatura(billId);
  const atual = await prisma.consumerBill.findUnique({
    where: { id: billId },
    select: { conferenciaStatus: true, conferenciaDivergencias: true },
  });
  const json = JSON.stringify({ divergencias: r.divergencias, erro: r.erro ?? null, valoresPdf: r.valoresPdf ?? null });
  const mesmasDivergencias =
    atual?.conferenciaDivergencias != null &&
    JSON.stringify(JSON.parse(atual.conferenciaDivergencias).divergencias ?? []) ===
      JSON.stringify(r.divergencias);
  if (atual?.conferenciaStatus === "LIBERADA" && r.status !== "CONFERIDA" && mesmasDivergencias) {
    return r;
  }
  await prisma.consumerBill.update({
    where: { id: billId },
    data: {
      conferenciaStatus: r.status,
      conferenciaDivergencias: r.status === "CONFERIDA" ? null : json,
      conferenciaEm: new Date(),
      conferenciaLiberadaPor: null,
      conferenciaLiberadaEm: null,
    },
  });
  return r;
}

/** A fatura do mês desta UC está travada pela conferência? */
export async function faturaTravadaPorConferencia(
  consumerUnitId: string,
  ano: number,
  mes: number,
): Promise<boolean> {
  const n = await prisma.consumerBill.count({
    where: {
      consumerUnitId,
      anoReferencia: ano,
      mesReferencia: mes,
      conferenciaStatus: { in: [...STATUS_TRAVA_CONFERENCIA] },
    },
  });
  return n > 0;
}

/**
 * Trava a partir do id do `ConsumerUnitBilling` — a forma como as rotas de
 * faturamento conhecem a cobrança. Aplicada nos MESMOS pontos da trava de
 * compensação (billing-asaas, emit-cobranca, validar-demonstrativo, [id]/asaas);
 * a guarda `scripts/verifica-trava-faturamento.ts` quebra o build se um deles
 * perder a chamada.
 */
export async function cobrancaTravadaPorConferencia(billingId: string): Promise<boolean> {
  const b = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    select: { consumerUnitId: true, ano: true, mes: true },
  });
  if (!b) return false;
  return faturaTravadaPorConferencia(b.consumerUnitId, b.ano, b.mes);
}
