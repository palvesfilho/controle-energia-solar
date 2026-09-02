/**
 * TRAVA DE FATURAMENTO — UC que nunca compensou não pode ser cobrada.
 *
 * 🔑 **Por que existe.** A UC entra no contrato de desconto meses antes de o
 * desconto aparecer na conta: a distribuidora ainda precisa registrar o rateio
 * e fechar um ciclo de leitura com energia compensada. Até 02/09/2026 a
 * separação "Em implantação × Faturando" (ver `uc-implantacao.ts`) era só
 * VISUAL — marcava a UC na lista e tocava o sino, mas nada impedia alguém de
 * validar o demonstrativo e emitir boleto real no Asaas para uma UC que ainda
 * não recebeu um centavo de abatimento. Cobrar aí é cobrar por um serviço que
 * não começou.
 *
 * Aqui a régua vira BLOQUEIO. E é a MESMA régua da tela — `FATURA_COMPENSADA`,
 * importada de `uc-implantacao.ts`, não uma cópia. Duas definições de
 * "compensou" fariam a lista dizer "Faturando" e a emissão recusar (ou pior, o
 * contrário), e ninguém entenderia por quê.
 *
 * ⚠️ **O corte é "NUNCA compensou", não "não compensou neste mês".** Uma UC que
 * já faturando teve um mês de injeção zero continua faturável — o contrato já
 * está de pé, e o valor daquele mês o `billing-calculator` resolve sozinho
 * (cai no `no_value` quando não há o que cobrar). O que a trava mata é a UC que
 * ainda não teve a PRIMEIRA compensação.
 *
 * Onde é aplicada (todos os caminhos que levam a dinheiro):
 *   - `billing-asaas.ts` → `emitBillingToAsaas` — ponto único por onde passam a
 *     emissão avulsa, o lote e o pipeline do demonstrativo.
 *   - `emit-cobranca.ts` — pré-condição, para o operador ler o motivo antes de
 *     qualquer chamada ao Asaas.
 *   - `validar-demonstrativo/route.ts` — recusa validar, um passo antes.
 *   - `GET /api/billing/consumer-units` — devolve `emImplantacao` para a tela
 *     desabilitar o botão em vez de deixar clicar e falhar.
 *
 * A guarda `scripts/verifica-trava-faturamento.ts` roda no build e quebra se
 * algum desses pontos perder a trava.
 */
import { prisma } from "@/lib/prisma";
import { FATURA_COMPENSADA } from "@/lib/uc-implantacao";

/** Código de recusa devolvido em `skipped`, no mesmo formato de `no_value`. */
export const SKIP_SEM_COMPENSACAO = "sem_compensacao";

/** Texto único da recusa — API, toast e tooltip dizem a mesma frase. */
export const MENSAGEM_SEM_COMPENSACAO =
  "UC ainda em implantação: nenhuma fatura da distribuidora apresentou compensação. " +
  "Não é possível faturar antes da primeira compensação aparecer na conta de energia.";

/** A UC já teve ao menos UMA fatura com compensação? */
export async function ucJaCompensou(consumerUnitId: string): Promise<boolean> {
  const n = await prisma.consumerBill.count({
    where: { consumerUnitId, ...FATURA_COMPENSADA },
  });
  return n > 0;
}

/**
 * Versão em lote — uma consulta para N UCs.
 *
 * A tela do mês carrega ~110 UCs; perguntar uma a uma seriam 110 idas ao banco
 * só para pintar a coluna de ações.
 */
export async function ucsQueJaCompensaram(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.consumerBill.findMany({
    where: { consumerUnitId: { in: ids }, ...FATURA_COMPENSADA },
    select: { consumerUnitId: true },
    distinct: ["consumerUnitId"],
  });
  return new Set(
    rows.map((r) => r.consumerUnitId).filter((id): id is string => !!id),
  );
}

export interface ResultadoTrava {
  liberado: boolean;
  /** Preenchido só quando `liberado` é false. */
  motivo?: string;
  consumerUnitId?: string;
}

/**
 * Trava a partir do id do `ConsumerUnitBilling` — a forma como as rotas de
 * faturamento conhecem a cobrança.
 */
export async function travaFaturamentoPorBilling(
  billingId: string,
): Promise<ResultadoTrava> {
  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    select: { consumerUnitId: true },
  });
  if (!billing) return { liberado: false, motivo: "Cobrança não encontrada" };
  if (await ucJaCompensou(billing.consumerUnitId)) {
    return { liberado: true, consumerUnitId: billing.consumerUnitId };
  }
  return {
    liberado: false,
    motivo: MENSAGEM_SEM_COMPENSACAO,
    consumerUnitId: billing.consumerUnitId,
  };
}
