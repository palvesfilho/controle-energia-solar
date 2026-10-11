/**
 * Prazo para cadastrar o acesso à concessionária de uma UC.
 *
 * Nasceu em 11/10/2026: 22 UCs estavam com o login de um gestor DESTE sistema
 * gravado como acesso da RGE (preenchimento automático do navegador). O dado
 * errado foi apagado e a UC ficou marcada — `ConsumerUnit.acessoPrazoEm` — para
 * receber o acesso certo em até 7 dias.
 *
 * A pendência não tem "concluir": ela some sozinha quando a UC ganha a
 * credencial no card "Status e acesso à concessionária" (`CpflCredential`).
 *
 * Sem prisma aqui — a tela importa.
 */

export const DIAS_PRAZO_ACESSO = 7;

export interface AcessoPendente {
  /** Dia-limite, "YYYY-MM-DD". */
  prazo: string;
  vencido: boolean;
  /** Dias até o prazo; negativo = dias de atraso. */
  diasRestantes: number;
}

/** O prazo é gravado ao meio-dia UTC: o dia é o mesmo em UTC e em Brasília. */
function dia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Hoje em Brasília, como "YYYY-MM-DD". */
function hojeBrasil(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function acessoPendente(
  prazoEm: Date | string | null | undefined,
  temCredencial: boolean,
  agora: Date = new Date(),
): AcessoPendente | null {
  if (!prazoEm || temCredencial) return null;
  const d = new Date(prazoEm);
  if (Number.isNaN(d.getTime())) return null;
  const prazo = dia(d);
  const hoje = hojeBrasil(agora);
  const diasRestantes = Math.round((Date.parse(`${prazo}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
  return { prazo, vencido: diasRestantes < 0, diasRestantes };
}

/** "2026-10-18" → "18/10/2026". */
export function prazoBR(prazo: string): string {
  const [a, m, d] = prazo.split("-");
  return `${d}/${m}/${a}`;
}

/** Texto curto do selo: "Acesso até 18/10" ou "Acesso atrasado 3 dias". */
export function rotuloAcessoPendente(p: AcessoPendente): string {
  if (p.vencido) return `Acesso atrasado ${-p.diasRestantes} ${p.diasRestantes === -1 ? "dia" : "dias"}`;
  return `Acesso até ${prazoBR(p.prazo).slice(0, 5)}`;
}
