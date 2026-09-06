/**
 * Cliente da Uazapi — envio de WhatsApp.
 *
 * Contrato conferido no cliente oficial da Uazapi para n8n
 * (`n8n-nodes-uazapi-api` v1.0.23, MIT), não deduzido:
 *
 *   Base    https://{UAZAPI_SUBDOMINIO}.uazapi.com
 *   Auth    header `token: <token da instância>`   ← não é Bearer
 *   Texto   POST /send/text    { number, text }
 *   Mídia   POST /send/media   { number, type, file, text }
 *   Saúde   GET  /instance/status
 *
 * Configuração:
 *   UAZAPI_SUBDOMINIO   subdomínio da instância (ex.: "free" ou o da empresa)
 *   UAZAPI_TOKEN        token da instância
 *
 * ⚠️ **Instância pareada ≠ instância configurada.** A Uazapi aceita a chamada
 * e devolve 200 mesmo com o celular desconectado — a mensagem simplesmente não
 * sai. Por isso `statusInstancia()` existe e o script de diagnóstico a chama
 * antes de qualquer disparo: um "enviado" gravado no banco para uma instância
 * desconectada é pior do que um erro.
 *
 * O número precisa vir em E.164 sem o `+` (`55DD9XXXXXXXX`) —
 * `normalizarTelefoneBR` em `uc-trava-contato.ts` é quem produz esse formato.
 */

const TIMEOUT_MS = 20_000;

export interface UazapiConfig {
  base: string;
  token: string;
}

export function uazapiConfigurado(): { ok: boolean; motivo?: string } {
  const faltando = [
    !process.env.UAZAPI_SUBDOMINIO && "UAZAPI_SUBDOMINIO",
    !process.env.UAZAPI_TOKEN && "UAZAPI_TOKEN",
  ].filter(Boolean) as string[];
  return faltando.length === 0
    ? { ok: true }
    : { ok: false, motivo: `${faltando.join(" e ")} não configurada(s)` };
}

function getConfig(): UazapiConfig {
  const sub = process.env.UAZAPI_SUBDOMINIO;
  const token = process.env.UAZAPI_TOKEN;
  if (!sub || !token) {
    throw new Error(
      "WhatsApp não configurado: faltam UAZAPI_SUBDOMINIO e/ou UAZAPI_TOKEN.",
    );
  }
  // Aceita tanto "minhaempresa" quanto a URL inteira, porque é fácil colar a
  // URL do painel na variável e passar meia hora procurando o erro.
  const base = /^https?:\/\//i.test(sub)
    ? sub.replace(/\/+$/, "")
    : `https://${sub}.uazapi.com`;
  return { base, token };
}

export class UazapiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly corpo?: unknown,
  ) {
    super(message);
    this.name = "UazapiError";
  }
}

async function chamar<T>(
  caminho: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const { base, token } = getConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${caminho}`, {
      method: init.method,
      headers: {
        token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    const texto = await res.text();
    let corpo: unknown = texto;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch {
      /* resposta não-JSON: mantém o texto cru, que é a prova */
    }
    if (!res.ok) {
      const detalhe =
        (corpo as { message?: string; error?: string })?.message ??
        (corpo as { error?: string })?.error ??
        texto.slice(0, 300);
      throw new UazapiError(`Uazapi ${res.status}: ${detalhe}`, res.status, corpo);
    }
    return corpo as T;
  } catch (err) {
    if (err instanceof UazapiError) throw err;
    if ((err as Error)?.name === "AbortError") {
      throw new UazapiError(`Uazapi não respondeu em ${TIMEOUT_MS / 1000}s`);
    }
    throw new UazapiError(`Falha ao falar com a Uazapi: ${(err as Error).message}`);
  }
}

export interface StatusInstancia {
  conectado: boolean;
  /** Texto literal devolvido pela API — é a prova, não a nossa interpretação. */
  statusBruto: string;
  numero?: string;
}

/**
 * Estado da instância. `conectado` é interpretação nossa; `statusBruto` é o que
 * a API disse, e é ele que vale numa discussão com o fornecedor.
 */
export async function statusInstancia(): Promise<StatusInstancia> {
  const r = await chamar<Record<string, unknown>>("/instance/status", { method: "GET" });
  const inst = (r?.instance ?? r) as Record<string, unknown>;
  const bruto = String(inst?.status ?? r?.status ?? "");
  return {
    conectado: /^(connected|open|online)$/i.test(bruto),
    statusBruto: bruto || JSON.stringify(r).slice(0, 200),
    numero: typeof inst?.owner === "string" ? inst.owner : undefined,
  };
}

export interface EnvioWhatsappResult {
  /** id da mensagem na Uazapi, quando devolvido. */
  id: string;
  numero: string;
}

/**
 * Envia uma mensagem de texto.
 *
 * Uma retentativa em falha de rede/5xx — a Uazapi passa por instabilidade curta
 * e perder a notificação de uma cobrança por isso não vale a pena. 4xx NÃO é
 * repetido: número inválido continua inválido na segunda tentativa.
 */
export async function enviarTextoWhatsapp(
  numeroE164: string,
  texto: string,
): Promise<EnvioWhatsappResult> {
  const number = numeroE164.replace(/\D/g, "");
  if (!number) throw new UazapiError("Número vazio");

  let ultimo: unknown;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const r = await chamar<Record<string, unknown>>("/send/text", {
        method: "POST",
        body: { number, text: texto },
      });
      const id =
        (r?.id as string) ??
        ((r?.message as Record<string, unknown>)?.id as string) ??
        (r?.messageid as string) ??
        "";
      return { id: String(id ?? ""), numero: number };
    } catch (err) {
      ultimo = err;
      const status = err instanceof UazapiError ? err.status : undefined;
      const valeRepetir = status === undefined || status >= 500;
      if (!valeRepetir || tentativa === 2) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw ultimo instanceof Error ? ultimo : new UazapiError(String(ultimo));
}
