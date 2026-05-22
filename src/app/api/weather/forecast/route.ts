import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import {
  buscarPrevisao,
  classifyWeatherCode,
  type WeatherKind,
} from "@/lib/weather";

export interface ForecastPoint {
  key: string; // identificador escolhido pelo client (ex: "lat,lon")
  lat: number;
  lon: number;
}

export interface ForecastDay {
  date: string; // YYYY-MM-DD
  kind: WeatherKind;
  weatherCode: number;
  tMax: number;
  tMin: number;
  precipitationProbabilityMax: number;
}

export interface ForecastResponse {
  forecasts: Record<string, ForecastDay[]>;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { points?: ForecastPoint[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const points = Array.isArray(body.points) ? body.points : [];
  if (points.length === 0) {
    return NextResponse.json({ forecasts: {} } satisfies ForecastResponse);
  }

  // Limita a 30 pontos por request pra evitar abuso.
  const limited = points.slice(0, 30);

  const results = await Promise.all(
    limited.map(async (p) => {
      if (
        !Number.isFinite(p.lat) ||
        !Number.isFinite(p.lon) ||
        Math.abs(p.lat) > 90 ||
        Math.abs(p.lon) > 180
      ) {
        return [p.key, [] as ForecastDay[]] as const;
      }
      const previsao = await buscarPrevisao(p.lat, p.lon);
      const dias: ForecastDay[] = previsao.map((d) => ({
        date: d.date,
        kind: classifyWeatherCode(d.weatherCode),
        weatherCode: d.weatherCode,
        tMax: d.tMax,
        tMin: d.tMin,
        precipitationProbabilityMax: d.precipitationProbabilityMax,
      }));
      return [p.key, dias] as const;
    })
  );

  const forecasts: Record<string, ForecastDay[]> = {};
  for (const [key, days] of results) forecasts[key] = days;

  return NextResponse.json({ forecasts } satisfies ForecastResponse);
}
