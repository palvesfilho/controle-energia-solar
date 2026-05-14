/**
 * Fronius Solar.web Query API (SWQAPI) Client
 * Base URL: https://api.solarweb.com/swqapi
 * Auth: AccessKeyId + AccessKeyValue headers
 */

const FRONIUS_BASE_URL = "https://api.solarweb.com/swqapi";
const PAGE_SIZE = 100;

// Rate limiting: max 5 concurrent requests, 200ms between batches
const MAX_CONCURRENT = 5;
const BATCH_DELAY_MS = 200;

function getHeaders(): Record<string, string> {
  const keyId = process.env.FRONIUS_ACCESS_KEY_ID;
  const keyValue = process.env.FRONIUS_ACCESS_KEY_VALUE;

  if (!keyId || !keyValue) {
    throw new Error("Credenciais Fronius nao configuradas. Defina FRONIUS_ACCESS_KEY_ID e FRONIUS_ACCESS_KEY_VALUE no .env");
  }

  return {
    AccessKeyId: keyId,
    AccessKeyValue: keyValue,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function froniusFetch<T>(path: string): Promise<T> {
  const url = `${FRONIUS_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: getHeaders(),
    // Node fetch no Next.js - desabilitar cache para dados em tempo real
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new FroniusApiError(res.status, `Fronius API ${res.status}: ${errorText}`, path);
  }

  return res.json() as Promise<T>;
}

export class FroniusApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public endpoint: string,
  ) {
    super(message);
    this.name = "FroniusApiError";
  }
}

// ============================================================
// Tipos
// ============================================================

export interface FroniusPvSystem {
  pvSystemId: string;
  name: string;
  address: {
    country: string;
    zipCode: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
  };
  pictureURL: string | null;
  peakPower: number; // Watts
  installationDate: string;
  lastImport: string | null;
  meteoData: unknown;
  timeZone: string;
}

interface PvSystemsResponse {
  pvSystems: FroniusPvSystem[];
  links: {
    totalItemsCount: number;
    next: string | null;
  };
}

interface PvSystemsListResponse {
  pvSystemIds: string[];
  links: {
    totalItemsCount: number;
    next: string | null;
  };
}

export interface FroniusChannelData {
  channelName: string;
  channelType: string;
  unit: string;
  values: Record<string, number>;
}

interface AggDataResponse {
  pvSystemId: string;
  data: {
    logPeriod: { type: string; year: number; month: number };
    channels: FroniusChannelData[];
  };
}

export interface FroniusFlowChannel {
  channelName: string;
  channelType: string;
  unit: string;
  value: number | null;
}

export interface FroniusFlowData {
  pvSystemId: string;
  status: { isOnline: boolean };
  data: {
    logDateTime: string;
    channels: FroniusFlowChannel[];
  };
}

export interface DailyGeneration {
  day: number;
  energyWh: number;
  energyKwh: number;
}

export interface PlantStatus {
  pvSystemId: string;
  isOnline: boolean;
  currentPowerW: number | null;
  currentOutputW: number | null;
  lastReading: string;
  // Métricas instantâneas (Fase 2.1) — nulas quando o canal não está disponível no flowdata
  voltageAC: number | null;
  temperature: number | null;
  frequency: number | null;
}

// Nomes comuns de canais Fronius para tensão/temperatura/frequência.
// Aceita variações vistas em diferentes versões do firmware.
const VOLTAGE_CHANNELS = [
  "VoltageAC",
  "Uac",
  "VoltageAC_Phase_1",
  "VoltageGrid",
  "Uac_L1",
];
const TEMPERATURE_CHANNELS = [
  "Temp_PowerStage",
  "TempPowerStage",
  "Temp_Ambient",
  "TempSynt",
  "TempInv",
];
const FREQUENCY_CHANNELS = ["FreqGrid", "FrequencyAC", "FreqAC", "Fac"];

function findChannelValue(
  channels: FroniusFlowChannel[],
  names: string[]
): number | null {
  for (const name of names) {
    const ch = channels.find((c) => c.channelName === name);
    if (ch && ch.value != null) return ch.value;
  }
  return null;
}

// ============================================================
// Funções da API
// ============================================================

/** Total de plantas na conta */
export async function getPvSystemsCount(): Promise<number> {
  const data = await froniusFetch<{ count: number }>("/pvsystems-count");
  return data.count;
}

/** Lista todas as plantas (paginado internamente) */
export async function getAllPvSystems(): Promise<FroniusPvSystem[]> {
  const count = await getPvSystemsCount();
  const allSystems: FroniusPvSystem[] = [];
  const totalPages = Math.ceil(count / PAGE_SIZE);

  for (let page = 0; page < totalPages; page++) {
    const offset = page * PAGE_SIZE;
    const data = await froniusFetch<PvSystemsResponse>(
      `/pvsystems?offset=${offset}&limit=${PAGE_SIZE}`
    );
    allSystems.push(...data.pvSystems);
  }

  return allSystems;
}

/** Lista plantas em lotes (para sincronização incremental) */
export async function getPvSystemsBatch(offset: number, limit: number): Promise<{
  systems: FroniusPvSystem[];
  total: number;
}> {
  const data = await froniusFetch<PvSystemsResponse>(
    `/pvsystems?offset=${offset}&limit=${limit}`
  );
  return {
    systems: data.pvSystems,
    total: data.links.totalItemsCount,
  };
}

/** Detalhes de uma planta */
export async function getPvSystem(pvSystemId: string): Promise<FroniusPvSystem> {
  return froniusFetch<FroniusPvSystem>(`/pvsystems/${pvSystemId}`);
}

/** Geração diária de um mês para uma planta */
export async function getDailyGeneration(
  pvSystemId: string,
  year: number,
  month: number,
): Promise<DailyGeneration[]> {
  const data = await froniusFetch<AggDataResponse>(
    `/pvsystems/${pvSystemId}/aggdata/years/${year}/months/${month}/days`
  );

  const energyChannel = data.data.channels.find(
    (ch) => ch.channelName === "EnergyOutput" || ch.channelName === "EnergyProductionTotal"
  );

  if (!energyChannel) return [];

  return Object.entries(energyChannel.values).map(([day, wh]) => ({
    day: parseInt(day),
    energyWh: wh,
    energyKwh: wh / 1000,
  }));
}

/** Geração total de um mês (soma dos dias) */
export async function getMonthlyTotal(
  pvSystemId: string,
  year: number,
  month: number,
): Promise<{ totalKwh: number; days: number }> {
  const daily = await getDailyGeneration(pvSystemId, year, month);
  const totalKwh = daily.reduce((sum, d) => sum + d.energyKwh, 0);
  return { totalKwh, days: daily.length };
}

/**
 * Geração total dentro de um intervalo arbitrário [dateStart, dateEnd).
 * Usado para alinhar a soma do inversor com o ciclo de leitura do medidor da
 * distribuidora (não coincide com mês calendário).
 */
export async function getRangeTotal(
  pvSystemId: string,
  dateStart: Date,
  dateEnd: Date,
): Promise<{ totalKwh: number; days: number }> {
  const { sumDailyInRange } = await import("./inverter-range");
  return sumDailyInRange(dateStart, dateEnd, (year, month) =>
    getDailyGeneration(pvSystemId, year, month),
  );
}

/** Dados de fluxo em tempo real (online/offline + potência atual + métricas instantâneas disponíveis) */
export async function getFlowData(pvSystemId: string): Promise<PlantStatus> {
  const data = await froniusFetch<FroniusFlowData>(`/pvsystems/${pvSystemId}/flowdata`);

  const channels = data.data.channels;
  const powerPV = channels.find((ch) => ch.channelName === "PowerPV");
  const powerOutput = channels.find((ch) => ch.channelName === "PowerOutput");

  return {
    pvSystemId: data.pvSystemId,
    isOnline: data.status.isOnline,
    currentPowerW: powerPV?.value ?? null,
    currentOutputW: powerOutput?.value ?? null,
    lastReading: data.data.logDateTime,
    voltageAC: findChannelValue(channels, VOLTAGE_CHANNELS),
    temperature: findChannelValue(channels, TEMPERATURE_CHANNELS),
    frequency: findChannelValue(channels, FREQUENCY_CHANNELS),
  };
}

/** Busca flowdata em lote com controle de concorrência */
export async function getFlowDataBatch(
  pvSystemIds: string[],
): Promise<Map<string, PlantStatus>> {
  const results = new Map<string, PlantStatus>();

  for (let i = 0; i < pvSystemIds.length; i += MAX_CONCURRENT) {
    const batch = pvSystemIds.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (id) => {
      try {
        const status = await getFlowData(id);
        results.set(id, status);
      } catch {
        // Planta com erro - marcar como offline
        results.set(id, {
          pvSystemId: id,
          isOnline: false,
          currentPowerW: null,
          currentOutputW: null,
          lastReading: new Date().toISOString(),
          voltageAC: null,
          temperature: null,
          frequency: null,
        });
      }
    });

    await Promise.all(promises);

    // Rate limiting entre lotes
    if (i + MAX_CONCURRENT < pvSystemIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/** Busca geração diária em lote com controle de concorrência */
export async function getDailyGenerationBatch(
  pvSystemIds: string[],
  year: number,
  month: number,
): Promise<Map<string, DailyGeneration[]>> {
  const results = new Map<string, DailyGeneration[]>();

  for (let i = 0; i < pvSystemIds.length; i += MAX_CONCURRENT) {
    const batch = pvSystemIds.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (id) => {
      try {
        const daily = await getDailyGeneration(id, year, month);
        results.set(id, daily);
      } catch {
        results.set(id, []);
      }
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < pvSystemIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

// ============================================================
// Eventos / mensagens (state codes) — endpoint /messages
// SWQAPI retorna mensagens do pvSystem com tipos: warning, error, info.
// Estrutura típica:
//   { logDateTime, deviceId, deviceType, stateCode, stateType, stateSeverity, text }
// ============================================================

interface FroniusMessage {
  logDateTime: string;
  deviceId?: string;
  deviceType?: string;
  stateCode?: number | string;
  stateType?: string; // "Error" | "Warning" | "Info"
  stateSeverity?: string;
  text?: string;
}

interface MessagesResponse {
  pvSystemId: string;
  messages: FroniusMessage[];
  links?: { totalItemsCount?: number; next?: string | null };
}

/**
 * Eventos ativos (não resolvidos) do pvSystem. Mensagens informativas (Info)
 * são filtradas — só retornamos warnings e errors com stateCode.
 *
 * Em caso de falha na API ou planta sem mensagens, retorna [].
 */
export async function getActiveAlerts(
  pvSystemId: string,
): Promise<import("./inverter-errors").InverterErrorEvent[]> {
  try {
    // duration=0 => abertos (não resolvidos). type=Error|Warning ignora Info.
    const data = await froniusFetch<MessagesResponse>(
      `/pvsystems/${pvSystemId}/messages?duration=0&type=Error,Warning&limit=50`,
    );
    const out: import("./inverter-errors").InverterErrorEvent[] = [];
    for (const m of data.messages ?? []) {
      const codigo =
        m.stateCode != null && String(m.stateCode).trim().length > 0
          ? String(m.stateCode).trim()
          : null;
      if (!codigo) continue;
      out.push({
        codigo,
        descricao: m.text ?? null,
        severidadeFabricante: m.stateSeverity ?? m.stateType ?? null,
        abertoEm: m.logDateTime ? new Date(m.logDateTime) : null,
        externalId:
          m.logDateTime && m.deviceId
            ? `${m.deviceId}-${codigo}-${m.logDateTime}`
            : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Busca eventos ativos em lote com controle de concorrência */
export async function getActiveAlertsBatch(
  pvSystemIds: string[],
): Promise<Map<string, import("./inverter-errors").InverterErrorEvent[]>> {
  const results = new Map<
    string,
    import("./inverter-errors").InverterErrorEvent[]
  >();

  for (let i = 0; i < pvSystemIds.length; i += MAX_CONCURRENT) {
    const batch = pvSystemIds.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (id) => {
      const events = await getActiveAlerts(id);
      results.set(id, events);
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < pvSystemIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/** Geração agregada por ano (todos os meses) */
export async function getYearlyMonthlyBreakdown(
  pvSystemId: string,
  year: number,
): Promise<{ month: number; totalKwh: number }[]> {
  const data = await froniusFetch<AggDataResponse>(
    `/pvsystems/${pvSystemId}/aggdata/years/${year}/months`
  );

  const energyChannel = data.data.channels.find(
    (ch) => ch.channelName === "EnergyOutput" || ch.channelName === "EnergyProductionTotal"
  );

  if (!energyChannel) return [];

  return Object.entries(energyChannel.values).map(([month, wh]) => ({
    month: parseInt(month),
    totalKwh: wh / 1000,
  }));
}
