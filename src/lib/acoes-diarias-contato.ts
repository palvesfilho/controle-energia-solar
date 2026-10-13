/**
 * Canais e resultados do contato do pós-venda (`BrasilSolarContato`).
 *
 * Arquivo PURO de propósito: a janela de registro é componente cliente, e se
 * estas listas morassem em `acoes-diarias.ts` o import arrastaria o Prisma
 * para o bundle do navegador.
 */

export const CANAIS_CONTATO = ["LIGACAO", "WHATSAPP", "EMAIL", "VISITA"] as const;
export type CanalContato = (typeof CANAIS_CONTATO)[number];
export const CANAL_CONTATO_LABEL: Record<CanalContato, string> = {
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  VISITA: "Visita",
};

export const RESULTADOS_CONTATO = [
  "RESOLVIDO",
  "AGUARDANDO_CLIENTE",
  "SEM_RESPOSTA",
  "ENCAMINHADO_CAMPO",
  "INFORMATIVO",
] as const;
export type ResultadoContato = (typeof RESULTADOS_CONTATO)[number];
export const RESULTADO_CONTATO_LABEL: Record<ResultadoContato, string> = {
  RESOLVIDO: "Cliente orientado, deve normalizar",
  AGUARDANDO_CLIENTE: "Aguardando o cliente",
  SEM_RESPOSTA: "Sem resposta",
  ENCAMINHADO_CAMPO: "Encaminhado para visita técnica",
  INFORMATIVO: "Só acompanhamento",
};
