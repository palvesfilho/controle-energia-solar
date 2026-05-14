// Convenção para guardar metadados na coluna `observacoes` da tabela `obras`
// sem precisar alterar o schema. A primeira linha pode conter um tag
// `#OBRA_META:<json>` que o código sabe ler/escrever.

export interface ObraMeta {
  proprietarioId?: string | null;
  potenciaKwp?: number | null; // potência instalada (kWp)
  inversorPotenciaKw?: number | null; // potência do inversor (kW) — usada para a lista de materiais
}

const TAG = "#OBRA_META:";

export function parseObraMeta(
  observacoes: string | null | undefined
): { meta: ObraMeta; rest: string } {
  if (!observacoes) return { meta: {}, rest: "" };
  const firstLineBreak = observacoes.indexOf("\n");
  const firstLine =
    firstLineBreak === -1 ? observacoes : observacoes.slice(0, firstLineBreak);
  if (!firstLine.startsWith(TAG)) {
    return { meta: {}, rest: observacoes };
  }
  const jsonPart = firstLine.slice(TAG.length).trim();
  const rest = firstLineBreak === -1 ? "" : observacoes.slice(firstLineBreak + 1);
  try {
    const meta = JSON.parse(jsonPart) as ObraMeta;
    return { meta, rest };
  } catch {
    return { meta: {}, rest: observacoes };
  }
}

export function serializeObraObservacoes(
  meta: ObraMeta,
  rest: string | null | undefined
): string {
  const clean: ObraMeta = {};
  if (meta.proprietarioId) clean.proprietarioId = meta.proprietarioId;
  if (meta.potenciaKwp != null) clean.potenciaKwp = meta.potenciaKwp;
  if (meta.inversorPotenciaKw != null)
    clean.inversorPotenciaKw = meta.inversorPotenciaKw;

  const hasMeta = Object.keys(clean).length > 0;
  const body = (rest ?? "").trim();
  if (!hasMeta) return body;
  const tagLine = `${TAG}${JSON.stringify(clean)}`;
  return body ? `${tagLine}\n${body}` : tagLine;
}
