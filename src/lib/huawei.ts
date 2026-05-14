/**
 * Huawei FusionSolar Northbound API Client
 * Base URL: https://la5.fusionsolar.huawei.com/thirdData
 * Auth: Login com userName + systemCode -> XSRF-TOKEN via cookie
 *
 * Documentação: FusionSolar Northbound Interface Reference v6
 */

const HUAWEI_BASE_URL = process.env.HUAWEI_BASE_URL || "https://la5.fusionsolar.huawei.com";
const THIRD_DATA_URL = `${HUAWEI_BASE_URL}/thirdData`;

// Rate limiting
const MAX_CONCURRENT = 3;
const BATCH_DELAY_MS = 300;

// Cache do token XSRF (válido por ~30 min)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
const TOKEN_TTL_MS = 25 * 60 * 1000; // 25 min (margem de segurança)

// ============================================================
// Autenticação
// ============================================================

function getCredentials() {
  const userName = process.env.HUAWEI_USERNAME;
  const systemCode = process.env.HUAWEI_PASSWORD;

  if (!userName || !systemCode) {
    throw new Error(
      "Credenciais Huawei nao configuradas. Defina HUAWEI_USERNAME e HUAWEI_PASSWORD no .env"
    );
  }

  return { userName, systemCode };
}

export class HuaweiApiError extends Error {
  constructor(
    public failCode: number,
    message: string,
    public endpoint: string,
  ) {
    super(message);
    this.name = "HuaweiApiError";
  }
}

/**
 * Faz login na API e retorna o XSRF-TOKEN.
 * O token é cacheado por 25 minutos.
 */
async function login(): Promise<string> {
  // Retornar token cacheado se ainda válido
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const { userName, systemCode } = getCredentials();

  const res = await fetch(`${THIRD_DATA_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName, systemCode }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new HuaweiApiError(res.status, `Huawei login falhou: HTTP ${res.status}`, "/login");
  }

  const body = await res.json();

  if (body.failCode !== 0 && body.success === false) {
    throw new HuaweiApiError(
      body.failCode ?? -1,
      `Huawei login falhou: ${body.message || body.failCode}`,
      "/login",
    );
  }

  // O token vem no header set-cookie como XSRF-TOKEN
  const setCookie = res.headers.get("set-cookie") || "";
  const xsrfMatch = setCookie.match(/XSRF-TOKEN=([^;]+)/);

  if (!xsrfMatch) {
    // Em algumas versões da API, o token vem no body
    const token = body.data?.token || body.data;
    if (token && typeof token === "string") {
      cachedToken = token;
      tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
      return token;
    }
    throw new HuaweiApiError(-1, "XSRF-TOKEN nao encontrado na resposta de login", "/login");
  }

  cachedToken = xsrfMatch[1];
  tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  return cachedToken;
}

/** Invalida o token cacheado (forçar novo login) */
export function invalidateToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

// ============================================================
// Requisições autenticadas
// ============================================================

async function huaweiFetch<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
  let token = await login();

  const doRequest = async (xsrfToken: string) => {
    const res = await fetch(`${THIRD_DATA_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "XSRF-TOKEN": xsrfToken,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new HuaweiApiError(res.status, `Huawei API ${res.status} em ${endpoint}`, endpoint);
    }

    return res.json();
  };

  let result = await doRequest(token);

  // Se token expirou (failCode 305), refazer login e tentar novamente
  if (result.failCode === 305) {
    invalidateToken();
    token = await login();
    result = await doRequest(token);
  }

  if (result.failCode !== 0 && result.success === false) {
    throw new HuaweiApiError(
      result.failCode ?? -1,
      `Huawei API erro em ${endpoint}: ${result.message || result.failCode}`,
      endpoint,
    );
  }

  return result as T;
}

// ============================================================
// Tipos
// ============================================================

export interface HuaweiStation {
  stationCode: string;
  stationName: string;
  stationAddr: string;
  capacity: number; // kWp
  buildState: number;
  combineType: number;
  aidType: number;
  stationLinkman: string;
  linkmanPho: string;
  contactPerson?: string;
  contactMethod?: string;
}

interface StationListResponse {
  failCode: number;
  success: boolean;
  data: {
    total: number;
    pageCount: number;
    pageNo: number;
    list: HuaweiStation[];
  };
}

export interface HuaweiStationKpi {
  stationCode: string;
  dataItemMap: {
    total_income?: number;
    total_power?: number; // kWh total acumulada
    day_power?: number; // kWh hoje
    month_power?: number; // kWh mes
    year_power?: number; // kWh ano
    day_income?: number;
    real_health_state?: number; // 1=desconectado, 2=com falha, 3=operando normal
    installed_capacity?: number; // kWp
  };
}

interface StationRealKpiResponse {
  failCode: number;
  success: boolean;
  data: HuaweiStationKpi[];
}

export interface HuaweiDailyKpi {
  stationCode: string;
  collectTime: number; // epoch ms
  dataItemMap: {
    inverter_power?: number; // kWh gerado pelo inversor
    power_profit?: number;
    perpower_ratio?: number;
    reduction_total_co2?: number;
    reduction_total_coal?: number;
    ongrid_power?: number; // kWh injetada na rede
    use_power?: number; // kWh consumida
    installed_capacity?: number;
    radiation_intensity?: number; // irradiacao W/m2
    theory_power?: number; // geração teórica
  };
}

interface DailyKpiResponse {
  failCode: number;
  success: boolean;
  data: HuaweiDailyKpi[];
}

export interface HuaweiMonthlyKpi {
  stationCode: string;
  collectTime: number; // epoch ms
  dataItemMap: {
    inverter_power?: number;
    power_profit?: number;
    perpower_ratio?: number;
    ongrid_power?: number;
    use_power?: number;
    installed_capacity?: number;
  };
}

interface MonthlyKpiResponse {
  failCode: number;
  success: boolean;
  data: HuaweiMonthlyKpi[];
}

export interface HuaweiDevice {
  devName: string;
  devTypeId: number; // 1=inversor string, 38=inversor residencial, 39=inversor comercial/industrial
  id: number;
  invType?: string;
  softwareVersion?: string;
  stationCode: string;
  esnCode?: string; // serial number
}

interface DevListResponse {
  failCode: number;
  success: boolean;
  data: HuaweiDevice[];
}

// Métricas em tempo real por inversor (/getDevRealKpi)
// Campos relevantes para alertas operacionais (tensão, temperatura, frequência).
export interface HuaweiDeviceRealKpi {
  devId: number;
  dataItemMap: {
    // Tensão por fase (V)
    a_u?: number;
    b_u?: number;
    c_u?: number;
    ab_u?: number;
    bc_u?: number;
    ca_u?: number;
    // Temperatura interna do inversor (°C)
    temperature?: number;
    // Frequência da rede (Hz)
    elec_freq?: number;
    // Estado do inversor (códigos variam por modelo)
    inverter_state?: number;
    // Potência ativa atual (kW)
    active_power?: number;
  };
}

interface DevRealKpiResponse {
  failCode: number;
  success: boolean;
  data: HuaweiDeviceRealKpi[];
}

export interface DeviceMetrics {
  stationCode: string;
  voltageAC: number | null; // média das fases disponíveis
  temperature: number | null;
  frequency: number | null;
}

export interface DailyGeneration {
  day: number;
  date: Date;
  energyKwh: number;
  ongridKwh: number | null;
  useKwh: number | null;
  radiationIntensity: number | null;
}

export interface PlantStatus {
  stationCode: string;
  isOnline: boolean;
  dayPowerKwh: number;
  monthPowerKwh: number;
  yearPowerKwh: number;
  totalPowerKwh: number;
  capacityKwp: number;
  healthState: "NORMAL" | "FALHA" | "DESCONECTADO" | "DESCONHECIDO";
}

// ============================================================
// Funções da API
// ============================================================

/** Lista todas as plantas da conta (paginado) */
export async function getStationList(pageNo = 1, pageSize = 50): Promise<{
  stations: HuaweiStation[];
  total: number;
}> {
  const data = await huaweiFetch<StationListResponse>("/getStationList", {
    pageNo,
    pageSize,
  });

  return {
    stations: data.data?.list ?? [],
    total: data.data?.total ?? 0,
  };
}

/** Lista todas as plantas (todas as páginas) */
export async function getAllStations(): Promise<HuaweiStation[]> {
  const allStations: HuaweiStation[] = [];
  let pageNo = 1;
  const pageSize = 100;

  while (true) {
    const { stations, total } = await getStationList(pageNo, pageSize);
    allStations.push(...stations);
    if (allStations.length >= total || stations.length === 0) break;
    pageNo++;
  }

  return allStations;
}

/** KPIs em tempo real de uma ou mais plantas */
export async function getStationRealKpi(stationCodes: string[]): Promise<HuaweiStationKpi[]> {
  const data = await huaweiFetch<StationRealKpiResponse>("/getStationRealKpi", {
    stationCodes: stationCodes.join(","),
  });

  return data.data ?? [];
}

/** Status consolidado de uma planta */
export async function getPlantStatus(stationCode: string): Promise<PlantStatus> {
  const kpis = await getStationRealKpi([stationCode]);
  const kpi = kpis.find((k) => k.stationCode === stationCode);

  const healthMap: Record<number, PlantStatus["healthState"]> = {
    1: "DESCONECTADO",
    2: "FALHA",
    3: "NORMAL",
  };

  return {
    stationCode,
    isOnline: kpi?.dataItemMap?.real_health_state === 3,
    dayPowerKwh: kpi?.dataItemMap?.day_power ?? 0,
    monthPowerKwh: kpi?.dataItemMap?.month_power ?? 0,
    yearPowerKwh: kpi?.dataItemMap?.year_power ?? 0,
    totalPowerKwh: kpi?.dataItemMap?.total_power ?? 0,
    capacityKwp: kpi?.dataItemMap?.installed_capacity ?? 0,
    healthState: healthMap[kpi?.dataItemMap?.real_health_state ?? 0] ?? "DESCONHECIDO",
  };
}

/**
 * Geração diária de um mês para uma planta.
 * collectTime: epoch ms do primeiro dia do mês às 00:00 UTC.
 */
export async function getDailyGeneration(
  stationCode: string,
  year: number,
  month: number,
): Promise<DailyGeneration[]> {
  const collectTime = new Date(year, month - 1, 1, 0, 0, 0).getTime();

  const data = await huaweiFetch<DailyKpiResponse>("/getKpiStationDay", {
    stationCodes: stationCode,
    collectTime,
  });

  if (!data.data || data.data.length === 0) return [];

  return data.data.map((item) => {
    const date = new Date(item.collectTime);
    return {
      day: date.getDate(),
      date,
      energyKwh: item.dataItemMap?.inverter_power ?? 0,
      ongridKwh: item.dataItemMap?.ongrid_power ?? null,
      useKwh: item.dataItemMap?.use_power ?? null,
      radiationIntensity: item.dataItemMap?.radiation_intensity ?? null,
    };
  });
}

/** Geração total de um mês (soma dos dias) */
export async function getMonthlyTotal(
  stationCode: string,
  year: number,
  month: number,
): Promise<{ totalKwh: number; days: number }> {
  const daily = await getDailyGeneration(stationCode, year, month);
  const totalKwh = daily.reduce((sum, d) => sum + d.energyKwh, 0);
  return { totalKwh, days: daily.length };
}

/**
 * Geração total dentro de um intervalo arbitrário [dateStart, dateEnd).
 * Alinha o inversor ao ciclo de leitura do medidor da distribuidora.
 */
export async function getRangeTotal(
  stationCode: string,
  dateStart: Date,
  dateEnd: Date,
): Promise<{ totalKwh: number; days: number }> {
  const { sumDailyInRange } = await import("./inverter-range");
  return sumDailyInRange(dateStart, dateEnd, (year, month) =>
    getDailyGeneration(stationCode, year, month),
  );
}

/**
 * Geração mensal de um ano.
 * collectTime: epoch ms do primeiro dia do ano às 00:00 UTC.
 */
export async function getMonthlyGeneration(
  stationCode: string,
  year: number,
): Promise<{ month: number; totalKwh: number; ongridKwh: number | null }[]> {
  const collectTime = new Date(year, 0, 1, 0, 0, 0).getTime();

  const data = await huaweiFetch<MonthlyKpiResponse>("/getKpiStationMonth", {
    stationCodes: stationCode,
    collectTime,
  });

  if (!data.data || data.data.length === 0) return [];

  return data.data.map((item) => {
    const date = new Date(item.collectTime);
    return {
      month: date.getMonth() + 1,
      totalKwh: item.dataItemMap?.inverter_power ?? 0,
      ongridKwh: item.dataItemMap?.ongrid_power ?? null,
    };
  });
}

/** Lista dispositivos (inversores) de uma planta */
export async function getDeviceList(stationCode: string): Promise<HuaweiDevice[]> {
  const data = await huaweiFetch<DevListResponse>("/getDevList", {
    stationCodes: stationCode,
  });

  return data.data ?? [];
}

// ============================================================
// Alarmes ativos — endpoint /getAlarmList
// Resposta tipica:
//   { alarmId, alarmName, alarmCause, alarmType, lev (severity), repairSuggestion,
//     causeId, raiseTime, status, stationCode, devId, devName }
// status: 1=ativo, 2=resolvido (varia por versão; a Huawei usa 1=active)
// ============================================================

interface HuaweiAlarm {
  alarmId?: number | string;
  alarmName?: string;
  alarmCause?: string;
  alarmType?: number;
  lev?: number;
  repairSuggestion?: string;
  causeId?: number | string;
  raiseTime?: number; // epoch ms
  status?: number;
  stationCode?: string;
  devId?: number;
  devName?: string;
}

interface AlarmListResponse {
  failCode: number;
  success: boolean;
  data?: HuaweiAlarm[];
  /** Algumas versões usam `params` ou `obj`; manter campo livre. */
  obj?: HuaweiAlarm[];
}

/**
 * Alarmes ativos de uma planta (status=1).
 *
 * O endpoint requer beginTime/endTime em epoch ms. Buscamos os últimos 30 dias.
 * Em caso de erro, retorna [].
 */
export async function getActiveAlerts(
  stationCode: string,
): Promise<import("./inverter-errors").InverterErrorEvent[]> {
  try {
    const endTime = Date.now();
    const beginTime = endTime - 30 * 24 * 60 * 60 * 1000;
    const data = await huaweiFetch<AlarmListResponse>("/getAlarmList", {
      stationCodes: stationCode,
      beginTime,
      endTime,
    });

    const list = data.data ?? data.obj ?? [];
    const out: import("./inverter-errors").InverterErrorEvent[] = [];
    for (const a of list) {
      // Filtro: apenas alarmes ativos. Algumas versões não devolvem `status` —
      // nesse caso confiamos no fato de que /getAlarmList só retorna ativos.
      if (a.status != null && Number(a.status) !== 1) continue;

      // Código do alarme: preferimos causeId (numérico, alinhado com KB),
      // fallback pra alarmId.
      const codigo =
        a.causeId != null && String(a.causeId).trim().length > 0
          ? String(a.causeId).trim()
          : a.alarmId != null
            ? String(a.alarmId).trim()
            : null;
      if (!codigo) continue;

      out.push({
        codigo,
        descricao:
          a.alarmName ??
          a.alarmCause ??
          a.repairSuggestion ??
          null,
        severidadeFabricante: a.lev != null ? String(a.lev) : null,
        abertoEm: a.raiseTime ? new Date(a.raiseTime) : null,
        externalId:
          a.alarmId != null ? String(a.alarmId) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function getActiveAlertsBatch(
  stationCodes: string[],
): Promise<Map<string, import("./inverter-errors").InverterErrorEvent[]>> {
  const results = new Map<
    string,
    import("./inverter-errors").InverterErrorEvent[]
  >();

  for (let i = 0; i < stationCodes.length; i += MAX_CONCURRENT) {
    const batch = stationCodes.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (code) => {
      const events = await getActiveAlerts(code);
      results.set(code, events);
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < stationCodes.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

// Tipos de dispositivo que representam inversores (fornecem tensão/temp/freq)
const INVERTER_DEV_TYPES = new Set<number>([1, 38, 39]);

/** KPIs em tempo real de dispositivos (inversores) agrupados por devTypeId */
export async function getDevRealKpi(
  devIds: number[],
  devTypeId: number,
): Promise<HuaweiDeviceRealKpi[]> {
  if (devIds.length === 0) return [];

  const data = await huaweiFetch<DevRealKpiResponse>("/getDevRealKpi", {
    devIds: devIds.join(","),
    devTypeId,
  });

  return data.data ?? [];
}

function avgDefined(values: Array<number | undefined | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Coleta métricas instantâneas (tensão média, temperatura, frequência) por planta.
 * Para cada planta lista dispositivos, chama getDevRealKpi agrupando por devTypeId,
 * e agrega a média das fases disponíveis. Respeita rate limiting interno.
 */
export async function getDeviceMetricsBatch(
  stationCodes: string[],
): Promise<Map<string, DeviceMetrics>> {
  const results = new Map<string, DeviceMetrics>();

  for (let i = 0; i < stationCodes.length; i += MAX_CONCURRENT) {
    const batch = stationCodes.slice(i, i + MAX_CONCURRENT);

    const promises = batch.map(async (stationCode) => {
      try {
        const devices = await getDeviceList(stationCode);
        const inverters = devices.filter((d) => INVERTER_DEV_TYPES.has(d.devTypeId));

        if (inverters.length === 0) {
          results.set(stationCode, {
            stationCode,
            voltageAC: null,
            temperature: null,
            frequency: null,
          });
          return;
        }

        // Agrupar por devTypeId (getDevRealKpi exige um único tipo por chamada)
        const byType = new Map<number, number[]>();
        for (const inv of inverters) {
          const list = byType.get(inv.devTypeId) ?? [];
          list.push(inv.id);
          byType.set(inv.devTypeId, list);
        }

        const allKpis: HuaweiDeviceRealKpi[] = [];
        for (const [devTypeId, ids] of byType.entries()) {
          try {
            const kpis = await getDevRealKpi(ids, devTypeId);
            allKpis.push(...kpis);
          } catch {
            // Falha em um tipo — seguir com os outros
          }
        }

        // Agregar: média das tensões de fase de todos os inversores
        // temperatura e frequência: média dos valores disponíveis
        const voltages: number[] = [];
        const temps: number[] = [];
        const freqs: number[] = [];

        for (const k of allKpis) {
          const m = k.dataItemMap ?? {};
          const invVoltage = avgDefined([m.a_u, m.b_u, m.c_u, m.ab_u, m.bc_u, m.ca_u]);
          if (invVoltage != null) voltages.push(invVoltage);
          if (typeof m.temperature === "number") temps.push(m.temperature);
          if (typeof m.elec_freq === "number") freqs.push(m.elec_freq);
        }

        results.set(stationCode, {
          stationCode,
          voltageAC: avgDefined(voltages),
          temperature: avgDefined(temps),
          frequency: avgDefined(freqs),
        });
      } catch {
        results.set(stationCode, {
          stationCode,
          voltageAC: null,
          temperature: null,
          frequency: null,
        });
      }
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < stationCodes.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/** Busca geração diária em lote com controle de concorrência */
export async function getDailyGenerationBatch(
  stationCodes: string[],
  year: number,
  month: number,
): Promise<Map<string, DailyGeneration[]>> {
  const results = new Map<string, DailyGeneration[]>();

  for (let i = 0; i < stationCodes.length; i += MAX_CONCURRENT) {
    const batch = stationCodes.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (code) => {
      try {
        const daily = await getDailyGeneration(code, year, month);
        results.set(code, daily);
      } catch {
        results.set(code, []);
      }
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < stationCodes.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/** Busca status em lote (aceita até 100 stations por chamada) */
export async function getPlantStatusBatch(
  stationCodes: string[],
): Promise<Map<string, PlantStatus>> {
  const results = new Map<string, PlantStatus>();

  // A API aceita múltiplos stationCodes em uma única chamada (até 100)
  for (let i = 0; i < stationCodes.length; i += 100) {
    const batch = stationCodes.slice(i, i + 100);

    try {
      const kpis = await getStationRealKpi(batch);
      const healthMap: Record<number, PlantStatus["healthState"]> = {
        1: "DESCONECTADO",
        2: "FALHA",
        3: "NORMAL",
      };

      for (const kpi of kpis) {
        results.set(kpi.stationCode, {
          stationCode: kpi.stationCode,
          isOnline: kpi.dataItemMap?.real_health_state === 3,
          dayPowerKwh: kpi.dataItemMap?.day_power ?? 0,
          monthPowerKwh: kpi.dataItemMap?.month_power ?? 0,
          yearPowerKwh: kpi.dataItemMap?.year_power ?? 0,
          totalPowerKwh: kpi.dataItemMap?.total_power ?? 0,
          capacityKwp: kpi.dataItemMap?.installed_capacity ?? 0,
          healthState: healthMap[kpi.dataItemMap?.real_health_state ?? 0] ?? "DESCONHECIDO",
        });
      }
    } catch {
      // Marcar como desconhecido
      for (const code of batch) {
        results.set(code, {
          stationCode: code,
          isOnline: false,
          dayPowerKwh: 0,
          monthPowerKwh: 0,
          yearPowerKwh: 0,
          totalPowerKwh: 0,
          capacityKwp: 0,
          healthState: "DESCONHECIDO",
        });
      }
    }

    if (i + 100 < stationCodes.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}
