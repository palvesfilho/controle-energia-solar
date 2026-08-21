/**
 * Fase da UC de desconto: **em implantação** × **faturando**.
 *
 * 🔑 **Por que existe.** A UC entra no contrato de desconto muito antes de o
 * desconto aparecer na conta: a distribuidora precisa registrar o rateio e
 * fechar um ciclo de leitura com energia compensada. Na base de 21/08/2026 esse
 * intervalo foi de 0 a 8 faturas — metade das UCs esperou 3 ciclos ou mais.
 * Enquanto isso a UC fica no meio das que já faturam, indistinguível, e o
 * operador não tem como saber quando começar a cobrar sem abrir uma por uma.
 *
 * 🎛 **Estado derivado, não um terceiro status.** A UC já carrega dois campos de
 * situação que se contradizem (`active` × `statusContrato` — as 110 UCs de
 * desconto estão todas "Ativo"). Um terceiro campo manual seria mais um pra
 * alguém esquecer de virar. Aqui a régua é o próprio dado: **a UC está em
 * implantação enquanto não existir NENHUMA fatura dela com compensação > 0.**
 * Na primeira que tiver, ela é faturando — sem ninguém clicar em nada.
 *
 * O que se GRAVA é só a decisão humana: `cobrancaLiberadaEm` marca o "ok, pode
 * cobrar". É ele que apaga o aviso — sem esse estado o sino mostraria as mesmas
 * UCs pra sempre e o time aprenderia a ignorá-lo (mesma lição do sino de leads).
 */
import type { Prisma } from "@prisma/client";

/** Fatura com compensação — a régua de "o desconto começou". */
export const FATURA_COMPENSADA: Prisma.ConsumerBillWhereInput = {
  OR: [
    { energiaCompensada: { gt: 0 } },
    { injetadaOucTeKwh: { gt: 0 } },
    { injetadaOucTusdKwh: { gt: 0 } },
  ],
};

/**
 * Espelho em memória de `FATURA_COMPENSADA`. Os dois precisam concordar: um
 * lendo mais campos que o outro faz a lista e o contador do sino divergirem.
 *
 * São três campos e não um porque o parser preenche onde a fatura escreve:
 * `energiaCompensada` no formato antigo, `injetadaOuc*` no detalhamento por
 * posto (Grupo A injeta em ponta e fora ponta separados). Exigir só o primeiro
 * deixaria UC compensando de fora da conta, calada.
 */
export function faturaTemCompensacao(bill: {
  energiaCompensada?: number | null;
  injetadaOucTeKwh?: number | null;
  injetadaOucTusdKwh?: number | null;
}): boolean {
  return (
    (bill.energiaCompensada ?? 0) > 0 ||
    (bill.injetadaOucTeKwh ?? 0) > 0 ||
    (bill.injetadaOucTusdKwh ?? 0) > 0
  );
}

export type FaseUc = "IMPLANTACAO" | "FATURANDO";

/**
 * Quantos ciclos a UC pode esperar antes de virar alarme.
 *
 * Medido na base real: 0–2 ciclos é o caminho normal (42 das 84 que já
 * compensam entraram nessa faixa); a partir de 3 a espera já é atípica; 6+ são
 * os casos que ficaram parados (há UC com 10 faturas e zero compensação).
 */
export const CICLOS_ATENCAO = 3;
export const CICLOS_ATRASO = 6;

export type AlertaImplantacao = "OK" | "ATENCAO" | "ATRASADA";

export interface FaseImplantacao {
  fase: FaseUc;
  /** Mês da primeira fatura com compensação. null enquanto em implantação. */
  primeiraCompensacao: { ano: number; mes: number } | null;
  /** Faturas já lidas SEM compensação (antes da primeira, ou todas se ainda nenhuma). */
  faturasSemCompensacao: number;
  /** Mês da última fatura lida — mostra até onde a leitura chegou. */
  ultimaFatura: { ano: number; mes: number } | null;
  /** Desde quando espera: início de contrato quando houver, senão o cadastro. */
  esperandoDesde: string | null;
  /** Ciclos de espera — ver `calcularCiclosEsperando`. */
  ciclosEsperando: number;
  alerta: AlertaImplantacao;
  cobrancaLiberadaEm: string | null;
  /**
   * Compensou e ninguém liberou a cobrança ainda — é isto que o sino conta e
   * o que o selo "NOVA" marca na lista.
   */
  aguardandoLiberacao: boolean;
}

/**
 * Ciclos de espera = o MAIOR entre faturas lidas sem compensação e meses
 * corridos desde o início.
 *
 * Os dois são necessários. Só faturas deixaria escapar as 21 UCs que ainda não
 * tiveram nenhuma fatura importada — ficariam eternamente em "0 ciclos", que é
 * exatamente o caso onde ninguém olha e o cliente espera meses. Só tempo
 * puniria a UC recém-cadastrada cuja fatura simplesmente ainda não venceu.
 */
export function calcularCiclosEsperando(
  faturasSemCompensacao: number,
  esperandoDesde: Date | null,
  agora: Date,
): number {
  const porTempo = esperandoDesde
    ? Math.max(
        0,
        (agora.getFullYear() - esperandoDesde.getFullYear()) * 12 +
          (agora.getMonth() - esperandoDesde.getMonth()),
      )
    : 0;
  return Math.max(faturasSemCompensacao, porTempo);
}

function classificarAlerta(ciclos: number): AlertaImplantacao {
  if (ciclos >= CICLOS_ATRASO) return "ATRASADA";
  if (ciclos >= CICLOS_ATENCAO) return "ATENCAO";
  return "OK";
}

/** Ordena faturas por competência (ano, mês) crescente. */
function porCompetencia(
  a: { anoReferencia: number; mesReferencia: number },
  b: { anoReferencia: number; mesReferencia: number },
): number {
  return a.anoReferencia - b.anoReferencia || a.mesReferencia - b.mesReferencia;
}

export interface UcParaFase {
  id: string;
  createdAt: Date;
  dataInicioContrato: Date | null;
  cobrancaLiberadaEm: Date | null;
}

export interface BillParaFase {
  consumerUnitId: string | null;
  anoReferencia: number;
  mesReferencia: number;
  energiaCompensada: number | null;
  injetadaOucTeKwh: number | null;
  injetadaOucTusdKwh: number | null;
}

/** Campos que `calcularFases` precisa ler de `ConsumerBill`. */
export const SELECT_BILL_FASE = {
  consumerUnitId: true,
  anoReferencia: true,
  mesReferencia: true,
  energiaCompensada: true,
  injetadaOucTeKwh: true,
  injetadaOucTusdKwh: true,
} as const;

/**
 * Calcula a fase de cada UC a partir das faturas dela.
 *
 * Recebe as faturas já carregadas em vez de consultar por UC: são ~1.600 linhas
 * na base inteira, uma consulta só resolve as 110 UCs. Uma query por UC seria
 * 110 idas ao banco pra montar uma tela.
 */
export function calcularFases(
  ucs: UcParaFase[],
  bills: BillParaFase[],
  agora: Date = new Date(),
): Map<string, FaseImplantacao> {
  const porUc = new Map<string, BillParaFase[]>();
  for (const b of bills) {
    if (!b.consumerUnitId) continue;
    const lista = porUc.get(b.consumerUnitId);
    if (lista) lista.push(b);
    else porUc.set(b.consumerUnitId, [b]);
  }

  const out = new Map<string, FaseImplantacao>();
  for (const uc of ucs) {
    const faturas = (porUc.get(uc.id) ?? []).sort(porCompetencia);
    const idx = faturas.findIndex(faturaTemCompensacao);
    const primeira = idx >= 0 ? faturas[idx] : null;
    const ultima = faturas.at(-1) ?? null;

    // Antes da primeira compensação: quantas contas o cliente já recebeu sem
    // desconto. Sem nenhuma compensação ainda, são todas as que entraram.
    const faturasSemCompensacao = idx >= 0 ? idx : faturas.length;

    const esperandoDesde = uc.dataInicioContrato ?? uc.createdAt ?? null;
    const ciclos = primeira
      ? faturasSemCompensacao
      : calcularCiclosEsperando(faturasSemCompensacao, esperandoDesde, agora);

    out.set(uc.id, {
      fase: primeira ? "FATURANDO" : "IMPLANTACAO",
      primeiraCompensacao: primeira
        ? { ano: primeira.anoReferencia, mes: primeira.mesReferencia }
        : null,
      faturasSemCompensacao,
      ultimaFatura: ultima ? { ano: ultima.anoReferencia, mes: ultima.mesReferencia } : null,
      esperandoDesde: esperandoDesde ? esperandoDesde.toISOString() : null,
      ciclosEsperando: ciclos,
      // UC que já compensa não tem alerta de espera: o atraso dela acabou.
      alerta: primeira ? "OK" : classificarAlerta(ciclos),
      cobrancaLiberadaEm: uc.cobrancaLiberadaEm ? uc.cobrancaLiberadaEm.toISOString() : null,
      aguardandoLiberacao: !!primeira && !uc.cobrancaLiberadaEm,
    });
  }
  return out;
}

/** Rótulo do mês de competência, no formato que as telas usam. */
export function formatCompetencia(c: { ano: number; mes: number } | null): string {
  if (!c) return "-";
  return `${String(c.mes).padStart(2, "0")}/${c.ano}`;
}
