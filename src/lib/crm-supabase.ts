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
  concessionaria: string | null;
  cidade: string | null;
  unidades_consumidoras: unknown;
  media_mensal_kwh: number | null;
  proposta_id: number | null;
  proprietario_usina: boolean | null;
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
    "id,numero,produto_id,cliente_id,vendedor_id,status_negocio,valor_investimento,fechado_em,data_fechamento,cidade_instalacao,concessionaria,teste,substituida_por_id",
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
      "id,numero,produto_id,cliente_id,vendedor_id,status_negocio,valor_investimento,fechado_em,data_fechamento,cidade_instalacao,concessionaria,teste,substituida_por_id",
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
    "id,cliente_nome,cliente_documento,concessionaria,cidade,unidades_consumidoras,media_mensal_kwh,proposta_id,proprietario_usina,criado_em",
  );
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
