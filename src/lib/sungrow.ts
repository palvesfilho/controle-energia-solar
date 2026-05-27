/**
 * Sungrow iSolarCloud API Client
 * Base URL: https://gateway.isolarcloud.com
 * Auth: AppKey + Login (user_account + user_password) -> token
 *
 * Documentação: iSolarCloud OpenAPI
 */

const SUNGROW_BASE_URL = process.env.SUNGROW_BASE_URL || "https://gateway.isolarcloud.com";

// Rate limiting
const MAX_CONCURRENT = 3;
const BATCH_DELAY_MS = 300;

// Cache do token (válido por ~2h na iSolarCloud)
let cachedToken: string | null = null;
let cachedUserId: string | null = null;
let tokenExpiresAt = 0;
const TOKEN_TTL_MS = 100 * 60 * 1000; // 100 min (margem de segurança para 2h)

// ============================================================
// Autenticação
// ============================================================

function getCredentials() {
  const appKey = process.env.SUNGROW_APP_KEY;
  const accessKeyValue = process.env.SUNGROW_ACCESS_KEY_VALUE;
  const userAccount = process.env.SUNGROW_USER_ACCOUNT;
  const userPassword = process.env.SUNGROW_USER_PASSWORD;
  const sysCode = process.env.SUNGROW_SYS_CODE || "901";

  if (!appKey || !userAccount || !userPassword) {
    throw new Error(
      "Credenciais Sungrow nao configuradas. Defina SUNGROW_APP_KEY, SUNGROW_USER_ACCOUNT e SUNGROW_USER_PASSWORD no .env"
    );
  }

  if (!accessKeyValue) {
    throw new Error(
      "SUNGROW_ACCESS_KEY_VALUE nao configurado no .env (obrigatorio para a OpenAPI)"
    );
  }

  return { appKey, accessKeyValue, userAccount, userPassword, sysCode };
}

function buildHeaders(accessKeyValue: string, sysCode: string): HeadersInit {
  return {
    "Content-Type": "application/json;charset=UTF-8",
    "x-access-key": accessKeyValue,
    "sys_code": sysCode,
  };
}

export class SungrowApiError extends Error {
  constructor(
    public resultCode: string,
    message: string,
    public endpoint: string,
  ) {
    super(message);
    this.name = "SungrowApiError";
  }
}

/**
 * Faz login na API e retorna o token.
 * O token é cacheado por ~100 minutos.
 */
async function login(): Promise<{ token: string; userId: string }> {
  if (cachedToken && cachedUserId !== null && Date.now() < tokenExpiresAt) {
    return { token: cachedToken, userId: cachedUserId! };
  }

  const { appKey, accessKeyValue, userAccount, userPassword, sysCode } = getCredentials();

  const res = await fetch(`${SUNGROW_BASE_URL}/openapi/login`, {
    method: "POST",
    headers: buildHeaders(accessKeyValue, sysCode),
    body: JSON.stringify({
      appkey: appKey,
      user_account: userAccount,
      user_password: userPassword,
      lang: "_pt_BR",
      sys_code: sysCode,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new SungrowApiError(
      String(res.status),
      `Sungrow login falhou: HTTP ${res.status}`,
      "/userService/login"
    );
  }

  const body = await res.json();

  if (body.result_code !== "1" && body.result_code !== 1) {
    throw new SungrowApiError(
      String(body.result_code),
      `Sungrow login falhou: ${body.result_msg || body.result_code}`,
      "/openapi/login",
    );
  }

  const token = body.result_data?.token;
  const userId = body.result_data?.user_id;

  if (!token) {
    throw new SungrowApiError("-1", "Token nao retornado no login Sungrow", "/openapi/login");
  }

  cachedToken = token;
  cachedUserId = String(userId || "");
  tokenExpiresAt = Date.now() + TOKEN_TTL_MS;

  return { token, userId: cachedUserId };
}

/** Invalida o token cacheado */
export function invalidateToken() {
  cachedToken = null;
  cachedUserId = null;
  tokenExpiresAt = 0;
}

// ============================================================
// Requisições autenticadas
// ============================================================

async function sungrowFetch<T>(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { appKey, accessKeyValue, sysCode } = getCredentials();
  let { token } = await login();

  const doRequest = async (authToken: string) => {
    const res = await fetch(`${SUNGROW_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: buildHeaders(accessKeyValue, sysCode),
      body: JSON.stringify({
        appkey: appKey,
        token: authToken,
        sys_code: sysCode,
        lang: "_pt_BR",
        ...params,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new SungrowApiError(
        String(res.status),
        `Sungrow API ${res.status} em ${endpoint}`,
        endpoint
      );
    }

    return res.json();
  };

  let result = await doRequest(token);

  // Se token expirou (result_code indica sessão expirada), refazer login
  if (result.result_code === "009" || result.result_code === "010" || result.result_code === 9 || result.result_code === 10) {
    invalidateToken();
    const loginResult = await login();
    token = loginResult.token;
    result = await doRequest(token);
  }

  if (result.result_code !== "1" && result.result_code !== 1) {
    throw new SungrowApiError(
      String(result.result_code),
      `Sungrow API erro em ${endpoint}: ${result.result_msg || result.result_code}`,
      endpoint,
    );
  }

  return result as T;
}

// ============================================================
// Tipos
// ============================================================

/**
 * Na OpenAPI v2 muitos campos numericos vem como { unit, value } (string).
 * Helper para extrair valor numerico independente do formato.
 */
type ValueWithUnit = { unit?: string; value?: string | number } | number | string | null | undefined;

function unwrap(v: ValueWithUnit): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v === "object" && "value" in v) {
    const n = Number(v.value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export interface SungrowStation {
  ps_id: string | number;
  ps_name: string;
  ps_short_name?: string;
  ps_type?: number;
  install_date?: string;
  ps_location?: string;
  latitude?: number;
  longitude?: number;
  ps_status?: number;
  connect_type?: number;
  // Campos da OpenAPI v2 (wrapped value+unit)
  total_capcity?: ValueWithUnit;     // capacidade instalada (kW) — com typo do Sungrow
  total_capacity?: ValueWithUnit;    // fallback (alguns endpoints usam sem typo)
  total_energy?: ValueWithUnit;      // kWh acumulado
  today_energy?: ValueWithUnit;      // kWh hoje
  curr_power?: ValueWithUnit;        // W atual
  // Legacy (mantido pra compat)
  design_capacity?: number;
  installed_capacity?: number;
}

interface StationListResponse {
  result_code: string;
  result_msg: string;
  result_data: {
    pageList: SungrowStation[];
    rowCount: number;
    curPage: number;
    pageSize: number;
  };
}

export interface SungrowStationDetail {
  ps_id: string | number;
  ps_name: string;
  ps_key?: string;
  design_capacity: number;       // kWp (plain na detail)
  installed_capacity?: number;
  today_energy: number | ValueWithUnit;
  month_energy: number | ValueWithUnit;
  year_energy: number | ValueWithUnit;
  total_energy: number | ValueWithUnit;
  curr_power: number | ValueWithUnit;
  ps_status: number;
  co2_reduce_total?: number;
  equivalent_hour?: number;
  ps_type?: number;
}

interface StationDetailResponse {
  result_code: string;
  result_msg: string;
  result_data: SungrowStationDetail;
}

export interface SungrowDevice {
  dev_id: string;
  dev_name: string;
  dev_type: number;
  dev_type_name?: string;
  dev_model?: string;
  dev_sn?: string;
  ps_id: string;
  communication_dev_sn?: string;
}

interface DevListResponse {
  result_code: string;
  result_msg: string;
  result_data: {
    pageList: SungrowDevice[];
    rowCount: number;
  };
}

export interface DailyGeneration {
  day: number;
  date: Date;
  energyKwh: number;
  ongridKwh: number | null;
  useKwh: number | null;
  radiation: number | null;
}

/**
 * Sample bruto do `getDevicePointMinuteDataList` (a cada 5 min).
 * `p1` = energia diária acumulada em **Wh** (zera 00h UTC).
 * `p2` = energia lifetime acumulada em **Wh** (não zera).
 */
export interface MinuteDataSample {
  timeStamp: string; // "YYYYMMDDHHmmss" em UTC
  p1: number | null;
  p2: number | null;
}

/** Curva intra-dia subamostrada a cada 30 min (32 samples cobrindo 5h–21h BRT). */
export interface InverterDailySamples {
  psKey: string;
  deviceName: string;
  samples: MinuteDataSample[];
}

export interface PlantStatus {
  psId: string;
  isOnline: boolean;
  currentPowerW: number;
  dayEnergyKwh: number;
  monthEnergyKwh: number;
  yearEnergyKwh: number;
  totalEnergyKwh: number;
  capacityKwp: number;
}

// ============================================================
// Funções da API
// ============================================================

/** Lista todas as plantas da conta (paginado) — OpenAPI v2 */
export async function getStationList(
  curPage = 1,
  pageSize = 100,
): Promise<{ stations: SungrowStation[]; total: number }> {
  const data = await sungrowFetch<StationListResponse>(
    "/openapi/getPowerStationList",
    { curPage, size: pageSize },
  );

  return {
    stations: data.result_data?.pageList ?? [],
    total: data.result_data?.rowCount ?? 0,
  };
}

/** Capacidade instalada em kWp a partir do registro da estacao (lista ou detalhe) */
export function getStationCapacityKwp(station: SungrowStation | SungrowStationDetail): number {
  // Lista (OpenAPI v2): total_capcity (com typo) ja em kW
  const listKw = unwrap((station as SungrowStation).total_capcity)
    ?? unwrap((station as SungrowStation).total_capacity);
  if (listKw && listKw > 0) return listKw;

  // Detail: design_capacity vem em W; converter pra kWp
  const detail = station as SungrowStationDetail;
  const designW = detail.design_capacity ?? detail.installed_capacity;
  if (designW && designW > 0) {
    // Heuristica: valores >= 1000 sao W (ex: 3000W = 3kWp), valores menores ja sao kW
    return designW >= 1000 ? designW / 1000 : designW;
  }
  return 0;
}

/** Lista todas as plantas (todas as páginas) */
export async function getAllStations(): Promise<SungrowStation[]> {
  const allStations: SungrowStation[] = [];
  let curPage = 1;
  const pageSize = 100;

  while (true) {
    const { stations, total } = await getStationList(curPage, pageSize);
    allStations.push(...stations);
    if (allStations.length >= total || stations.length === 0) break;
    curPage++;
  }

  return allStations;
}

/** Detalhes e KPIs em tempo real de uma planta — OpenAPI v2 */
export async function getStationDetail(psId: string): Promise<SungrowStationDetail> {
  const data = await sungrowFetch<StationDetailResponse>(
    "/openapi/getPowerStationDetail",
    { ps_id: psId },
  );

  return data.result_data;
}

interface PVInverterRealTimeResponse {
  result_code: string;
  result_msg: string;
  result_data: {
    device_point_list?: Array<{ device_point: Record<string, string | number | null> }>;
  } | null;
}

/**
 * Lê p1 (today) e p2 (lifetime) atuais de uma lista de inversores (Wh).
 * 1 chamada cobre todos os ps_keys.
 */
async function fetchInvertersRealtime(
  psKeys: string[],
): Promise<Map<string, { p1Wh: number | null; p2Wh: number | null }>> {
  const out = new Map<string, { p1Wh: number | null; p2Wh: number | null }>();
  if (psKeys.length === 0) return out;
  try {
    const data = await sungrowFetch<PVInverterRealTimeResponse>(
      "/openapi/getPVInverterRealTimeData",
      { ps_key_list: psKeys },
    );
    for (const item of data.result_data?.device_point_list ?? []) {
      const dp = item.device_point;
      const psKey = String(dp.ps_key ?? "");
      if (!psKey) continue;
      const p1 = dp.p1 != null ? Number(dp.p1) : null;
      const p2 = dp.p2 != null ? Number(dp.p2) : null;
      out.set(psKey, {
        p1Wh: p1 != null && Number.isFinite(p1) ? p1 : null,
        p2Wh: p2 != null && Number.isFinite(p2) ? p2 : null,
      });
    }
  } catch {
    // chamada falhou — out fica vazio, getPlantStatus tratará como 0
  }
  return out;
}

/**
 * Status consolidado de uma planta.
 *
 * - `dayEnergyKwh` / `totalEnergyKwh`: lidos via real-time dos inversores
 *   (p1 = energia do dia em Wh; p2 = lifetime em Wh).
 * - `monthEnergyKwh` / `yearEnergyKwh` / `currentPowerW`: ficam **0** —
 *   nosso scope de appkey não tem endpoint barato pra esses agregados.
 *   Pra mês/ano, use `getMonthlyTotal` (caro). Pra potência atual, sondar
 *   um point ainda não identificado.
 * - `capacityKwp`: do `getPowerStationDetail`.
 */
export async function getPlantStatus(psId: string): Promise<PlantStatus> {
  const [detail, inverters] = await Promise.all([
    getStationDetail(psId),
    getInvertersForPlant(psId),
  ]);

  const realtime = await fetchInvertersRealtime(inverters.map((i) => i.psKey));

  let dayEnergyWh = 0;
  let totalEnergyWh = 0;
  for (const inv of inverters) {
    const r = realtime.get(inv.psKey);
    if (r?.p1Wh != null) dayEnergyWh += r.p1Wh;
    if (r?.p2Wh != null) totalEnergyWh += r.p2Wh;
  }

  return {
    psId,
    isOnline: detail.ps_status === 1,
    currentPowerW: 0,
    dayEnergyKwh: dayEnergyWh / 1000,
    monthEnergyKwh: 0,
    yearEnergyKwh: 0,
    totalEnergyKwh: totalEnergyWh / 1000,
    capacityKwp: getStationCapacityKwp(detail),
  };
}

// ============================================================
// Coleta via getDevicePointMinuteDataList — escopo limitado do appkey
// não permite getPsReport. Estratégia: ler `p1` (energia diária acumulada
// em Wh, zera 00h UTC) e `p2` (lifetime Wh) em janelas de 3h cobrindo
// 8h–00h UTC = 5h–21h BRT do dia. Pegar último p1 não-nulo do dia = kWh.
// Calibrado em 2026-05-01 contra planta OTHAVIO CECCIM (9.23 kWp / 25.3 kWh).
// ============================================================

interface MinuteDataResponse {
  result_code: string;
  result_msg: string;
  result_data: Record<string, Array<Record<string, string>>> | null;
}

const SAMPLE_POINTS = "p1,p2";
/** Janelas UTC de 3h cobrindo 8h–00h (= 5h–21h BRT, dia útil de geração). */
const DAY_SLICES_UTC: Array<readonly [number, number]> = [
  [8, 11], [11, 14], [14, 17], [17, 20], [20, 23], [23, 24],
];

/** Cache de inversores por planta — TTL longo, raramente mudam. */
const invertersCache = new Map<string, { keys: { psKey: string; name: string }[]; expiresAt: number }>();
const INVERTERS_CACHE_TTL_MS = 60 * 60 * 1000;

async function getInvertersForPlant(psId: string): Promise<{ psKey: string; name: string }[]> {
  const cached = invertersCache.get(psId);
  if (cached && Date.now() < cached.expiresAt) return cached.keys;

  const devs = await getDeviceList(psId);
  const inverters = devs
    .filter((d) => Number((d as unknown as { device_type?: number }).device_type ?? d.dev_type) === 1)
    .map((d) => {
      const raw = d as unknown as { ps_key?: string; device_name?: string };
      return {
        psKey: String(raw.ps_key ?? ""),
        name: String(raw.device_name ?? d.dev_name ?? ""),
      };
    })
    .filter((d) => d.psKey.length > 0);

  invertersCache.set(psId, { keys: inverters, expiresAt: Date.now() + INVERTERS_CACHE_TTL_MS });
  return inverters;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
function utcDayTimestamp(year: number, month: number, day: number, hour: number, minute = 0): string {
  // Sungrow trata como UTC. Quando hour=24, normaliza pra 00h do dia seguinte.
  if (hour >= 24) {
    const d = new Date(Date.UTC(year, month - 1, day + 1, hour - 24, minute, 0));
    return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00`;
  }
  return `${year}${pad2(month)}${pad2(day)}${pad2(hour)}${pad2(minute)}00`;
}

/** Coleta as 6 fatias UTC de 8h–00h pra um inversor num dia. Resiliente a falha pontual. */
async function collectInverterDay(
  psKey: string,
  year: number,
  month: number,
  day: number,
): Promise<MinuteDataSample[]> {
  const all: MinuteDataSample[] = [];
  for (const [h0, h1] of DAY_SLICES_UTC) {
    try {
      const data = await sungrowFetch<MinuteDataResponse>(
        "/openapi/getDevicePointMinuteDataList",
        {
          ps_key_list: [psKey],
          points: SAMPLE_POINTS,
          start_time_stamp: utcDayTimestamp(year, month, day, h0),
          end_time_stamp: utcDayTimestamp(year, month, day, h1),
        },
      );
      const list = data.result_data?.[psKey] ?? [];
      for (const s of list) {
        all.push({
          timeStamp: String(s.time_stamp ?? ""),
          p1: s.p1 != null ? Number(s.p1) : null,
          p2: s.p2 != null ? Number(s.p2) : null,
        });
      }
    } catch {
      // ignora fatia que falhou — o resto do dia segue
    }
  }
  // Dedup por time_stamp (fatias se sobrepõem nos limites)
  const seen = new Set<string>();
  return all.filter((s) => (seen.has(s.timeStamp) ? false : (seen.add(s.timeStamp), true)))
    .sort((a, b) => a.timeStamp.localeCompare(b.timeStamp));
}

/** Filtra samples a cada 30 min (timestamps :00 e :30) — 32 amostras esperadas. */
function subsample30Min(samples: MinuteDataSample[]): MinuteDataSample[] {
  return samples.filter((s) => {
    const mm = s.timeStamp.substring(10, 12);
    return mm === "00" || mm === "30";
  });
}

/** Último p1 não-nulo do dia = energia diária total (Wh) → kWh. */
function dailyKwhFromSamples(samples: MinuteDataSample[]): number {
  for (let i = samples.length - 1; i >= 0; i--) {
    const p1 = samples[i].p1;
    if (p1 != null && Number.isFinite(p1) && p1 > 0) return p1 / 1000;
  }
  return 0;
}

/**
 * Curva intra-dia de cada inversor (32 samples a cada 30 min, 5h–21h BRT).
 * Use pra exibir gráfico de geração no app. Não faz agregação por planta.
 */
export async function getDailySamples(
  psId: string,
  year: number,
  month: number,
  day: number,
): Promise<InverterDailySamples[]> {
  const inverters = await getInvertersForPlant(psId);
  const out: InverterDailySamples[] = [];
  for (let i = 0; i < inverters.length; i += MAX_CONCURRENT) {
    const batch = inverters.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.all(
      batch.map(async (inv) => ({
        psKey: inv.psKey,
        deviceName: inv.name,
        samples: subsample30Min(await collectInverterDay(inv.psKey, year, month, day)),
      })),
    );
    out.push(...results);
    if (i + MAX_CONCURRENT < inverters.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return out;
}

/**
 * Geração diária de um mês para uma planta.
 * Soma o p1 final do dia de todos inversores. Pula dias futuros.
 */
export async function getDailyGeneration(
  psId: string,
  year: number,
  month: number,
): Promise<DailyGeneration[]> {
  const inverters = await getInvertersForPlant(psId);
  if (inverters.length === 0) return [];

  const lastDay = new Date(year, month, 0).getDate();
  const today = new Date();
  const isFuture = (d: number) => {
    const dt = new Date(year, month - 1, d);
    return dt > today;
  };

  // Pra cada dia (em paralelo limitado), pra cada inversor (sequencial dentro do dia),
  // coletar e somar p1 final. O paralelismo entre dias respeita MAX_CONCURRENT.
  const days = Array.from({ length: lastDay }, (_, i) => i + 1).filter((d) => !isFuture(d));
  const out: DailyGeneration[] = [];

  for (let i = 0; i < days.length; i += MAX_CONCURRENT) {
    const batch = days.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.all(
      batch.map(async (d) => {
        let kwh = 0;
        for (const inv of inverters) {
          const samples = await collectInverterDay(inv.psKey, year, month, d);
          kwh += dailyKwhFromSamples(samples);
        }
        return { day: d, kwh };
      }),
    );
    for (const { day, kwh } of results) {
      if (kwh > 0) {
        out.push({
          day,
          date: new Date(Date.UTC(year, month - 1, day, 12, 0, 0)),
          energyKwh: kwh,
          ongridKwh: null,
          useKwh: null,
          radiation: null,
        });
      }
    }
    if (i + MAX_CONCURRENT < days.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return out.sort((a, b) => a.day - b.day);
}

/** Geração total de um mês (soma dos dias) */
export async function getMonthlyTotal(
  psId: string,
  year: number,
  month: number,
): Promise<{ totalKwh: number; days: number }> {
  const daily = await getDailyGeneration(psId, year, month);
  const totalKwh = daily.reduce((sum, d) => sum + d.energyKwh, 0);
  return { totalKwh, days: daily.length };
}

/**
 * Geração total dentro de um intervalo arbitrário [dateStart, dateEnd).
 * Alinha o inversor ao ciclo de leitura do medidor da distribuidora.
 */
export async function getRangeTotal(
  psId: string,
  dateStart: Date,
  dateEnd: Date,
): Promise<{ totalKwh: number; days: number }> {
  const { sumDailyInRange } = await import("./inverter-range");
  return sumDailyInRange(dateStart, dateEnd, (year, month) =>
    getDailyGeneration(psId, year, month),
  );
}

/**
 * Geração mensal de um ano. Soma cada mês via getMonthlyTotal —
 * caro (12 × 30 dias × 6 chamadas), use com parcimônia.
 */
export async function getMonthlyGeneration(
  psId: string,
  year: number,
): Promise<{ month: number; totalKwh: number; ongridKwh: number | null }[]> {
  const out: { month: number; totalKwh: number; ongridKwh: number | null }[] = [];
  for (let m = 1; m <= 12; m++) {
    const { totalKwh } = await getMonthlyTotal(psId, year, m);
    if (totalKwh > 0) out.push({ month: m, totalKwh, ongridKwh: null });
  }
  return out;
}

/** Lista dispositivos (inversores) de uma planta — OpenAPI v2 */
export async function getDeviceList(psId: string): Promise<SungrowDevice[]> {
  const data = await sungrowFetch<DevListResponse>(
    "/openapi/getDeviceList",
    { ps_id: psId, curPage: 1, size: 200 },
  );

  return data.result_data?.pageList ?? [];
}

// ============================================================
// Falhas / faults — endpoint /devService/getFaultList
// Resposta tipica: { fault_code, fault_name, fault_level, fault_time_stamp, dev_id, deal_status }
// deal_status: 1=open, 2=processed/resolved
// ============================================================

interface SungrowFault {
  fault_code?: string | number;
  fault_name?: string;
  fault_level?: string | number;
  fault_time_stamp?: string | number;
  dev_id?: string | number;
  deal_status?: number | string;
}

interface FaultListResponse {
  result_code: string;
  result_msg: string;
  result_data: {
    pageList?: SungrowFault[];
    rowCount?: number;
  } | null;
}

/**
 * Falhas ativas de uma planta. Filtra deal_status=1 (não resolvidas).
 * Em caso de erro na API, retorna [].
 */
export async function getActiveAlerts(
  psId: string,
): Promise<import("./inverter-errors").InverterErrorEvent[]> {
  try {
    const data = await sungrowFetch<FaultListResponse>(
      "/v1/devService/getFaultList",
      {
        ps_id: psId,
        curPage: 1,
        size: 50,
        deal_status: 1,
      },
    );
    const out: import("./inverter-errors").InverterErrorEvent[] = [];
    for (const f of data.result_data?.pageList ?? []) {
      if (
        typeof f.deal_status === "number"
          ? f.deal_status !== 1
          : f.deal_status != null && String(f.deal_status) !== "1"
      ) {
        continue;
      }
      const codigo =
        f.fault_code != null && String(f.fault_code).trim().length > 0
          ? String(f.fault_code).trim()
          : null;
      if (!codigo) continue;

      let abertoEm: Date | null = null;
      if (f.fault_time_stamp != null) {
        const ts = Number(f.fault_time_stamp);
        if (!Number.isNaN(ts) && ts > 0) {
          abertoEm = new Date(ts > 1e12 ? ts : ts * 1000);
        }
      }

      out.push({
        codigo,
        descricao: f.fault_name ?? null,
        severidadeFabricante:
          f.fault_level != null ? String(f.fault_level) : null,
        abertoEm,
        externalId: f.dev_id != null ? `${f.dev_id}-${codigo}` : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function getActiveAlertsBatch(
  psIds: string[],
): Promise<Map<string, import("./inverter-errors").InverterErrorEvent[]>> {
  const results = new Map<
    string,
    import("./inverter-errors").InverterErrorEvent[]
  >();

  for (let i = 0; i < psIds.length; i += MAX_CONCURRENT) {
    const batch = psIds.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (id) => {
      const events = await getActiveAlerts(id);
      results.set(id, events);
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < psIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/** Busca geração diária em lote com controle de concorrência */
export async function getDailyGenerationBatch(
  psIds: string[],
  year: number,
  month: number,
): Promise<Map<string, DailyGeneration[]>> {
  const results = new Map<string, DailyGeneration[]>();

  for (let i = 0; i < psIds.length; i += MAX_CONCURRENT) {
    const batch = psIds.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (psId) => {
      try {
        const daily = await getDailyGeneration(psId, year, month);
        results.set(psId, daily);
      } catch {
        results.set(psId, []);
      }
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < psIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/** Busca status em lote */
export async function getPlantStatusBatch(
  psIds: string[],
): Promise<Map<string, PlantStatus>> {
  const results = new Map<string, PlantStatus>();

  for (let i = 0; i < psIds.length; i += MAX_CONCURRENT) {
    const batch = psIds.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (psId) => {
      try {
        const status = await getPlantStatus(psId);
        results.set(psId, status);
      } catch {
        results.set(psId, {
          psId,
          isOnline: false,
          currentPowerW: 0,
          dayEnergyKwh: 0,
          monthEnergyKwh: 0,
          yearEnergyKwh: 0,
          totalEnergyKwh: 0,
          capacityKwp: 0,
        });
      }
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < psIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}
