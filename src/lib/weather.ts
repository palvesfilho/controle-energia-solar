// Wrapper Open-Meteo (https://open-meteo.com) — sem chave de API.
// Geocodifica cidade e busca previsão de até 16 dias. Cache em memória
// no servidor pra não bater a API a cada requisição.

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

export async function geocodeCidade(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const key = geocodeCacheKey(trimmed);
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < GEOCODE_TTL_MS) {
    return cached.value;
  }

  const url = `${GEOCODE_URL}?name=${encodeURIComponent(trimmed)}&count=1&language=pt&format=json`;
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
        admin1?: string;
      }>;
    };
    const first = data.results?.[0];
    const value: GeocodeResult | null = first
      ? {
          latitude: first.latitude,
          longitude: first.longitude,
          name: first.name,
          country: first.country ?? null,
          admin1: first.admin1 ?? null,
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
// O usuário às vezes coloca endereço completo ("Rua X, 123 - Centro, Caxias do Sul/RS").
// Pegamos a última parte separada por vírgula/hífen, que costuma ser a cidade.
export function extrairCidadeDeTextoLivre(localFree: string): string | null {
  const s = localFree.trim();
  if (!s) return null;
  // Tenta pegar trecho "Cidade/UF" ou "Cidade - UF"
  const ufMatch = s.match(/([A-Za-zÀ-ÿ\s.'-]{2,})\s*[/-]\s*([A-Z]{2})\b/);
  if (ufMatch) {
    return `${ufMatch[1].trim()}, ${ufMatch[2]}`;
  }
  // Fallback: pega último segmento separado por vírgula
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 0) return parts[parts.length - 1];
  return s;
}
