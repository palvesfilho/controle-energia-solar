/**
 * WEG Solar Portal API Client
 * Base URL: https://solarportal-api.weg.net/api/v1
 * Auth: dois headers — `x-api-key` e `x-api-secret` (sem OAuth, sem token temporário).
 *
 * A chave se cria no portal em "Gestão de API" e o Secret só aparece uma vez.
 * 🔴 A chave em uso EXPIRA em 05/08/2027 — quando vencer, a coleta para sozinha
 * e o sintoma é HTTP 401/403.
 *
 * 🔴 NÃO é `solarportal.weg.net` — aquele é o SITE, e ele responde HTTP 200 com
 * HTML a qualquer caminho desconhecido (`/measurements` lá devolve `{"data": []}`
 * para sempre). Por isso `wegFetch` só aceita 200 quando o Content-Type é JSON.
 *
 * Referência: WEG/entrega-usinas-weg/ENTREGA-GESTOR-USINAS-WEG.md (Joel, 14/08/2026).
 */

const WEG_BASE_URL = "https://solarportal-api.weg.net/api/v1";

/** A API devolve `422 Throttle error` se atacada. 0,5 s entre chamadas + backoff. */
const PAUSA_MS = 500;
const MAX_TENTATIVAS = 4;

/** groupBy diário, em milissegundos. */
const DIA_MS = 86_400_000;

/**
 * Janela máxima por chamada com groupBy diário: medido, 31 dias passa e 32 dá
 * HTTP 400. Como o dia-âncora (ver `getDailyEnergy`) empurra a janela em 1 dia,
 * o bloco é de 30.
 */
const BLOCO_DIAS = 30;

// ============================================================
// Autenticação
// ============================================================

function getCredentials(): { key: string; secret: string } {
  const key = process.env.WEG_API_KEY;
  const secret = process.env.WEG_API_SECRET;
  if (!key || !secret) {
    throw new Error(
      "Credenciais WEG nao configuradas. Defina WEG_API_KEY e WEG_API_SECRET no .env",
    );
  }
  return { key, secret };
}

export class WegApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public endpoint: string,
  ) {
    super(message);
    this.name = "WegApiError";
  }
}

// ============================================================
// Requisições
// ============================================================

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET com espaço entre chamadas e backoff no throttle.
 *
 * Devolve `null` quando a resposta não é JSON — é o sintoma de caminho/host
 * errado (o site respondendo HTML com 200), e tratar isso como "sem dado" é
 * melhor do que quebrar o JSON.parse com uma mensagem que não explica nada.
 */
async function wegFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const { key, secret } = getCredentials();
  const query = new URLSearchParams(params).toString();
  const url = `${WEG_BASE_URL}${path}${query ? `?${query}` : ""}`;

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    await sleep(PAUSA_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "x-api-key": key,
          "x-api-secret": secret,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch (e) {
      if (tentativa === MAX_TENTATIVAS - 1) throw e;
      await sleep(2000 * (tentativa + 1));
      continue;
    }

    // 422/429 = throttle. Espera progressiva e tenta de novo.
    if (res.status === 422 || res.status === 429) {
      await sleep(2000 * (tentativa + 1));
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new WegApiError(
        res.status,
        "Chave WEG recusada (401/403) — confira WEG_API_KEY/WEG_API_SECRET e se a chave nao expirou (vence 05/08/2027)",
        path,
      );
    }

    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      throw new WegApiError(res.status, `WEG API ${res.status} em ${path}: ${texto.slice(0, 300)}`, path);
    }

    // Armadilha do host: 200 com HTML.
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("json")) return null;

    return (await res.json()) as T;
  }

  return null;
}

// ============================================================
// Tipos
// ============================================================

export interface WegPlant {
  /** `_id` da API — é ele que vai em `monitoramentoPlantId` e em `plantId` das consultas. */
  id: string;
  nome: string;
}

export interface WegDevice {
  deviceId: string;
  serialNumber: string;
  nome: string;
  /** Ex.: "SIW200G-M050-W1". */
  modelo: string | null;
  /** ⚠️ pisca — NÃO usar como gatilho de alarme (ver `getDailyEnergy`). */
  status: string | null;
  /** Acumulado como a API manda, texto com unidade: "2.48 MWh". */
  outputEnergy: string | null;
}

export interface WegDailyEnergy {
  /** Dia no formato `YYYY-MM-DD` (UTC, como a API devolve). */
  dia: string;
  kwh: number;
}

interface WegListResponse<T> {
  items?: T[];
  totalCount?: number;
  count?: number;
}

// ============================================================
// Endpoints
// ============================================================

/** Todas as usinas que a chave enxerga. Paginado. */
export async function getAllPlants(): Promise<WegPlant[]> {
  const saida: WegPlant[] = [];
  let pagina = 0;

  // Trava de segurança: a paginação é por contagem, mas uma resposta esquisita
  // não pode virar laço infinito.
  for (let i = 0; i < 100; i++) {
    const d = await wegFetch<WegListResponse<{ _id?: string; name?: string }>>("/plants", {
      page: String(pagina),
      limit: "50",
    });
    const itens = d?.items ?? [];

    for (const it of itens) {
      if (!it._id) continue;
      // Os nomes vêm com espaço sobrando na API (" PANIFICO MALLET LTDA").
      saida.push({ id: it._id, nome: (it.name ?? "").trim() || it._id });
    }

    const total = d?.totalCount ?? saida.length;
    if (itens.length === 0 || saida.length >= total) break;
    pagina++;
  }

  return saida;
}

/** Inversores de uma usina. */
export async function getPlantDevices(plantId: string): Promise<WegDevice[]> {
  const d = await wegFetch<
    WegListResponse<{
      deviceId?: string;
      serialNumber?: string;
      name?: string;
      productModelId?: string;
      status?: string;
      outputEnergy?: string;
    }>
  >(`/plants/${plantId}/devices`);

  return (d?.items ?? [])
    .filter((it) => it.deviceId && it.serialNumber)
    .map((it) => ({
      deviceId: it.deviceId as string,
      serialNumber: it.serialNumber as string,
      nome: (it.name ?? "").trim(),
      modelo: it.productModelId ?? null,
      status: it.status ?? null,
      outputEnergy: it.outputEnergy ?? null,
    }));
}

/**
 * kWh por dia da usina inteira, dos últimos `dias` dias.
 *
 * 🪤 DUAS armadilhas da API estão tratadas aqui — as duas destroem dado em
 * SILÊNCIO, nenhuma dá erro:
 *
 * 1. **A API troca o TIPO do valor sem avisar.** Janela que inclui HOJE volta
 *    ACUMULADO (0, 12.9, 19.4, 28.0 — só cresce); janela de mês passado volta
 *    DIÁRIO (18.6, 19.6, 17.6 — sobe e desce). Medido no mesmo inversor, no
 *    mesmo dia. `paraDiario` DETECTA qual das duas veio; assumir uma só derrubou
 *    o José Carlos de 5.045 para 880 kWh na origem.
 *
 * 2. **O primeiro ponto da janela é a RÉGUA, não um dia.** Quando a resposta é
 *    acumulada o primeiro ponto vem `0` — é o marco zero do período. Por isso
 *    pedimos sempre UM DIA A MAIS para trás (o dia-âncora) e o descartamos: sem
 *    isso, com janela deslizante, cada execução zera um dia novo e o histórico é
 *    corroído um dia por vez.
 *
 * ⚠️ Limite conhecido (armadilha 5.4 do handoff, sem correção possível do lado
 * de fora): quando o inversor fica offline a API OMITE aqueles dias, e a energia
 * do buraco aparece toda no primeiro dia em que ele voltou. O total fica certo,
 * a distribuição por dia não.
 */
export async function getDailyEnergy(plantId: string, dias: number = 30): Promise<WegDailyEnergy[]> {
  const hoje = new Date();
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const inicio = new Date(fim.getTime() - (dias - 1) * DIA_MS);

  const acumulador = new Map<string, number>();

  let iniBloco = inicio;
  while (iniBloco.getTime() <= fim.getTime()) {
    const fimBloco = new Date(Math.min(iniBloco.getTime() + (BLOCO_DIAS - 1) * DIA_MS, fim.getTime()));
    const ancora = new Date(iniBloco.getTime() - DIA_MS);

    const d = await wegFetch<{ data?: { time?: string; value?: number }[] }>("/measurements", {
      dateFrom: `${isoDia(ancora)}T00:00:00.000Z`,
      dateTo: `${isoDia(fimBloco)}T23:59:59.000Z`,
      groupBy: String(DIA_MS),
      variables: "outputEnergy",
      // 🔑 `plantId` é OBRIGATÓRIO — sem ele a API responde 200 e nunca vem dado.
      plantId,
    });

    const pontos = d?.data;
    if (Array.isArray(pontos) && pontos.length > 0) {
      const diario = paraDiario(pontos);
      const corte = isoDia(iniBloco);
      for (const [dia, kwh] of diario) {
        if (dia >= corte) acumulador.set(dia, kwh); // descarta o dia-âncora
      }
    }

    iniBloco = new Date(fimBloco.getTime() + DIA_MS);
  }

  return [...acumulador.entries()]
    .map(([dia, kwh]) => ({ dia, kwh }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Normaliza para kWh/dia aceitando as DUAS formas que a API usa.
 *
 * A detecção: se os valores nunca decrescem ao longo do período, é acumulado
 * (uma série diária real sobe e desce). Nesse caso o diário é a diferença entre
 * dias consecutivos — e o primeiro ponto sai naturalmente por não ter antecessor.
 */
export function paraDiario(pontos: { time?: string; value?: number }[]): Map<string, number> {
  const serie: [string, number][] = [];
  for (const p of pontos) {
    const dia = typeof p.time === "string" ? p.time.slice(0, 10) : null;
    const valor = typeof p.value === "number" ? p.value : Number(p.value);
    if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || !Number.isFinite(valor)) continue;
    serie.push([dia, valor]);
  }
  if (serie.length === 0) return new Map();

  serie.sort((a, b) => a[0].localeCompare(b[0])); // a API devolve DESCENDENTE

  const valores = serie.map(([, v]) => v);
  const acumulado =
    valores.length > 2 && valores.every((v, i) => i === 0 || valores[i - 1] <= v + 1e-6);

  const saida = new Map<string, number>();

  if (!acumulado) {
    for (const [dia, v] of serie) saida.set(dia, arredonda(v));
    return saida;
  }

  for (let i = 1; i < serie.length; i++) {
    const delta = serie[i][1] - serie[i - 1][1];
    saida.set(serie[i][0], arredonda(Math.max(delta, 0)));
  }
  return saida;
}

function arredonda(v: number): number {
  return Math.round(v * 1000) / 1000;
}
