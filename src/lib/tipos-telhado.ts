/**
 * Tipos de estrutura de instalação — fonte única.
 *
 * A lista vivia duplicada (o `select` da tela e o `Set` de validação da API),
 * o que convida à divergência. Quem precisar da lista importa daqui.
 *
 * Códigos renomeados em 2026-08-02 para casarem com o rótulo:
 *   CERAMICO      → CERAMICO_CONCRETO
 *   CARPORT       → ESTRUTURA_ESTACIONAMENTO
 *   USINA_DE_SOLO → ESTRUTURA_SOLO
 *   MISTO         → PERSONALIZADA_MISTA
 * FIBROCIMENTO, LAJE, CALHETAO_METALICO e CALHETAO_FIBROCIMENTO ficaram como
 * estavam. TELHADO_METALICO é novo.
 */

export interface TipoTelhado {
  value: string;
  label: string;
  /** Exige montagem de estrutura antes da instalação (2 tarefas no cronograma). */
  comEstrutura?: boolean;
  /** Abre campo de texto livre pra descrever a combinação. */
  exigeDescricao?: boolean;
}

/** Ordem definida pelo Paulo — é a ordem que aparece no select. */
export const TIPOS_TELHADO: TipoTelhado[] = [
  { value: "TELHADO_METALICO", label: "Telhado Metálico" },
  { value: "CERAMICO_CONCRETO", label: "Telhado Cerâmico/Concreto" },
  { value: "FIBROCIMENTO", label: "Telhado Fibrocimento" },
  { value: "CALHETAO_METALICO", label: "Calhetão Metálico" },
  { value: "CALHETAO_FIBROCIMENTO", label: "Calhetão Fibrocimento" },
  { value: "LAJE", label: "Laje" },
  { value: "ESTRUTURA_SOLO", label: "Estrutura de Solo", comEstrutura: true },
  { value: "ESTRUTURA_ESTACIONAMENTO", label: "Estrutura de Estacionamento", comEstrutura: true },
  { value: "PERSONALIZADA_MISTA", label: "Personalizada - Estrutura Mista", exigeDescricao: true },
];

export const TIPOS_TELHADO_VALIDOS = new Set(TIPOS_TELHADO.map((t) => t.value));

/** Estruturas que geram 2 tarefas encadeadas (montagem + instalação). */
export const TIPOS_COM_ESTRUTURA = new Set(
  TIPOS_TELHADO.filter((t) => t.comEstrutura).map((t) => t.value),
);

/** Tipos que exigem descrição livre (hoje só a Personalizada). */
export const TIPOS_COM_DESCRICAO = new Set(
  TIPOS_TELHADO.filter((t) => t.exigeDescricao).map((t) => t.value),
);

/** 3 dias de estrutura + 15 de intervalo + 1 mínimo de instalação. */
export const PRAZO_MIN_COM_ESTRUTURA = 19;

export function rotuloTipoTelhado(value: string | null | undefined): string {
  if (!value) return "—";
  return TIPOS_TELHADO.find((t) => t.value === value)?.label ?? value;
}
