/**
 * As fichas de documento montadas a partir do que JÁ ESTÁ GUARDADO no cadastro.
 *
 * Existe uma segunda montagem, nas telas de cadastro pela fila do CRM
 * (`/unidades-consumidoras/nova`, `/investidores/novo`), que aponta para as
 * rotas de leitura do CRM: lá o arquivo ainda não foi copiado. Esta aqui é a de
 * DEPOIS de salvo — lê as colunas `doc_*` da própria UC/investidor e serve o
 * arquivo do storage do Gestor, que é o que sobrevive a uma faxina no CRM.
 * Ver [[crm-copia-documentos]].
 *
 * Os seis tipos e a ordem são os mesmos das duas telas de propósito: o operador
 * confere a mesma lista antes e depois de cadastrar.
 */

/** Uma linha do painel. Ficha sem `href` aparece tracejada — o que FALTA importa. */
export interface FichaDocumento {
  chave: string;
  rotulo: string;
  /** Nome do arquivo, ou a data de assinatura para termo e procuração. */
  detalhe: string | null;
  /** Link para abrir. Null = ficha vazia. */
  href: string | null;
}

/**
 * As colunas `doc_*` presentes tanto em `ConsumerUnit` quanto em `Investor` —
 * com os mesmos nomes, porque a rotina de cópia serve os dois cadastros.
 */
export interface DocumentosDoCadastro {
  docTermoAdesao?: string | null;
  docTermoAdesaoNome?: string | null;
  docProcuracao?: string | null;
  docProcuracaoNome?: string | null;
  docIdentidade?: string | null;
  docIdentidadeNome?: string | null;
  docCartaoCnpj?: string | null;
  docCartaoCnpjNome?: string | null;
  docContratoSocial?: string | null;
  docContratoSocialNome?: string | null;
  docOutros?: string | null;
  docOutrosNome?: string | null;
  docsAdesaoIdCrm?: number | null;
  docsCopiadosEm?: string | null;
}

/**
 * O banco guarda o caminho relativo ("uploads/crm-adesoes/58/x.pdf"); quem serve
 * o arquivo é `/api/files/[...path]`, que já é autenticada e vale para disco e
 * R2. O prefixo "uploads/" sai porque a rota o reinsere ao ler.
 */
export function hrefDoArquivo(relativePath: string): string {
  const key = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^uploads\//, "");
  return `/api/files/${key}`;
}

const TIPOS: {
  chave: string;
  rotulo: string;
  path: keyof DocumentosDoCadastro;
  nome: keyof DocumentosDoCadastro;
}[] = [
  { chave: "termo", rotulo: "Termo de Adesão", path: "docTermoAdesao", nome: "docTermoAdesaoNome" },
  { chave: "procuracao", rotulo: "Procuração", path: "docProcuracao", nome: "docProcuracaoNome" },
  { chave: "identidade", rotulo: "Identidade", path: "docIdentidade", nome: "docIdentidadeNome" },
  { chave: "cartao_cnpj", rotulo: "Cartão CNPJ", path: "docCartaoCnpj", nome: "docCartaoCnpjNome" },
  { chave: "contrato_social", rotulo: "Contrato social", path: "docContratoSocial", nome: "docContratoSocialNome" },
  { chave: "outros", rotulo: "Outro documento", path: "docOutros", nome: "docOutrosNome" },
];

/** As seis fichas, sempre as seis — a vazia mostra o que falta. */
export function fichasDosDocumentosSalvos(reg: DocumentosDoCadastro | null): FichaDocumento[] {
  return TIPOS.map(({ chave, rotulo, path, nome }) => {
    const caminho = reg?.[path];
    const nomeArquivo = reg?.[nome];
    return {
      chave,
      rotulo,
      detalhe: typeof nomeArquivo === "string" && nomeArquivo ? nomeArquivo : null,
      href: typeof caminho === "string" && caminho ? hrefDoArquivo(caminho) : null,
    };
  });
}

/** Se algum dos seis veio. Usado para decidir o texto do rodapé, não para esconder o painel. */
export function temDocumentoSalvo(reg: DocumentosDoCadastro | null): boolean {
  return TIPOS.some(({ path }) => typeof reg?.[path] === "string" && reg[path]);
}
