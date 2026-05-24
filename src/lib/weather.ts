// Wrapper Open-Meteo (https://open-meteo.com) — sem chave de API.
// Geocodifica cidade e busca previsão de até 16 dias. Cache em memória
// no servidor pra não bater a API a cada requisição.

// Cidade-sede da empresa — fonte única da previsão exibida no Calendário de Obras.
// Sobrescrevível via env `WEATHER_BASE_CITY` (formato "Cidade, UF").
export const WEATHER_BASE_CITY = process.env.WEATHER_BASE_CITY ?? "Santa Maria, RS";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  name: string;
  country: string | null;
  admin1: string | null;
}

export interface DailyForecast {
  date: string; // YYYY-MM-DD (timezone do local)
  weatherCode: number; // WMO weather interpretation code
  tMax: number;
  tMin: number;
  precipitationProbabilityMax: number;
}

// Buckets simplificados pra exibir ícone no calendário.
export type WeatherKind =
  | "sun"
  | "cloud-partial"
  | "cloud"
  | "rain"
  | "storm"
  | "snow"
  | "fog"
  | "unknown";

// Mapeia WMO weather code (Open-Meteo) → bucket de ícone.
// Tabela oficial: https://open-meteo.com/en/docs (seção "Weather variable documentation")
export function classifyWeatherCode(code: number): WeatherKind {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "cloud-partial";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "rain";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return "unknown";
}

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const GEOCODE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias — cidade não muda
const FORECAST_TTL_MS = 1000 * 60 * 60 * 3;      // 3h — previsão atualiza

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

const geocodeCache = new Map<string, CacheEntry<GeocodeResult | null>>();
const forecastCache = new Map<string, CacheEntry<DailyForecast[]>>();

function geocodeCacheKey(query: string): string {
  return query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function forecastCacheKey(lat: number, lon: number): string {
  // Arredonda pra ~1km de precisão — cidades próximas compartilham forecast.
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

// Nome completo do estado por UF (Open-Meteo devolve em `admin1`).
const UF_TO_ADMIN1: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas",
  BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

// Aceita "Cidade", "Cidade, UF", "Cidade/UF", "Cidade-UF" e separa as duas partes.
function splitCidadeUf(query: string): { cidade: string; uf: string | null } {
  const s = query.trim();
  const m = s.match(/^(.+?)\s*[,/\-]\s*([A-Z]{2})\s*$/);
  if (m && UF_TO_ADMIN1[m[2]]) {
    return { cidade: m[1].trim(), uf: m[2] };
  }
  return { cidade: s, uf: null };
}

export async function geocodeCidade(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const key = geocodeCacheKey(trimmed);
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < GEOCODE_TTL_MS) {
    return cached.value;
  }

  // Open-Meteo geocoding NÃO aceita ", UF" no parâmetro `name` — devolve 0 resultados.
  // Separamos cidade da UF, mandamos só a cidade, e desambiguamos pelo `admin1`.
  const { cidade, uf } = splitCidadeUf(trimmed);
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(cidade)}&count=10&language=pt&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      geocodeCache.set(key, { value: null, fetchedAt: Date.now() });
      return null;
    }
    const data = (await res.json()) as {
      results?: Array<{
        latitude: number;
        longitude: number;
        name: string;
        country?: string;
        country_code?: string;
        admin1?: string;
      }>;
    };
    const results = data.results ?? [];
    const brOnly = results.filter((r) => r.country_code === "BR");
    const targetAdmin1 = uf ? UF_TO_ADMIN1[uf] : null;
    const byUf = targetAdmin1
      ? brOnly.find((r) => (r.admin1 ?? "").toLowerCase() === targetAdmin1.toLowerCase())
      : null;
    const pick = byUf ?? brOnly[0] ?? results[0] ?? null;
    const value: GeocodeResult | null = pick
      ? {
          latitude: pick.latitude,
          longitude: pick.longitude,
          name: pick.name,
          country: pick.country ?? null,
          admin1: pick.admin1 ?? null,
        }
      : null;
    geocodeCache.set(key, { value, fetchedAt: Date.now() });
    return value;
  } catch {
    return null;
  }
}

export async function buscarPrevisao(
  lat: number,
  lon: number
): Promise<DailyForecast[]> {
  const key = forecastCacheKey(lat, lon);
  const cached = forecastCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < FORECAST_TTL_MS) {
    return cached.value;
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "16",
  });
  const url = `${FORECAST_URL}?${params.toString()}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };
    const d = data.daily;
    if (!d?.time || !d.weather_code) {
      forecastCache.set(key, { value: [], fetchedAt: Date.now() });
      return [];
    }
    const out: DailyForecast[] = d.time.map((date, i) => ({
      date,
      weatherCode: d.weather_code?.[i] ?? -1,
      tMax: d.temperature_2m_max?.[i] ?? NaN,
      tMin: d.temperature_2m_min?.[i] ?? NaN,
      precipitationProbabilityMax: d.precipitation_probability_max?.[i] ?? 0,
    }));
    forecastCache.set(key, { value: out, fetchedAt: Date.now() });
    return out;
  } catch {
    return [];
  }
}

// Extrai um "local" de busca a partir do campo livre `local` da obra.
// Formatos que aparecem na base:
//   - "AV. BRASIL, 2133 - MEDIANEIRA, CACHOEIRA DO SUL, RS"   (cidade, UF no fim)
//   - "Rua X, 123 - Centro, Caxias do Sul/RS"
//   - "Caxias do Sul - RS"
// Estratégia: se o último segmento separado por vírgula for uma UF (2 letras
// maiúsculas), usar penúltimo segmento como cidade + UF como estado.
export function extrairCidadeDeTextoLivre(localFree: string): string | null {
  const s = localFree.trim();
  if (!s) return null;

  // Quebra por vírgula e tira espaços.
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);

  // Caso A: ..., CIDADE, UF
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (/^[A-Z]{2}$/.test(last)) {
      const cidade = parts[parts.length - 2];
      return `${cidade}, ${last}`;
    }
  }

  // Caso B: "Cidade/UF" ou "Cidade - UF" no texto inteiro.
  const ufMatch = s.match(/([A-Za-zÀ-ÿ\s.'-]{2,})\s*[/-]\s*([A-Z]{2})\b/);
  if (ufMatch) {
    return `${ufMatch[1].trim()}, ${ufMatch[2]}`;
  }

  // Fallback: último segmento por vírgula.
  if (parts.length > 0) return parts[parts.length - 1];
  return s;
}
