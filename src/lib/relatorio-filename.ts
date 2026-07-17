/**
 * Limpa um trecho pra usar como token em nome de arquivo de relatório:
 *  - tira acentos (NFD + remove diacríticos)
 *  - troca espaços por "_"
 *  - remove caracteres proibidos em nomes de arquivo (\ / : * ? " < > |)
 *  - uppercase
 *
 * Compartilhado pelas rotas de PDF do admin e do portal do cliente.
 */
export function sanitizeForFilename(s: string): string {
  // ̀-ͯ = combining diacritical marks (acentos após NFD)
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}
