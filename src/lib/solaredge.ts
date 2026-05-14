/**
 * SolarEdge Monitoring API Client
 * Base URL: https://monitoringapi.solaredge.com
 * Auth: API Key como query parameter (?api_key=XXX)
 *
 * Documentação: https://knowledge-center.solaredge.com/sites/kc/files/se_monitoring_api.pdf
 */

const SOLAREDGE_BASE_URL = "https://monitoringapi.solaredge.com";

// Rate limiting: SolarEdge limita a 300 requests/dia por site
const MAX_CONCURRENT = 3;
const BATCH_DELAY_MS = 500;

// ============================================================
// Autenticação
// ============================================================

function getApiKey(): string {
  const apiKey = process.env.SOLAREDGE_API_KEY;
  if (!apiKey) {
    throw new Error("Credenciais SolarEdge nao configuradas. Defina SOLAREDGE_API_KEY no .env");
  }
  return apiKey;
}

export class SolarEdgeApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public endpoint: string,
  ) {
    super(message);
    this.name = "SolarEdgeApiError";
  }
}

// ============================================================
// Requisições
// ============================================================

async function solaredgeFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = getApiKey();
  const queryParams = new URLSearchParams({ api_key: apiKey, ...params });
  const url = `${SOLAREDGE_BASE_URL}${path}?${queryParams.toString()}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new SolarEdgeApiError(
      res.status,
      `SolarEdge API ${res.status} em ${path}: ${errorText}`,
      path,
    );
  }

  return res.json() as Promise<T>;
}

// ============================================================
// Tipos
// ============================================================

export interface SolarEdgeSite {
  id: number;
  name: string;
  accountId: number;
  status: string; // "Active", "Pending", etc.
  peakPower: number; // kWp
  installationDate: string;
  location: {
    country: string;
    state: string;
    city: string;
    address: string;
    address2: string;
    zip: string;
    timeZone: string;
  };
  primaryModule?: {
    manufacturerName: string;
    modelName: string;
    maximumPower: number;
  };
  lastUpdateTime?: string;
  currency?: string;
}

interface SitesListResponse {
  sites: {
    count: number;
    site: SolarEdgeSite[];
  };
}

export interface SolarEdgeSiteOverview {
  lastUpdateTime: string;
  lifeTimeData: { energy: number; revenue: number }; // Wh
  lastYearData: { energy: number };
  lastMonthData: { energy: number };
  lastDayData: { energy: number };
  currentPower: { power: number }; // W
}

interface SiteOverviewResponse {
  overview: SolarEdgeSiteOverview;
}

interface EnergyValue {
  date: string; // "YYYY-MM-DD HH:mm:ss"
  value: number | null; // Wh
}

interface SiteEnergyResponse {
  energy: {
    timeUnit: string;
    unit: string;
    measuredBy: string;
    values: EnergyValue[];
  };
}

export interface SolarEdgeInverter {
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  communicationMethod?: string;
}

interface InventoryResponse {
  Inventory: {
    inverters: SolarEdgeInverter[];
    meters?: unknown[];
    sensors?: unknown[];
    gateways?: unknown[];
    batteries?: unknown[];
  };
}

export interface DailyGeneration {
  day: number;
  date: Date;
  energyKwh: number;
}

export interface PlantStatus {
  siteId: number;
  isOnline: boolean;
  currentPowerW: number;
  dayEnergyKwh: number;
  monthEnergyKwh: number;
  yearEnergyKwh: number;
  totalEnergyKwh: number;
  peakPowerKwp: number;
  lastUpdate: string;
}

// ============================================================
// Funções da API
// ============================================================

/** Lista todos os sites da conta */
export async function getSiteList(size = 100, startIndex = 0): Promise<{
  sites: SolarEdgeSite[];
  total: number;
}> {
  const data = await solaredgeFetch<SitesListResponse>("/sites/list", {
    size: String(size),
    startIndex: String(startIndex),
  });

  return {
    sites: data.sites?.site ?? [],
    total: data.sites?.count ?? 0,
  };
}

/** Lista todos os sites (todas as páginas) */
export async function getAllSites(): Promise<SolarEdgeSite[]> {
  const allSites: SolarEdgeSite[] = [];
  let startIndex = 0;
  const size = 100;

  while (true) {
    const { sites, total } = await getSiteList(size, startIndex);
    allSites.push(...sites);
    if (allSites.length >= total || sites.length === 0) break;
    startIndex += size;
  }

  return allSites;
}

/** Overview em tempo real de um site */
export async function getSiteOverview(siteId: number): Promise<SolarEdgeSiteOverview> {
  const data = await solaredgeFetch<SiteOverviewResponse>(`/site/${siteId}/overview`);
  return data.overview;
}

/** Status consolidado de um site */
export async function getPlantStatus(siteId: number): Promise<PlantStatus> {
  const [overview, siteList] = await Promise.all([
    getSiteOverview(siteId),
    solaredgeFetch<SitesListResponse>("/sites/list", {
      size: "1",
      searchText: String(siteId),
    }),
  ]);

  const site = siteList.sites?.site?.find((s) => s.id === siteId);

  return {
    siteId,
    isOnline: overview.currentPower.power > 0,
    currentPowerW: overview.currentPower.power,
    dayEnergyKwh: (overview.lastDayData.energy ?? 0) / 1000,
    monthEnergyKwh: (overview.lastMonthData.energy ?? 0) / 1000,
    yearEnergyKwh: (overview.lastYearData.energy ?? 0) / 1000,
    totalEnergyKwh: (overview.lifeTimeData.energy ?? 0) / 1000,
    peakPowerKwp: site?.peakPower ?? 0,
    lastUpdate: overview.lastUpdateTime,
  };
}

/**
 * Geração diária de um mês para um site.
 * A API retorna energia em Wh, convertemos para kWh.
 */
export async function getDailyGeneration(
  siteId: number,
  year: number,
  month: number,
): Promise<DailyGeneration[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const data = await solaredgeFetch<SiteEnergyResponse>(`/site/${siteId}/energy`, {
    timeUnit: "DAY",
    startDate,
    endDate,
  });

  if (!data.energy?.values) return [];

  return data.energy.values
    .filter((v) => v.value != null && v.value > 0)
    .map((v) => {
      const date = new Date(v.date);
      return {
        day: date.getDate(),
        date,
        energyKwh: (v.value ?? 0) / 1000,
      };
    });
}

/** Geração total de um mês */
export async function getMonthlyTotal(
  siteId: number,
  year: number,
  month: number,
): Promise<{ totalKwh: number; days: number }> {
  const daily = await getDailyGeneration(siteId, year, month);
  const totalKwh = daily.reduce((sum, d) => sum + d.energyKwh, 0);
  return { totalKwh, days: daily.length };
}

/**
 * Geração total dentro de um intervalo arbitrário [dateStart, dateEnd).
 * Alinha o inversor ao ciclo de leitura do medidor da distribuidora.
 */
export async function getRangeTotal(
  siteId: number,
  dateStart: Date,
  dateEnd: Date,
): Promise<{ totalKwh: number; days: number }> {
  const { sumDailyInRange } = await import("./inverter-range");
  return sumDailyInRange(dateStart, dateEnd, (year, month) =>
    getDailyGeneration(siteId, year, month),
  );
}

/**
 * Geração mensal de um ano.
 * timeUnit: MONTH
 */
export async function getMonthlyGeneration(
  siteId: number,
  year: number,
): Promise<{ month: number; totalKwh: number }[]> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const data = await solaredgeFetch<SiteEnergyResponse>(`/site/${siteId}/energy`, {
    timeUnit: "MONTH",
    startDate,
    endDate,
  });

  if (!data.energy?.values) return [];

  return data.energy.values
    .filter((v) => v.value != null && v.value > 0)
    .map((v) => {
      const date = new Date(v.date);
      return {
        month: date.getMonth() + 1,
        totalKwh: (v.value ?? 0) / 1000,
      };
    });
}

/** Lista inversores e equipamentos de um site */
export async function getInventory(siteId: number): Promise<SolarEdgeInverter[]> {
  const data = await solaredgeFetch<InventoryResponse>(`/site/${siteId}/inventory`);
  return data.Inventory?.inverters ?? [];
}

/**
 * Eventos ativos do site.
 *
 * NOTA: a Monitoring API pública da SolarEdge NÃO expõe error codes/alertas
 * ativos como endpoint REST — esses dados ficam só no portal web. Mantemos a
 * função pra padronizar a interface, mas devolvemos sempre [].
 *
 * Se a SolarEdge expor esse endpoint no futuro (ex.: parceria/conta enterprise),
 * implementar a chamada aqui sem alterar a assinatura.
 */
export async function getActiveAlerts(
  _siteId: number,
): Promise<import("./inverter-errors").InverterErrorEvent[]> {
  return [];
}

export async function getActiveAlertsBatch(
  siteIds: number[],
): Promise<Map<number, import("./inverter-errors").InverterErrorEvent[]>> {
  const results = new Map<
    number,
    import("./inverter-errors").InverterErrorEvent[]
  >();
  for (const id of siteIds) results.set(id, []);
  return results;
}

/** Busca geração diária em lote */
export async function getDailyGenerationBatch(
  siteIds: number[],
  year: number,
  month: number,
): Promise<Map<number, DailyGeneration[]>> {
  const results = new Map<number, DailyGeneration[]>();

  for (let i = 0; i < siteIds.length; i += MAX_CONCURRENT) {
    const batch = siteIds.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (siteId) => {
      try {
        const daily = await getDailyGeneration(siteId, year, month);
        results.set(siteId, daily);
      } catch {
        results.set(siteId, []);
      }
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < siteIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/** Busca status em lote */
export async function getPlantStatusBatch(
  siteIds: number[],
): Promise<Map<number, PlantStatus>> {
  const results = new Map<number, PlantStatus>();

  for (let i = 0; i < siteIds.length; i += MAX_CONCURRENT) {
    const batch = siteIds.slice(i, i + MAX_CONCURRENT);
    const promises = batch.map(async (siteId) => {
      try {
        const status = await getPlantStatus(siteId);
        results.set(siteId, status);
      } catch {
        results.set(siteId, {
          siteId,
          isOnline: false,
          currentPowerW: 0,
          dayEnergyKwh: 0,
          monthEnergyKwh: 0,
          yearEnergyKwh: 0,
          totalEnergyKwh: 0,
          peakPowerKwp: 0,
          lastUpdate: "",
        });
      }
    });

    await Promise.all(promises);

    if (i + MAX_CONCURRENT < siteIds.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}
