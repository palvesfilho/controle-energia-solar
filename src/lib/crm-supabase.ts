/**
 * Leitor do CRM comercial (GERADOR_PROPOSTA), que vive num Supabase separado.
 *
 * SOMENTE LEITURA — este módulo nunca escreve no CRM. A venda continua sendo
 * fechada lá; aqui a gente só puxa o que precisa virar obra, UC ou usina.
 *
 * Usa a REST do PostgREST via `fetch` de propósito, em vez de
 * @supabase/supabase-js: uma dependência a menos pra instalar no Railway
 * (que já exige `.npmrc` com legacy-peer-deps) e nada de cliente singleton
 * carregando sessão entre requisições — problema que já mordeu o próprio CRM.
 *
 * Variáveis de ambiente:
 *   CRM_SUPABASE_URL          https://xxxx.supabase.co
 *   CRM_SUPABASE_SERVICE_KEY  chave service_role (o backend do CRM usa a mesma)
 *
 * Sem as duas setadas, `crmConfigurado()` devolve false e o sync não roda —
 * em vez de explodir no cron.
 */

// Lido sob demanda, NÃO no topo do módulo: em script rodado por tsx o .env só
// é carregado depois que os imports são avaliados, e uma const de topo
// congelaria os valores vazios.
function crmUrl(): string {
  return (process.env.CRM_SUPABASE_URL ?? "").replace(/\/+$/, "");
}
function crmKey(): string {
  return process.env.CRM_SUPABASE_SERVICE_KEY ?? "";
}

/** Timeout por requisição. O cron não pode ficar pendurado no Supabase. */
const TIMEOUT_MS = 20_000;
/** Tamanho da página. O PostgREST corta em 1000 por padrão. */
const PAGINA = 1000;

export function crmConfigurado(): boolean {
  return crmUrl().length > 0 && crmKey().length > 0;
}

export class CrmIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "CrmIndisponivelError";
  }
}

/**
 * SELECT paginado numa tabela do CRM.
 *
 * @param tabela  nome da tabela no schema public
 * @param select  lista de colunas (sintaxe do PostgREST)
 * @param filtros pares `coluna=operador.valor`, ex.: `{ status_negocio: "eq.ganha" }`
 */
async function crmSelect<T>(
  tabela: string,
  select: string,
  filtros: Record<string, string> = {},
): Promise<T[]> {
  if (!crmConfigurado()) {
    throw new CrmIndisponivelError(
      "CRM_SUPABASE_URL e CRM_SUPABASE_SERVICE_KEY não estão configuradas.",
    );
  }

  const linhas: T[] = [];

  for (let offset = 0; ; offset += PAGINA) {
    const qs = new URLSearchParams({ select, limit: String(PAGINA), offset: String(offset) });
    for (const [coluna, expressao] of Object.entries(filtros)) {
      qs.append(coluna, expressao);
    }

    const url = `${crmUrl()}/rest/v1/${tabela}?${qs.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        headers: {
          apikey: crmKey(),
          Authorization: `Bearer ${crmKey()}`,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      throw new CrmIndisponivelError(`Falha ao ler ${tabela} do CRM: ${motivo}`);
    } finally {
      clearTimeout(timer);
    }

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      throw new CrmIndisponivelError(
        `CRM devolveu HTTP ${resposta.status} em ${tabela}: ${corpo.slice(0, 300)}`,
      );
    }

    const pagina = (await resposta.json()) as T[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  return linhas;
}

// ---------------------------------------------------------------------------
// Formatos do CRM (só as colunas que a integração usa)
// ---------------------------------------------------------------------------

export interface ProdutoCrm {
  id: number;
  codigo: string;
  nome: string;
  ativo: boolean;
}

export interface PropostaCrm {
  id: number;
  numero: string | null;
  produto_id: number | null;
  cliente_id: number | null;
  vendedor_id: string | null;
  status_negocio: string | null;
  valor_investimento: number | null;
  fechado_em: string | null;
  data_fechamento: string | null;
  cidade_instalacao: string | null;
  concessionaria: string | null;
  teste: boolean | null;
  substituida_por_id: number | null;
  /**
   * Recorte de `dados_snapshot->dados_desconto_fatura`, a cópia congelada da
   * simulação no momento em que a proposta foi apresentada. É AQUI que mora o
   * desconto combinado com o cliente.
   *
   * Pedimos só este ramo do JSON porque o `dados_snapshot` inteiro carrega o
   * cadastro completo do cliente — payload grande e sem uso aqui.
   *
   * ⚠️ NÃO confundir com a coluna `propostas.desconto_pct`: aquela é do fluxo
   * de venda de equipamento e está **zerada nas 37 propostas de desconto**
   * (medido em 15/08/2026). Quem lê a coluna acha que ninguém deu desconto.
   */
  dados_desconto_fatura: DadosDescontoFaturaCrm | null;
}

export interface DadosDescontoFaturaCrm {
  /** Percentual de DESCONTO combinado (15 = 15% off). */
  desconto?: number | null;
  /** Nome comercial do plano ("OURO", "A DEFINIR"…). */
  plano?: string | null;
  /** Meses de fidelidade do contrato. */
  fidelidade?: number | null;
  /** R$/kWh cheio usado na simulação (0 quando o vendedor não preencheu). */
  custoKwh?: number | null;
  te?: number | null;
  tusd?: number | null;
  consumo?: number | null;
}

/**
 * Colunas pedidas em toda leitura de `propostas`.
 *
 * O `->` no fim é o operador de JSON do PostgREST: traz só o ramo
 * `dados_desconto_fatura` de dentro de `dados_snapshot`, com esse nome.
 */
const COLUNAS_PROPOSTA =
  "id,numero,produto_id,cliente_id,vendedor_id,status_negocio,valor_investimento," +
  "fechado_em,data_fechamento,cidade_instalacao,concessionaria,teste,substituida_por_id," +
  "dados_desconto_fatura:dados_snapshot->dados_desconto_fatura";

/** Desconto combinado na proposta, já normalizado. */
export interface DescontoDaProposta {
  /** Percentual de desconto (15 = 15%). Null quando a proposta não traz. */
  percentual: number | null;
  plano: string | null;
  fidelidadeMeses: number | null;
}

/**
 * Extrai o desconto combinado do snapshot da proposta.
 *
 * Devolve `percentual: null` quando o campo não existe ou está fora de
 * 0–100 — nunca um chute. Desconto ausente tem que aparecer como ausente:
 * preencher 15 por padrão esconderia exatamente o caso que a operação
 * precisa ver (ver [[feedback_nao_estimar_realidade_do_cliente]]).
 */
export function descontoDaProposta(proposta: PropostaCrm): DescontoDaProposta {
  const d = proposta.dados_desconto_fatura;
  const bruto = typeof d?.desconto === "number" ? d.desconto : null;
  const percentual = bruto != null && bruto >= 0 && bruto <= 100 ? bruto : null;
  const plano = typeof d?.plano === "string" && d.plano.trim() ? d.plano.trim() : null;
  const fidelidade = typeof d?.fidelidade === "number" ? d.fidelidade : null;
  return { percentual, plano, fidelidadeMeses: fidelidade };
}

export interface ClienteCrm {
  id: number;
  nome: string;
  tipo: string | null;
  cpf: string | null;
  cnpj: string | null;
  documento: string | null;
  cidade: string | null;
}

export interface AdesaoCrm {
  id: number;
  cliente_nome: string | null;
  cliente_documento: string | null;
  cliente_tipo: string | null;
  cliente_email: string | null;
  cliente_telefone: string | null;
  concessionaria: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  representante_nome: string | null;
  representante_cpf: string | null;
  representante_cargo: string | null;
  unidades_consumidoras: unknown;
  /**
   * DEPRECADO no CRM: está null nas 23 adesões (conferido em 15/08/2026). O
   * campo vivo é `medias_mensais_kwh`, um array com uma média por UC. Lido
   * ainda como fallback, para adesão antiga que porventura só tenha ele.
   */
  media_mensal_kwh: number | null;
  /** Uma média por UC, pareada por POSIÇÃO com `unidades_consumidoras`. */
  medias_mensais_kwh: unknown;
  proposta_id: number | null;
  proprietario_usina: boolean | null;
  /**
   * Quem GEROU O TERMO. Não é necessariamente quem vendeu: em 2 das 22 adesões
   * (medido 16/08/2026) difere do `vendedor_id` da proposta, porque o termo foi
   * emitido por outra pessoa. Quem fechou o negócio é o da PROPOSTA.
   */
  vendedor_id: string | null;
  criado_em: string | null;
}

/** Envelope de assinatura eletrônica (ClickSign) de um Termo de Adesão. */
export interface EnvelopeAssinaturaCrm {
  id: string;
  adesao_id: number | null;
  status: string | null;
  criado_em: string | null;
  assinado_em: string | null;
}

/**
 * Documento anexado à adesão. Mora no R2 (bucket do CRM), em `r2_key`.
 *
 * `categoria`: identidade | cartao_cnpj | contrato_social | fatura_energia |
 * outros. A fatura de energia NÃO é importada — ela serve à conferência de
 * comissão do vendedor, e fica no CRM. Ver [[listarDocumentosAdesao]].
 */
export interface DocumentoAdesaoCrm {
  id: number;
  adesao_id: number | null;
  categoria: string | null;
  nome_arquivo: string | null;
  r2_key: string | null;
  mime: string | null;
  tamanho: number | null;
  criado_em: string | null;
}

export interface UsuarioCrm {
  id: string;
  nome: string | null;
  email: string | null;
  role: string | null;
  ativo: boolean | null;
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

export function listarProdutos(): Promise<ProdutoCrm[]> {
  return crmSelect<ProdutoCrm>("produtos", "id,codigo,nome,ativo");
}

/**
 * Propostas GANHAS de verdade.
 *
 * Definição fechada com o Paulo em 02/08/2026: `status_negocio = 'ganha'`,
 * fora testes e fora as substituídas por uma versão mais nova. NÃO usar as
 * etapas do pipeline — hoje há "Ganho" e "Fechado" ambas na ordem 6 e
 * `tipo_terminal='ganho'` em duas etapas, então o número oscilaria entre
 * 69, 75 e 109 conforme o critério.
 */
export async function listarVendasGanhas(): Promise<PropostaCrm[]> {
  const propostas = await crmSelect<PropostaCrm>(
    "propostas",
    COLUNAS_PROPOSTA,
    { status_negocio: "eq.ganha" },
  );
  return propostas.filter((p) => !p.teste && !p.substituida_por_id);
}

/**
 * Propostas específicas por id, em qualquer status.
 *
 * Usado para as adesões que já foram ASSINADAS mas cuja proposta ainda não
 * está "ganha" — hoje 3 das 15, somando 13 das 27 UCs. Elas não podem sumir
 * da tela só porque o vendedor não marcou a venda.
 */
export async function listarPropostasPorIds(ids: number[]): Promise<PropostaCrm[]> {
  if (ids.length === 0) return [];
  const unicos = [...new Set(ids)];
  const resultado: PropostaCrm[] = [];

  // Lote pra não estourar o tamanho da URL com um `in.(...)` gigante.
  const TAMANHO_LOTE = 200;
  for (let i = 0; i < unicos.length; i += TAMANHO_LOTE) {
    const lote = unicos.slice(i, i + TAMANHO_LOTE);
    const parte = await crmSelect<PropostaCrm>(
      "propostas",
      COLUNAS_PROPOSTA,
      { id: `in.(${lote.join(",")})` },
    );
    resultado.push(...parte);
  }

  return resultado;
}

export function listarClientes(): Promise<ClienteCrm[]> {
  return crmSelect<ClienteCrm>("clientes", "id,nome,tipo,cpf,cnpj,documento,cidade");
}

export function listarAdesoes(): Promise<AdesaoCrm[]> {
  return crmSelect<AdesaoCrm>(
    "adesoes",
    "id,cliente_nome,cliente_documento,cliente_tipo,cliente_email,cliente_telefone," +
      "concessionaria,cep,endereco,numero,complemento,bairro,cidade," +
      "representante_nome,representante_cpf,representante_cargo," +
      "unidades_consumidoras,media_mensal_kwh,medias_mensais_kwh," +
      "proposta_id,proprietario_usina,vendedor_id,criado_em",
  );
}

/**
 * Envelopes de assinatura. Sem o PDF: `pdf_termo_assinado` é base64 de ~330 KB
 * por envelope, e trazer 24 deles a cada sync seria ~8 MB de tráfego para
 * exibir uma data. O PDF é buscado sob demanda, quando alguém clica.
 */
export function listarEnvelopesAssinatura(): Promise<EnvelopeAssinaturaCrm[]> {
  return crmSelect<EnvelopeAssinaturaCrm>(
    "envelopes_assinatura",
    "id,adesao_id,status,criado_em,assinado_em",
  );
}

/**
 * Coluna que o CRM pode ainda não ter.
 *
 * A autorização de acesso entrou no envelope do CRM em 21/08/2026 (migration 097
 * de lá). Enquanto aquele SQL não roda, pedir a coluna faz o PostgREST responder
 * HTTP 400 — e, como a leitura do envelope acontece dentro de um `catch` que
 * devolve null, o efeito seria o Gestor deixar de copiar TAMBÉM o termo e a
 * procuração, calado. Por isso toda leitura da coluna nova tem plano B.
 */
function ehColunaInexistente(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /HTTP 400/.test(msg) && /pdf_autorizacao_assinada|documento_autorizacao_id/.test(msg);
}

/** Os documentos que o envelope de assinatura do CRM pode guardar. */
export type TipoPdfAssinadoCrm = "termo" | "procuracao" | "autorizacao";

/**
 * Nome da coluna de cada PDF assinado em `envelopes_assinatura`.
 *
 * Cuidado com o gênero: `pdf_termo_assinado` é masculino, `pdf_procuracao_assinada`
 * e `pdf_autorizacao_assinada` são FEMININOS. Pedir a grafia errada devolve erro
 * do PostgREST, não null — o que passaria por "envelope sem documento".
 */
export const COLUNA_PDF_ASSINADO: Record<TipoPdfAssinadoCrm, string> = {
  termo: "pdf_termo_assinado",
  procuracao: "pdf_procuracao_assinada",
  autorizacao: "pdf_autorizacao_assinada",
};

/**
 * Base64 de UM dos PDFs assinados do envelope, para servir sob demanda.
 *
 * A autorização de acesso entrou no envelope do CRM em 21/08/2026: envelope
 * anterior a isso não tem a coluna preenchida, e nesse caso o retorno é null —
 * não é erro, é adesão que assinou quando só havia dois documentos.
 */
export async function buscarPdfAssinado(
  envelopeId: string,
  tipo: TipoPdfAssinadoCrm,
): Promise<string | null> {
  const coluna = COLUNA_PDF_ASSINADO[tipo];
  try {
    const linhas = await crmSelect<Record<string, string | null>>(
      "envelopes_assinatura",
      coluna,
      { id: `eq.${envelopeId}` },
    );
    return linhas[0]?.[coluna] ?? null;
  } catch (err) {
    if (ehColunaInexistente(err)) return null; // CRM ainda sem a migration 097
    throw err;
  }
}

/**
 * Este envelope já tem a AUTORIZAÇÃO DE ACESSO assinada guardada?
 *
 * Serve para a ficha do painel de documentos não prometer um arquivo que não
 * existe: adesão assinada antes de 21/08/2026 tem envelope de dois documentos e
 * nunca vai ter o terceiro. Pergunta só pelo `id` — o base64 do PDF não vem.
 */
export async function envelopeTemAutorizacaoAssinada(envelopeId: string): Promise<boolean> {
  try {
    const linhas = await crmSelect<{ id: string }>("envelopes_assinatura", "id", {
      id: `eq.${envelopeId}`,
      pdf_autorizacao_assinada: "not.is.null",
    });
    return linhas.length > 0;
  } catch (err) {
    if (ehColunaInexistente(err)) return false; // CRM ainda sem a migration 097
    throw err;
  }
}

/**
 * Ids dos envelopes que JÁ têm a autorização de acesso assinada guardada.
 *
 * Uma consulta só para a fila inteira, trazendo apenas o `id` — perguntar
 * envelope por envelope seriam dezenas de idas ao CRM para desenhar um chip.
 */
export async function listarEnvelopesComAutorizacaoAssinada(): Promise<Set<string>> {
  try {
    const linhas = await crmSelect<{ id: string }>("envelopes_assinatura", "id", {
      pdf_autorizacao_assinada: "not.is.null",
    });
    return new Set(linhas.map((l) => l.id));
  } catch (err) {
    if (ehColunaInexistente(err)) return new Set(); // CRM ainda sem a migration 097
    throw err;
  }
}

/**
 * Documentos anexados às adesões, EXCETO a fatura de energia.
 *
 * A fatura fica de fora por decisão do Paulo em 15/08/2026: o que o Gestor
 * precisa é do NÚMERO da UC, que já vem em `unidades_consumidoras`; o PDF da
 * fatura serve à conferência de comissão do vendedor e continua no CRM.
 *
 * Isso também elimina a única ambiguidade que existia: os documentos do CRM
 * são amarrados à ADESÃO, não à UC. Identidade, cartão CNPJ e contrato social
 * são do CLIENTE, então valem para todas as UCs dele sem chute. A fatura era o
 * único que pertencia a uma UC específica sem o CRM dizer qual.
 */
export function listarDocumentosAdesao(): Promise<DocumentoAdesaoCrm[]> {
  return crmSelect<DocumentoAdesaoCrm>(
    "adesao_documentos",
    "id,adesao_id,categoria,nome_arquivo,r2_key,mime,tamanho,criado_em",
    { categoria: "neq.fatura_energia" },
  );
}

/** Anexos de UMA adesão, ainda sem a fatura de energia. */
export function listarDocumentosDaAdesao(adesaoId: number): Promise<DocumentoAdesaoCrm[]> {
  return crmSelect<DocumentoAdesaoCrm>(
    "adesao_documentos",
    "id,adesao_id,categoria,nome_arquivo,r2_key,mime,tamanho,criado_em",
    { adesao_id: `eq.${adesaoId}`, categoria: "neq.fatura_energia" },
  );
}

/**
 * Envelope de UMA adesão COM os dois PDFs assinados.
 *
 * Só na cópia — são ~670 KB de base64 por envelope. A listagem geral usa
 * `listarEnvelopesAssinatura`, que não traz os PDFs.
 *
 * Atenção ao nome da coluna: `pdf_procuracao_assinada` é FEMININO, enquanto o
 * do termo é `pdf_termo_assinado`. Pedir `_assinado` para a procuração devolve
 * erro do PostgREST, não null.
 */
export async function buscarEnvelopeDaAdesao(adesaoId: number): Promise<
  | (EnvelopeAssinaturaCrm & {
      pdf_termo_assinado: string | null;
      pdf_procuracao_assinada: string | null;
      pdf_autorizacao_assinada: string | null;
      signatario_nome: string | null;
      signatario_cpf: string | null;
    })
  | null
> {
  type Linha = EnvelopeAssinaturaCrm & {
    pdf_termo_assinado: string | null;
    pdf_procuracao_assinada: string | null;
    pdf_autorizacao_assinada: string | null;
    signatario_nome: string | null;
    signatario_cpf: string | null;
  };
  const base =
    "id,adesao_id,status,criado_em,assinado_em,signatario_nome,signatario_cpf," +
    "pdf_termo_assinado,pdf_procuracao_assinada";
  const ler = (select: string) =>
    crmSelect<Linha>("envelopes_assinatura", select, { adesao_id: `eq.${adesaoId}` });

  try {
    const linhas = await ler(`${base},pdf_autorizacao_assinada`);
    return linhas[0] ?? null;
  } catch (err) {
    if (!ehColunaInexistente(err)) throw err;
    // CRM sem a migration 097: segue com os dois documentos de sempre.
    const linhas = await ler(base);
    const primeira = linhas[0];
    return primeira ? { ...primeira, pdf_autorizacao_assinada: null } : null;
  }
}

/** Um documento específico, para a rota que serve o arquivo. */
export async function buscarDocumentoAdesao(id: number): Promise<DocumentoAdesaoCrm | null> {
  const linhas = await crmSelect<DocumentoAdesaoCrm>(
    "adesao_documentos",
    "id,adesao_id,categoria,nome_arquivo,r2_key,mime,tamanho,criado_em",
    { id: `eq.${id}` },
  );
  return linhas[0] ?? null;
}

export function listarUsuarios(): Promise<UsuarioCrm[]> {
  return crmSelect<UsuarioCrm>("usuarios", "id,nome,email,role,ativo");
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/** Só os dígitos. CPF/CNPJ e código de UC chegam formatados de jeitos diferentes. */
export function apenasDigitos(valor: unknown): string {
  return valor == null ? "" : String(valor).replace(/\D/g, "");
}

/**
 * Extrai os códigos de UC de uma adesão.
 *
 * `unidades_consumidoras` é JSON e já apareceu em três formatos: array de
 * strings, array de objetos e texto separado por vírgula. Uma adesão pode
 * trazer várias UCs (o RESIDENCIAL MORADA DO LESTE tem 10).
 */
export function extrairCodigosUc(bruto: unknown): string[] {
  const codigos: string[] = [];

  const adicionar = (valor: unknown) => {
    const digitos = apenasDigitos(valor);
    if (digitos && !codigos.includes(digitos)) codigos.push(digitos);
  };

  if (Array.isArray(bruto)) {
    for (const item of bruto) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        adicionar(obj.codigo ?? obj.codigo_uc ?? obj.uc ?? obj.numero);
      } else {
        adicionar(item);
      }
    }
  } else if (typeof bruto === "string") {
    for (const parte of bruto.split(/[;,\s]+/)) adicionar(parte);
  }

  return codigos;
}

/** Uma UC da adesão, já pareada com o consumo que foi assinado para ela. */
export interface UnidadeDaAdesao {
  /** Só dígitos — casa com ConsumerUnit.codigoUc. */
  codigo: string;
  /** Como veio no termo ("2.715.094.001-03"). */
  bruto: string;
  /** kWh/mês desta UC; null quando não dá para parear com honestidade. */
  mediaKwh: number | null;
  /**
   * Posição no array `unidades_consumidoras` — a ordem em que a UC aparece no
   * termo assinado. Preservada para a fila do Gestor sair na mesma ordem da
   * tela do CRM, o que torna a conferência linha a linha.
   */
  ordem: number;
}

/**
 * Extrai as UCs de uma adesão JÁ PAREADAS com o consumo de cada uma.
 *
 * `unidades_consumidoras[i]` corresponde a `medias_mensais_kwh[i]` — pareamento
 * POSICIONAL, confirmado nas 23 adesões em 15/08/2026 (nenhuma desalinhada).
 *
 * Se os dois arrays tiverem tamanhos diferentes, o pareamento por posição
 * deixa de ser confiável e a média sai `null` para TODAS as UCs daquela adesão.
 * Preencher metade certo e metade errado seria pior que não preencher: o kWh
 * errado vira dimensionamento errado da usina, e ninguém desconfia de um
 * número plausível. Ver [[feedback_anomalias_sinalizar]].
 *
 * `media_mensal_kwh` (singular) só é usado quando a adesão tem UMA única UC —
 * é o formato antigo do CRM, hoje null em todas as 23.
 */
export function extrairUnidades(
  unidadesBrutas: unknown,
  mediasBrutas: unknown,
  mediaUnicaLegado?: number | null,
): UnidadeDaAdesao[] {
  const brutos: string[] = [];
  if (Array.isArray(unidadesBrutas)) {
    for (const item of unidadesBrutas) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const v = obj.codigo ?? obj.codigo_uc ?? obj.uc ?? obj.numero;
        brutos.push(v == null ? "" : String(v));
      } else {
        brutos.push(item == null ? "" : String(item));
      }
    }
  } else if (typeof unidadesBrutas === "string") {
    brutos.push(...unidadesBrutas.split(/[;,\s]+/));
  }

  const medias = Array.isArray(mediasBrutas) ? mediasBrutas : null;
  const alinhado = medias != null && medias.length === brutos.length;

  const vistos = new Set<string>();
  const saida: UnidadeDaAdesao[] = [];

  brutos.forEach((bruto, i) => {
    const codigo = apenasDigitos(bruto);
    if (!codigo || vistos.has(codigo)) return;
    vistos.add(codigo);

    let mediaKwh: number | null = null;
    if (alinhado) {
      const n = Number(medias![i]);
      mediaKwh = Number.isFinite(n) ? n : null;
    } else if (brutos.length === 1 && mediaUnicaLegado != null) {
      mediaKwh = mediaUnicaLegado;
    }

    // `i` e não `saida.length`: a posição é a do array original. UC repetida ou
    // vazia é pulada, e usar o tamanho da saída renumeraria as seguintes,
    // desalinhando a lista daqui com a do termo.
    saida.push({ codigo, bruto: String(bruto).trim(), mediaKwh, ordem: i });
  });

  return saida;
}

/**
 * Conserta nome de arquivo gravado como UTF-8 e lido como Latin-1.
 *
 * O CRM tem casos assim: em "cnpj unigá.pdf", o "á" chega com os bytes
 * `C3 83 C2 A1` (o `C3 A1` correto, re-codificado mais uma vez) e a tela
 * mostra dois caracteres no lugar de um.
 *
 * O exemplo está descrito em BYTES de propósito. Escrever o texto quebrado
 * aqui faria uma varredura de acentuação "consertar" o comentário e apagar
 * justamente o exemplo. Ver [[project_mojibake_utf8_fonte]].
 */
export function corrigirMojibake(nome: string | null | undefined): string {
  if (!nome) return "";
  if (!/[ÃÂ][\x80-\xBF]/.test(nome)) return nome;
  try {
    const consertado = Buffer.from(nome, "latin1").toString("utf8");
    // Só aceita se o conserto não introduziu caractere de substituição.
    return consertado.includes("�") ? nome : consertado;
  } catch {
    return nome;
  }
}
