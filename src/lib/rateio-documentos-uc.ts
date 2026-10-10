/**
 * Quais documentos de UMA UC o pacote da RGE precisa, e quais estão faltando.
 *
 * Fica separado de [[rateio-pacote-rge]] porque é regra pura, sem banco nem
 * storage: a tela do rateio usa a mesma lista para avisar ANTES de alguém
 * chegar no portal da concessionária, e o pacote usa para montar o PDF.
 *
 * Pessoa física: identidade, procuração e termo de adesão.
 * Empresa: os mesmos três + cartão CNPJ e contrato social (decisão do Paulo em
 * 10/10/2026).
 */

export interface DocumentosDaUc {
  cpfCnpj?: string | null;
  docIdentidade?: string | null;
  docProcuracao?: string | null;
  docTermoAdesao?: string | null;
  docCartaoCnpj?: string | null;
  docContratoSocial?: string | null;
}

/**
 * CNPJ no cadastro, ou algum documento de empresa já guardado. O segundo teste
 * cobre a UC cujo `cpfCnpj` ficou vazio ou com o CPF do titular da conta de luz.
 */
export function ucEhEmpresa(u: DocumentosDaUc): boolean {
  return (
    (u.cpfCnpj ?? "").replace(/\D/g, "").length === 14 ||
    Boolean(u.docCartaoCnpj) ||
    Boolean(u.docContratoSocial)
  );
}

/** Rótulos do que falta, na ordem em que entram no pacote. Vazio = completo. */
export function documentosFaltandoDaUc(u: DocumentosDaUc): string[] {
  const falta: string[] = [];
  if (!u.docIdentidade) falta.push("identidade");
  if (ucEhEmpresa(u)) {
    if (!u.docCartaoCnpj) falta.push("cartão CNPJ");
    if (!u.docContratoSocial) falta.push("contrato social");
  }
  if (!u.docProcuracao) falta.push("procuração");
  if (!u.docTermoAdesao) falta.push("termo de adesão");
  return falta;
}
