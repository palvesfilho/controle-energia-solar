/**
 * Tipos de arquivo que se anexam à mão no cadastro do investidor. Lista
 * compartilhada entre a rota (valida) e a tela (rótulo do seletor).
 *
 * Diferente da papelada da adesão (colunas `doc_*` do Investor, copiadas do
 * CRM): aqui cabem vários arquivos, inclusive do mesmo tipo.
 */
export const TIPOS_ARQUIVO_INVESTIDOR = [
  { tipo: "CONTRATO", rotulo: "Contrato" },
  { tipo: "IDENTIDADE", rotulo: "CNH / RG" },
  { tipo: "COMPROVANTE_ENDERECO", rotulo: "Comprovante de endereço" },
  { tipo: "CARTAO_CNPJ", rotulo: "Cartão CNPJ" },
  { tipo: "CONTRATO_SOCIAL", rotulo: "Contrato social" },
  { tipo: "OUTROS", rotulo: "Outro" },
] as const;

export type TipoArquivoInvestidor = (typeof TIPOS_ARQUIVO_INVESTIDOR)[number]["tipo"];

export function ehTipoArquivoInvestidor(v: unknown): v is TipoArquivoInvestidor {
  return TIPOS_ARQUIVO_INVESTIDOR.some((t) => t.tipo === v);
}

export function rotuloTipoArquivoInvestidor(tipo: string): string {
  return TIPOS_ARQUIVO_INVESTIDOR.find((t) => t.tipo === tipo)?.rotulo ?? tipo;
}

export const EXTENSOES_ARQUIVO_INVESTIDOR = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
export const TAMANHO_MAXIMO_ARQUIVO_INVESTIDOR = 20 * 1024 * 1024;

/**
 * Confere pelo CONTEÚDO, não só pela extensão: PDF, JPG, PNG, DOCX (zip) e DOC
 * (OLE). Um .pdf renomeado de .exe não passa.
 */
export function formatoAceito(b: Uint8Array): boolean {
  const comeca = (...bytes: number[]) => bytes.every((x, i) => b[i] === x);
  return (
    comeca(0x25, 0x50, 0x44, 0x46) || // %PDF
    comeca(0xff, 0xd8, 0xff) || // JPG
    comeca(0x89, 0x50, 0x4e, 0x47) || // PNG
    comeca(0x50, 0x4b, 0x03, 0x04) || // DOCX (zip)
    comeca(0xd0, 0xcf, 0x11, 0xe0) // DOC (OLE)
  );
}
