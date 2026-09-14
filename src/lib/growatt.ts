/**
 * Growatt OpenAPI v1 Client (openapi.growatt.com)
 *
 * Auth: header `token` (32 chars, emitido no OSS em System Setting → System
 * Management → API management, servidor "Growatt Server"). NÃO é usuário/senha —
 * o login do OSS é web/captcha e vive num namespace separado do `server.growatt.com`.
 *
 * Convenções confirmadas contra a API em 08/08/2026 (token da Rede Brasil Solar):
 *   - Método é SEMPRE GET; POST devolve 405 nesses endpoints.
 *   - O header de auth é `token`.
 *   - error_code === 0 é sucesso; qualquer outro valor é erro (mensagem em error_msg).
 *   - A API só enxerga plantas EXPLICITAMENTE vinculadas ao token ("Number of Device"
 *     no OSS). Token novo nasce com 0 devices e `/v1/plant/list` volta vazio — não é
 *     bug do código, é o vínculo que falta no portal.
 *
 * Endpoints validados (path + método + parâmetro obrigatório):
 *   GET /v1/plant/list            ?page=&perpage=
 *   GET /v1/plant/energy          ?plant_id=&start_date=&end_date=&time_unit=day|month|year
 *   GET /v1/plant/data            ?plant_id=&date=
 *   GET /v1/plant/details         ?plant_id=
 *   GET /v1/plant/power           ?plant_id=&date=     (potência intradiária)
 *   GET /v1/device/list           ?plant_id=
 *   GET /v1/user/c_user_list      ?page=&perpage=      (clientes do distribuidor)
 *
 * ⚠️ As GRAFIAS dos campos de resposta (snake_case) seguem a doc v1, mas não pude
 * conferir contra dado real porque o token está com 0 devices. O parsing abaixo é
 * defensivo (optional chaining + fallback de nomes + coerção string→número). Quando
 * a primeira usina for vinculada, revalidar `energys[].energy`, `peak_power` etc.
 */

const GROWATT_BASE_URL = process.env.GROWATT_BASE_URL || "https://openapi.growatt.com";

export class GrowattApiError extends Error {
  constructor(
    public errorCode: number,
    message: string,
    public endpoint: string,
  ) {
    super(message);
    this.name = "GrowattApiError";
  }
}

/**
 * Tokens da OpenAPI, em ordem de prioridade.
 *
 * 🔑 UM token enxerga UMA árvore de conta — e só ela. Descoberto em 14/09/2026:
 * a planta `816770` (Márcio Alexandre, datalogger DXH5BH9016) estava viva,
 * gerando, com o MESMO Agent Code `BAJXC` da nossa conta, e mesmo assim nunca
 * apareceu no "Importar Plantas". O motivo não era vínculo faltando no OSS: a
 * conta dela é um login de **Plant Manager** separado, com token próprio. O
 * nosso token devolvia `10011 permission_denied` para ela e `plant/list` com
 * 80 plantas — a usina simplesmente não existia para a API que a gente
 * consultava. Agent Code é etiqueta comercial, NÃO funde as árvores.
 *
 * Por isso `GROWATT_TOKEN` aceita vários tokens separados por vírgula (ou
 * ponto-e-vírgula / quebra de linha). Com um token só, nada muda: nenhuma
 * chamada extra é feita e o caminho é idêntico ao de antes.
 */
export function getGrowattTokens(): string[] {
  const bruto = process.env.GROWATT_TOKEN ?? "";
  const tokens = [...new Set(bruto.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean))];
  if (tokens.length === 0) {
    throw new Error(
      "Credencial Growatt nao configurada. Defina GROWATT_TOKEN no .env (token da OpenAPI, servidor openapi.growatt.com). Aceita mais de um, separados por virgula.",
    );
  }
  return tokens;
}

/** Growatt devolve números como string com frequência ("12.3", "1,234.5"). */
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** YYYY-MM-DD em horário local — a API trabalha em datas-calendário. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface GrowattEnvelope<T> {
  error_code: number;
  error_msg?: string;
  data: T;
}

async function growattFetch<T>(
  path: string,
  params: Record<string, string | number> = {},
  token?: string,
): Promise<T> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `${GROWATT_BASE_URL}${path}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { token: token ?? getGrowattTokens()[0] },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GrowattApiError(res.status, `Growatt API HTTP ${res.status}: ${body.slice(0, 200)}`, path);
  }

  const json = (await res.json()) as GrowattEnvelope<T>;

  if (json.error_code !== 0) {
    throw new GrowattApiError(
      json.error_code,
      `Growatt API erro ${json.error_code} em ${path}: ${json.error_msg || "sem mensagem"}`,
      path,
    );
  }

  return json.data;
}

// ============================================================
// Tipos
// ============================================================

export interface GrowattPlant {
  plantId: string;
  name: string;
  capacityKwp: number;
  totalEnergyKwh: number;
  currentPowerKw: number;
  city?: string;
  country?: string;
  createDate?: string;
  status?: number;
}

export interface DailyGeneration {
  day: number;
  date: Date;
  energyKwh: number;
}

export interface PlantStatus {
  plantId: string;
  isOnline: boolean;
  dayPowerKwh: number;
  monthPowerKwh: number;
  totalPowerKwh: number;
  currentPowerKw: number;
  capacityKwp: number;
}

// Formas cruas da resposta (parseadas defensivamente).
interface RawPlantListItem {
  plant_id?: string | number;
  id?: string | number;
  name?: string;
  plant_name?: string;
  peak_power?: string | number;
  nominal_power?: string | number;
  total_energy?: string | number;
  current_power?: string | number;
  city?: string;
  country?: string;
  create_date?: string;
  status?: string | number;
}

interface RawEnergyItem {
  date?: string;
  time?: string;
  energy?: string | number;
}

// ============================================================
// Funções da API
// ============================================================

function mapPlant(raw: RawPlantListItem): GrowattPlant {
  return {
    plantId: String(raw.plant_id ?? raw.id ?? ""),
    name: raw.name ?? raw.plant_name ?? "",
    capacityKwp: num(raw.peak_power ?? raw.nominal_power),
    totalEnergyKwh: num(raw.total_energy),
    currentPowerKw: num(raw.current_power),
    city: raw.city,
    country: raw.country,
    createDate: raw.create_date,
    status: raw.status != null ? num(raw.status) : undefined,
  };
}

/** Uma página da lista de plantas de UM token. */
export async function getPlantList(page = 1, perpage = 100, token?: string): Promise<{
  plants: GrowattPlant[];
  count: number;
}> {
  const data = await growattFetch<{ count?: number; plants?: RawPlantListItem[] }>(
    "/v1/plant/list",
    { page, perpage },
    token,
  );
  return {
    plants: (data.plants ?? []).map(mapPlant),
    count: num(data.count),
  };
}

/**
 * `perpage` alternativos para escapar do `10012 error_frequently_access`.
 *
 * O 10012 é um debounce sobre a requisição IDÊNTICA (mesma interface, mesmos
 * parâmetros), não uma cota por tempo — medido em 12 e 14/08/2026. Trocar o
 * `perpage` muda a requisição e passa; repetir a mesma três vezes não.
 */
const PERPAGES = [100, 97, 93];

/** Todas as plantas de UM token (pagina até esgotar, com fuga do 10012). */
async function listarPlantasDoToken(token: string): Promise<GrowattPlant[]> {
  let ultimoErro: unknown = new Error("Growatt nao respondeu");

  for (const perpage of PERPAGES) {
    try {
      const all: GrowattPlant[] = [];
      let page = 1;
      // Guarda-chuva contra loop: no máx 50 páginas (5.000 plantas).
      for (let i = 0; i < 50; i++) {
        const { plants, count } = await getPlantList(page, perpage, token);
        all.push(...plants);
        if (all.length >= count || plants.length === 0) break;
        page++;
      }
      return all;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Só o 10012 justifica outra tentativa. Token errado ou cluster errado
      // (10011) repetiria três vezes o mesmo erro à toa.
      if (!msg.includes("10012")) throw e;
      ultimoErro = e;
    }
  }

  throw ultimoErro;
}

/**
 * Todas as plantas de TODOS os tokens, deduplicadas por `plantId`.
 *
 * ⚠️ Um token que falha NÃO derruba os outros: a lista sai com o que deu para
 * ler e o erro vai em `tokensComFalha`. Quem importa precisa saber que a volta
 * está incompleta — senão uma conta fora do ar viraria "planta sumiu da API" e,
 * pior, candidata a desativação. Ver [[project_import_plantas_rebaixa_status]].
 */
export async function getAllPlantsPorToken(): Promise<{
  plants: GrowattPlant[];
  tokensLidos: number;
  tokensComFalha: string[];
}> {
  const tokens = getGrowattTokens();
  const porId = new Map<string, GrowattPlant>();
  const mapa = new Map<string, string>();
  const tokensComFalha: string[] = [];
  let tokensLidos = 0;

  for (const token of tokens) {
    try {
      const plantas = await listarPlantasDoToken(token);
      tokensLidos++;
      for (const p of plantas) {
        if (!p.plantId) continue;
        if (!porId.has(p.plantId)) porId.set(p.plantId, p);
        if (!mapa.has(p.plantId)) mapa.set(p.plantId, token);
      }
    } catch (e) {
      tokensComFalha.push(`${apelidoToken(token)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Aproveita a varredura: o mapa planta→token acabou de ser levantado.
  if (tokensLidos > 0) gravarMapa(mapa, tokensComFalha.length === 0);

  return { plants: [...porId.values()], tokensLidos, tokensComFalha };
}

/** Todas as plantas de todos os tokens. Mantido para quem só quer a lista. */
export async function getAllPlants(): Promise<GrowattPlant[]> {
  const { plants } = await getAllPlantsPorToken();
  return plants;
}

// ============================================================
// Qual token atende qual planta
//
// Cada chamada da Growatt é por planta, e cada planta pertence a UMA árvore de
// conta. Com um token só isto é inerte (retorna direto, zero chamadas). Com
// dois ou mais, o mapa planta→token é levantado uma vez e reaproveitado.
// ============================================================

const MAPA_TTL_MS = 30 * 60 * 1000;
/** TTL curto quando algum token falhou: o buraco tem que se fechar sozinho. */
const MAPA_TTL_PARCIAL_MS = 2 * 60 * 1000;
/** Piso entre releituras forçadas, para planta desconhecida não virar enxurrada. */
const MAPA_FORCE_MIN_MS = 5 * 60 * 1000;

let mapaPlantaToken: Map<string, string> | null = null;
let mapaExpiraEm = 0;
let mapaUltimoForce = 0;
let mapaEmVoo: Promise<Map<string, string>> | null = null;

function gravarMapa(mapa: Map<string, string>, completo: boolean) {
  mapaPlantaToken = mapa;
  mapaExpiraEm = Date.now() + (completo ? MAPA_TTL_MS : MAPA_TTL_PARCIAL_MS);
}

/** Primeiros 4 caracteres — identifica o token no log sem vazar a credencial. */
function apelidoToken(token: string): string {
  return `token ${token.slice(0, 4)}…`;
}

async function mapaDePlantas(forcar = false): Promise<Map<string, string>> {
  if (!forcar && mapaPlantaToken && Date.now() < mapaExpiraEm) return mapaPlantaToken;
  // Uma varredura só, mesmo com o lote inteiro pedindo ao mesmo tempo.
  if (mapaEmVoo) return mapaEmVoo;

  mapaEmVoo = (async () => {
    const mapa = new Map<string, string>();
    let completo = true;
    for (const token of getGrowattTokens()) {
      try {
        for (const p of await listarPlantasDoToken(token)) {
          if (p.plantId && !mapa.has(p.plantId)) mapa.set(p.plantId, token);
        }
      } catch {
        // Um token fora do ar não pode apagar o mapa dos outros — mas encurta
        // o TTL, para as plantas dele voltarem sozinhas na próxima rodada.
        completo = false;
      }
    }
    gravarMapa(mapa, completo);
    return mapa;
  })();

  try {
    return await mapaEmVoo;
  } finally {
    mapaEmVoo = null;
  }
}

/**
 * O token que atende esta planta.
 *
 * Com UM token configurado devolve na hora, sem tocar na API — o caminho de
 * hoje continua idêntico. Com vários, consulta o mapa; planta desconhecida
 * força UMA releitura (respeitando o piso) antes de desistir, porque usina
 * recém-cadastrada no portal é o caso normal.
 */
export async function tokenDaPlanta(plantId: string): Promise<string> {
  const tokens = getGrowattTokens();
  if (tokens.length === 1) return tokens[0];

  const id = String(plantId);
  const mapa = await mapaDePlantas();
  const achado = mapa.get(id);
  if (achado) return achado;

  if (Date.now() - mapaUltimoForce > MAPA_FORCE_MIN_MS) {
    mapaUltimoForce = Date.now();
    const fresco = await mapaDePlantas(true);
    const segundo = fresco.get(id);
    if (segundo) return segundo;
  }

  throw new GrowattApiError(
    10011,
    `Growatt: a planta ${id} nao pertence a nenhum dos ${tokens.length} tokens configurados. ` +
      "Confira se a conta dela tem token proprio e se ele esta em GROWATT_TOKEN.",
    "/v1/plant/list",
  );
}

/**
 * Geração diária de um mês calendário via /v1/plant/energy (time_unit=day).
 * Retorna [] se a planta não tiver dado no período.
 *
 * ⚠️ A API limita time_unit=day a **7 dias por chamada** — um mês inteiro devolve
 * `10004 "error_time format is incorrect"` (mensagem enganosa; é teto de range,
 * confirmado em 09/08/2026). Por isso fatiamos o mês em janelas de até 7 dias.
 */
export async function getDailyGeneration(
  plantId: string,
  year: number,
  month: number,
): Promise<DailyGeneration[]> {
  const token = await tokenDaPlanta(plantId);
  const lastDay = new Date(year, month, 0).getDate(); // último dia do mês
  const out: DailyGeneration[] = [];

  for (let d0 = 1; d0 <= lastDay; d0 += 7) {
    const d1 = Math.min(d0 + 6, lastDay); // janela inclusiva de ≤7 dias
    const data = await growattFetch<{ energys?: RawEnergyItem[] }>(
      "/v1/plant/energy",
      {
        plant_id: plantId,
        start_date: ymd(new Date(year, month - 1, d0)),
        end_date: ymd(new Date(year, month - 1, d1)),
        time_unit: "day",
      },
      token,
    );

    for (const item of data.energys ?? []) {
      const dateStr = item.date ?? item.time;
      if (!dateStr) continue;
      const parsed = new Date(`${dateStr}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) continue;
      out.push({
        day: parsed.getDate(),
        date: parsed,
        energyKwh: num(item.energy),
      });
    }
  }
  return out;
}

/** Geração total de um mês (soma dos dias). */
export async function getMonthlyTotal(
  plantId: string,
  year: number,
  month: number,
): Promise<{ totalKwh: number; days: number }> {
  const daily = await getDailyGeneration(plantId, year, month);
  return {
    totalKwh: daily.reduce((s, d) => s + d.energyKwh, 0),
    days: daily.length,
  };
}

/**
 * Geração total dentro de um intervalo arbitrário [dateStart, dateEnd) —
 * alinha o inversor ao ciclo de leitura do medidor. Mesmo contrato de
 * fronius/huawei/sungrow/solaredge (usado por geracao-inversor.ts).
 */
export async function getRangeTotal(
  plantId: string,
  dateStart: Date,
  dateEnd: Date,
): Promise<{ totalKwh: number; days: number }> {
  const { sumDailyInRange } = await import("./inverter-range");
  return sumDailyInRange(dateStart, dateEnd, (year, month) =>
    getDailyGeneration(plantId, year, month),
  );
}

/** Geração mensal de um ano via time_unit=month. */
export async function getMonthlyGeneration(
  plantId: string,
  year: number,
): Promise<{ month: number; totalKwh: number }[]> {
  const data = await growattFetch<{ energys?: RawEnergyItem[] }>(
    "/v1/plant/energy",
    {
      plant_id: plantId,
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      time_unit: "month",
    },
    await tokenDaPlanta(plantId),
  );

  const out: { month: number; totalKwh: number }[] = [];
  for (const item of data.energys ?? []) {
    const dateStr = item.date ?? item.time;
    if (!dateStr) continue;
    // time_unit=month costuma vir "YYYY-MM"
    const m = parseInt(dateStr.split("-")[1] ?? "", 10);
    if (Number.isNaN(m)) continue;
    out.push({ month: m, totalKwh: num(item.energy) });
  }
  return out;
}

// ============================================================
// Versões em lote
//
// A Growatt não tem rota de frota (cada chamada é uma planta), então o lote é
// concorrência controlada, igual ao da Fronius. Existem porque o
// `sync-all/refresh` só sabia falar com quatro plataformas: as usinas Growatt
// ficavam de fora da atualização de geração e status e apareciam paradas na
// lista mesmo gerando.
// ============================================================

const MAX_CONCURRENT = 5;
const BATCH_DELAY_MS = 300;

async function emLote<T>(
  ids: string[],
  fn: (id: string) => Promise<T>,
  aoFalhar: (id: string) => T,
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  for (let i = 0; i < ids.length; i += MAX_CONCURRENT) {
    const bloco = ids.slice(i, i + MAX_CONCURRENT);
    await Promise.all(
      bloco.map(async (id) => {
        try {
          results.set(id, await fn(id));
        } catch {
          results.set(id, aoFalhar(id));
        }
      }),
    );
    if (i + MAX_CONCURRENT < ids.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return results;
}

/** Geração diária de um mês, em lote. Mesmo contrato das outras plataformas. */
export async function getDailyGenerationBatch(
  plantIds: string[],
  year: number,
  month: number,
): Promise<Map<string, DailyGeneration[]>> {
  return emLote(
    plantIds,
    (id) => getDailyGeneration(id, year, month),
    () => [],
  );
}

/** Status em tempo real, em lote. Mesmo contrato das outras plataformas. */
export async function getPlantStatusBatch(
  plantIds: string[],
): Promise<Map<string, PlantStatus>> {
  return emLote(plantIds, getPlantStatus, (plantId) => ({
    plantId,
    isOnline: false,
    dayPowerKwh: 0,
    monthPowerKwh: 0,
    totalPowerKwh: 0,
    currentPowerKw: 0,
    capacityKwp: 0,
  }));
}

/**
 * Status consolidado de uma planta via /v1/plant/data. Campos confirmados em
 * 09/08/2026: current_power, today_energy, monthly_energy, yearly_energy,
 * total_energy, peak_power_actual, last_update_time.
 *
 * ⚠️ Unidade de `current_power` em plant/data ainda não confirmada com valor > 0
 * (as amostras estavam offline). O intradiário /v1/plant/power é WATT; se este
 * também for, manter. `getPlantStatus` não está no caminho de cobrança.
 */
export async function getPlantStatus(plantId: string): Promise<PlantStatus> {
  const data = await growattFetch<Record<string, unknown>>(
    "/v1/plant/data",
    { plant_id: plantId, date: ymd(new Date()) },
    await tokenDaPlanta(plantId),
  );

  const currentPowerKw = num(data.current_power);
  return {
    plantId,
    // A v1 não expõe flag de online confiável; derivamos de potência atual > 0.
    isOnline: currentPowerKw > 0,
    dayPowerKwh: num(data.today_energy),
    monthPowerKwh: num(data.monthly_energy),
    totalPowerKwh: num(data.total_energy),
    currentPowerKw,
    capacityKwp: num(data.peak_power_actual ?? data.peak_power),
  };
}
