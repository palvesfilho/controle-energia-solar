/**
 * De qual MODELO de documento de projeto cada concessionária usa.
 *
 * O vínculo real é modelo → leitor, não concessionária → leitor: o "Anexo 1 —
 * Solicitação de Acesso" é documento da própria Solve SM, não da Nova Palma. Se
 * amanhã o mesmo modelo for usado numa obra da COPREL, basta apontar aqui.
 *
 * Concessionária sem entrada neste mapa cai na detecção automática — nunca
 * trava o cadastro por falta de mapeamento.
 */
import { normalizeConcessionaria, type Concessionaria } from "./concessionarias";

export type ModeloAnexo = "ANEXO_F" | "ANEXO_1";

export const MODELO_POR_CONCESSIONARIA: Partial<Record<Concessionaria, ModeloAnexo>> = {
  // Formulário padrão ANEEL da CPFL/RGE.
  "RGE/CPFL": "ANEXO_F",
  // Ofício em seções numeradas usado nas obras atendidas pela Nova Palma.
  "NOVA PALMA ENERGIA": "ANEXO_1",
  // As demais ainda não têm modelo conhecido → detecção automática.
};

export const ROTULO_MODELO: Record<ModeloAnexo, string> = {
  ANEXO_F: "Anexo F (CPFL/RGE)",
  ANEXO_1: "Anexo 1 — Solicitação de Acesso",
};

/** Modelo esperado para uma concessionária, ou undefined se não houver mapeamento. */
export function modeloDaConcessionaria(nome: string | null | undefined): ModeloAnexo | undefined {
  // Normaliza antes de olhar o mapa para que cadastro legado ("RGE",
  // "NOVA PALMA") continue achando o modelo certo.
  const achado = normalizeConcessionaria(nome);
  return achado ? MODELO_POR_CONCESSIONARIA[achado] : undefined;
}

/** Aceita só valores conhecidos vindos do cliente (o request é entrada externa). */
export function parseModeloAnexo(raw: string | null | undefined): ModeloAnexo | undefined {
  return raw === "ANEXO_F" || raw === "ANEXO_1" ? raw : undefined;
}
