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

function getToken(): string {
  const token = process.env.GROWATT_TOKEN;
  if (!token) {
    throw new Error(
      "Credencial Growatt nao configurada. Defina GROWATT_TOKEN no .env (token da OpenAPI, servidor openapi.growatt.com).",
    );
  }
  return token;
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
): Promise<T> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `${GROWATT_BASE_URL}${path}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { token: getToken() },
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

/** Uma página da lista de plantas do token. */
export async function getPlantList(page = 1, perpage = 100): Promise<{
  plants: GrowattPlant[];
  count: number;
}> {
  const data = await growattFetch<{ count?: number; plants?: RawPlantListItem[] }>(
    "/v1/plant/list",
    { page, perpage },
  );
  return {
    plants: (data.plants ?? []).map(mapPlant),
    count: num(data.count),
  };
}

/** Todas as plantas vinculadas ao token (pagina até esgotar). */
export async function getAllPlants(): Promise<GrowattPlant[]> {
  const all: GrowattPlant[] = [];
  let page = 1;
  const perpage = 100;
  // Guarda-chuva contra loop: no máx 50 páginas (5.000 plantas).
  for (let i = 0; i < 50; i++) {
    const { plants, count } = await getPlantList(page, perpage);
    all.push(...plants);
    if (all.length >= count || plants.length === 0) break;
    page++;
  }
  return all;
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
  const lastDay = new Date(year, month, 0).getDate(); // último dia do mês
  const out: DailyGeneration[] = [];

  for (let d0 = 1; d0 <= lastDay; d0 += 7) {
    const d1 = Math.min(d0 + 6, lastDay); // janela inclusiva de ≤7 dias
    const data = await growattFetch<{ energys?: RawEnergyItem[] }>("/v1/plant/energy", {
      plant_id: plantId,
      start_date: ymd(new Date(year, month - 1, d0)),
      end_date: ymd(new Date(year, month - 1, d1)),
      time_unit: "day",
    });

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
  const data = await growattFetch<{ energys?: RawEnergyItem[] }>("/v1/plant/energy", {
    plant_id: plantId,
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    time_unit: "month",
  });

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
  const data = await growattFetch<Record<string, unknown>>("/v1/plant/data", {
    plant_id: plantId,
    date: ymd(new Date()),
  });

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
