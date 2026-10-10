/**
 * De-para do código de UC na CPFL/RGE: número novo ⇄ código de instalação antigo.
 *
 * Usa o formulário PÚBLICO https://www.cpfl.com.br/buscar-unidade-consumidora —
 * sem login e sem navegador. É um form Drupal: o GET da página entrega o
 * `form_build_id` e o POST em `?ajax_form=1` devolve uma lista de comandos com
 * o HTML de cada campo do resultado. (POST comum, sem o ajax, volta a página
 * com o resultado vazio.)
 *
 * ⚠️ O Cloudflare da CPFL corta rajadas: 3-4 chamadas coladas rendem HTTP 429
 * ("error code: 1015") por cerca de um minuto. Por isso as consultas deste
 * processo saem EM FILA, espaçadas, e o 429 é esperado e repetido — nunca
 * devolvido como "não encontrado".
 *
 * Gêmeo de `consulta-uc-cpfl.mjs` (pasta-mãe), que é a versão de linha de comando.
 */

const URL_PAGINA = "https://www.cpfl.com.br/buscar-unidade-consumidora";
const URL_AJAX = `${URL_PAGINA}?ajax_form=1&_wrapper_format=drupal_ajax`;
const FORM_ID = "cpfl_padronizacao_uc_buscar_form";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

// Medido em 10/10/2026: com 8 s entre consultas, 5 seguidas passaram.
const INTERVALO_MS = 8_000;
const ESPERA_BLOQUEIO_MS = 45_000;
const TENTATIVAS = 3;
const VALIDADE_SESSAO_MS = 10 * 60_000;

export type TipoCodigoUc = "novo" | "antigo";

export interface ResultadoBuscaUc {
  consultado: string;
  tipo: TipoCodigoUc;
  /** `false` = a CPFL respondeu e não conhece o código. Falha de rede/bloqueio LEVANTA. */
  encontrado: boolean;
  novo: string;
  antigo: string;
  status: string;
  endereco: string;
}

export class BloqueioCpflError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "BloqueioCpflError";
  }
}

interface Sessao {
  formBuildId: string;
  cookies: string;
  abertaEm: number;
}

interface ComandoDrupal {
  command?: string;
  selector?: string;
  data?: string;
}

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const soDigitos = (v: string) => v.replace(/\D/g, "");

function limparHtml(html: string | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

/** "Número da UC (novo): 1.582.360.001-72" → "1.582.360.001-72" */
function depoisDosDoisPontos(texto: string): string {
  const i = texto.indexOf(":");
  return (i >= 0 ? texto.slice(i + 1) : texto).trim();
}

async function abrirSessao(): Promise<Sessao> {
  const res = await fetch(URL_PAGINA, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    cache: "no-store",
  });
  if (res.status === 429 || res.status === 403) {
    throw new BloqueioCpflError(`CPFL recusou a abertura da página (HTTP ${res.status}).`);
  }
  if (!res.ok) throw new Error(`Página de busca da CPFL respondeu HTTP ${res.status}.`);

  const html = await res.text();
  const formulario = html.slice(html.indexOf('id="cpfl-padronizacao-uc-buscar-form"'));
  const formBuildId = formulario.match(/name="form_build_id" value="([^"]+)"/)?.[1];
  if (!formBuildId) {
    throw new Error("Não achei o formulário de busca na página da CPFL — o site pode ter mudado.");
  }
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { formBuildId, cookies, abertaEm: Date.now() };
}

let sessao: Sessao | null = null;
let fila: Promise<unknown> = Promise.resolve();
let ultimaChamada = 0;

async function consultarUmaVez(codigo: string, tipo: TipoCodigoUc): Promise<ResultadoBuscaUc> {
  if (!sessao || Date.now() - sessao.abertaEm > VALIDADE_SESSAO_MS) {
    sessao = await abrirSessao();
  }

  const res = await fetch(URL_AJAX, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: URL_PAGINA,
      ...(sessao.cookies ? { Cookie: sessao.cookies } : {}),
    },
    body: new URLSearchParams({
      form_build_id: sessao.formBuildId,
      form_id: FORM_ID,
      tipos_busca: tipo,
      codigo,
      _triggering_element_name: "op",
      _triggering_element_value: "Buscar",
      _drupal_ajax: "1",
    }),
    cache: "no-store",
  });

  if (res.status === 429 || res.status === 403) {
    throw new BloqueioCpflError(`CPFL limitou as consultas (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    // Sessão vencida do lado deles também cai aqui: a próxima tentativa abre outra.
    sessao = null;
    throw new Error(`Busca de UC da CPFL respondeu HTTP ${res.status}.`);
  }

  const comandos: unknown = await res.json();
  if (!Array.isArray(comandos)) {
    sessao = null;
    throw new Error("Resposta inesperada da busca de UC da CPFL.");
  }
  const campo = (seletor: string) =>
    limparHtml(
      (comandos as ComandoDrupal[]).find((c) => c.command === "insert" && c.selector === seletor)
        ?.data,
    );

  // Código inexistente não dá erro no site: os mesmos campos voltam vazios.
  const novo = soDigitos(depoisDosDoisPontos(campo("#numero-uc")));
  const antigo = soDigitos(depoisDosDoisPontos(campo("#codigo_instalacao")));
  const encontrado = Boolean(novo && antigo);

  return {
    consultado: codigo,
    tipo,
    encontrado,
    novo: encontrado ? novo : "",
    antigo: encontrado ? antigo : "",
    status: encontrado ? campo("#status") : "",
    endereco: encontrado ? campo("#endereco") : "",
  };
}

/**
 * Consulta um código na CPFL. Sem `tipo`, decide pelo tamanho: 11-12 dígitos é
 * o número novo; até 10, o código de instalação antigo.
 *
 * Pode demorar (fila + espera de bloqueio): quem chama não deve pôr timeout curto.
 */
export function buscarUcCpfl(codigo: string, tipo?: TipoCodigoUc): Promise<ResultadoBuscaUc> {
  const digitos = soDigitos(codigo);
  if (!digitos) return Promise.reject(new Error("Código de UC vazio."));
  const tipoFinal = tipo ?? (digitos.length >= 11 ? "novo" : "antigo");

  const execucao = fila.then(async () => {
    for (let tentativa = 1; ; tentativa++) {
      const falta = ultimaChamada + INTERVALO_MS - Date.now();
      if (falta > 0) await dormir(falta);
      try {
        return await consultarUmaVez(digitos, tipoFinal);
      } catch (erro) {
        if (!(erro instanceof BloqueioCpflError) || tentativa >= TENTATIVAS) throw erro;
        await dormir(ESPERA_BLOQUEIO_MS * tentativa);
      } finally {
        ultimaChamada = Date.now();
      }
    }
  });
  // A fila segue andando mesmo que esta consulta falhe.
  fila = execucao.catch(() => undefined);
  return execucao;
}
