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

  // Se token expirou (failCode 305), refazer login e tentar novamente.
  //
  // ⚠️ A Huawei mantém UMA sessão por usuário: qualquer outro processo que
  // logue com a mesma conta (o cron do Railway, o servidor web, um script
  // rodando na sua máquina) derruba este token e o próximo request cai aqui.
  // Com dois processos alternando, cada chamada vira DUAS — e o próprio
  // `/login` é dos endpoints mais limitados, respondendo 407. É por isso que
  // reduzir o NÚMERO de chamadas (lotes em vez de uma por usina) importa mais
  // do que espaçá-las, e por que sondar Huawei de local enquanto a produção
  // roda dá resultado enganoso.
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

/**
 * Dispositivos de VÁRIAS plantas por chamada — o parâmetro do endpoint é
 * `stationCodes`, no plural, e cada dispositivo devolvido traz o seu
 * `stationCode`, então dá pra separar depois.
 *
 * Existe porque descobrir dispositivo de uma planta por vez é o que afunda a
 * cota da Huawei: 105 chamadas ao `/getDevList` e a API passa a responder 407
 * (ACCESS_FREQUENCY_IS_TOO_HIGH) muito antes do fim da lista. Com o lote, a
 * frota inteira sai em poucas chamadas.
 *
 * Devolve o que conseguiu MAIS o motivo de cada chunk que falhou. O motivo não
 * é opcional: "mapa vazio" pode ser cota (407), lote recusado ou frota sem
 * inversor cadastrado, e sem distinguir os três não há como saber se a
 * descoberta está quebrada ou se não havia nada pra achar.
 */
export async function getDeviceListBatch(
  stationCodes: string[],
  chunk = 25,
): Promise<{ porStation: Map<string, HuaweiDevice[]>; erros: string[]; chamadas: number }> {
  const porStation = new Map<string, HuaweiDevice[]>();
  const erros: string[] = [];
  let chamadas = 0;

  for (let i = 0; i < stationCodes.length; i += chunk) {
    const lote = stationCodes.slice(i, i + chunk);
    let devs: HuaweiDevice[];
    chamadas++;
    try {
      devs = await getDeviceList(lote.join(","));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      erros.push(`lote de ${lote.length} usinas: ${m}`);
      // 407 = cota. Insistir nos chunks seguintes só afunda mais.
      if (m.includes("407")) {
        erros.push(`cota estourada — ${stationCodes.length - i - lote.length} usinas não consultadas`);
        break;
      }
      continue;
    }
    if (devs.length === 0) {
      erros.push(`lote de ${lote.length} usinas: respondeu OK, porém sem nenhum dispositivo`);
    }
    for (const d of devs) {
      const lista = porStation.get(d.stationCode) ?? [];
      lista.push(d);
      porStation.set(d.stationCode, lista);
    }
    if (i + chunk < stationCodes.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return { porStation, erros, chamadas };
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
 * Alarmes ativos (status=1) de UMA OU VÁRIAS plantas.
 *
 * O endpoint requer beginTime/endTime em epoch ms. Buscamos os últimos 30 dias.
 * Em caso de erro, retorna mapa vazio.
 *
 * Aceita lista porque `stationCodes` é plural e cada alarme volta com o seu
 * `stationCode`: era isso ou 105 chamadas por hora só de alarme, que é o que
 * estourava a cota da conta e fazia o COLETOR levar 407 na sequência.
 */
async function buscarAlarmes(
  stationCodes: string[],
): Promise<Map<string, import("./inverter-errors").InverterErrorEvent[]>> {
  const out = new Map<string, import("./inverter-errors").InverterErrorEvent[]>();
  if (stationCodes.length === 0) return out;

  try {
    const endTime = Date.now();
    const beginTime = endTime - 30 * 24 * 60 * 60 * 1000;
    const data = await huaweiFetch<AlarmListResponse>("/getAlarmList", {
      stationCodes: stationCodes.join(","),
      beginTime,
      endTime,
    });

    const list = data.data ?? data.obj ?? [];
    for (const a of list) {
      // Com um code só, algumas versões omitem o `stationCode` na resposta —
      // aí não há ambiguidade e o alarme é daquela planta mesmo.
      const dono =
        a.stationCode ?? (stationCodes.length === 1 ? stationCodes[0] : null);
      if (!dono) continue;
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

      const lista = out.get(dono) ?? [];
      lista.push({
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
      out.set(dono, lista);
    }
    return out;
  } catch {
    return out;
  }
}

/** Alarmes ativos de uma planta. */
export async function getActiveAlerts(
  stationCode: string,
): Promise<import("./inverter-errors").InverterErrorEvent[]> {
  return (await buscarAlarmes([stationCode])).get(stationCode) ?? [];
}

/** Quantas plantas por chamada de alarme. Mesmo teto do `/getDevList`. */
const ALARMES_POR_CHAMADA = 25;

/**
 * Alarmes de várias plantas. Uma chamada a cada 25 usinas, em vez de uma por
 * usina: 105 usinas saem em 5 chamadas, não 105. Plantas sem alarme não
 * aparecem na resposta — por isso o mapa é preenchido com [] no fim, senão
 * "sem alarme" viraria indistinguível de "não consultada".
 */
export async function getActiveAlertsBatch(
  stationCodes: string[],
): Promise<Map<string, import("./inverter-errors").InverterErrorEvent[]>> {
  const results = new Map<
    string,
    import("./inverter-errors").InverterErrorEvent[]
  >();

  for (let i = 0; i < stationCodes.length; i += ALARMES_POR_CHAMADA) {
    const lote = stationCodes.slice(i, i + ALARMES_POR_CHAMADA);
    for (const [code, eventos] of await buscarAlarmes(lote)) {
      results.set(code, eventos);
    }
    if (i + ALARMES_POR_CHAMADA < stationCodes.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  for (const code of stationCodes) {
    if (!results.has(code)) results.set(code, []);
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

/** Uma leitura de 5 min de um inversor, já normalizada. */
export interface HuaweiDeviceSample {
  devId: number;
  /** epoch ms do instante coletado */
  collectTime: number;
  /** potência ativa no instante, em W (a API devolve kW) */
  activePowerW: number | null;
  /** energia acumulada no dia, em Wh (a API devolve kWh) */
  energiaDiaWh: number | null;
}

interface DevFiveMinutesResponse {
  failCode: number;
  success: boolean;
  data?: Array<{
    devId: number;
    collectTime: number;
    dataItemMap?: { active_power?: number | null; product_power?: number | null };
  }>;
}

/**
 * Curva de 5 min dos inversores (`/getDevFiveMinutes`), usada pelo coletor
 * intradiário. Aceita até 100 devIds por chamada e devolve o DIA INTEIRO de
 * `diaReferencia` — a API não recebe janela, só a data.
 *
 * Todos os devIds precisam ser do mesmo `devTypeId` (padrão 1 = inversor
 * string), igual ao `getDevRealKpi`.
 *
 * ⚠️ Endpoint com limite de frequência agressivo: a Huawei responde failCode
 * 407 (ACCESS_FREQUENCY_IS_TOO_HIGH) se for chamado demais. Quem chama deve
 * desistir na primeira recusa em vez de repetir.
 */
export async function getDeviceFiveMinutes(
  devIds: Array<number | string>,
  diaReferencia: Date,
  devTypeId = 1,
): Promise<HuaweiDeviceSample[]> {
  if (devIds.length === 0) return [];

  const data = await huaweiFetch<DevFiveMinutesResponse>("/getDevFiveMinutes", {
    devIds: devIds.join(","),
    devTypeId,
    collectTime: diaReferencia.getTime(),
  });

  return (data.data ?? []).map((d) => ({
    devId: d.devId,
    collectTime: d.collectTime,
    // A Huawei reporta em kW / kWh; o resto do sistema trabalha em W / Wh.
    activePowerW: d.dataItemMap?.active_power != null ? d.dataItemMap.active_power * 1000 : null,
    energiaDiaWh: d.dataItemMap?.product_power != null ? d.dataItemMap.product_power * 1000 : null,
  }));
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

  // A lista de dispositivos de TODAS as plantas sai antes, em lote. Era uma
  // chamada de `/getDevList` por planta aqui dentro — 105 por execução, o
  // suficiente pra deixar a conta em 407 e derrubar a coleta da curva junto.
  const { porStation: devicesPorStation } = await getDeviceListBatch(stationCodes);

  for (let i = 0; i < stationCodes.length; i += MAX_CONCURRENT) {
    const batch = stationCodes.slice(i, i + MAX_CONCURRENT);

    const promises = batch.map(async (stationCode) => {
      try {
        const devices = devicesPorStation.get(stationCode) ?? [];
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
