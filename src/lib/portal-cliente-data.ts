/**
 * Dados do portal do cliente Brasil Solar — geração, economia e usinas do
 * proprietário logado. Lê MonitoringLog das usinas dele, deduplica por
 * usina/dia (bug conhecido de duplicação), agrega por mês e por dia do mês de
 * referência, e estima a economia.
 *
 * Só de leitura. Escopo garantido pelo chamador (portal-cliente identifica o
 * proprietário pelo clerkUserId).
 */
import { prisma } from "@/lib/prisma";

/** Tarifa de referência (R$/kWh) para estimar economia. Rotulada como estimativa na UI. */
const TARIFA_REF = 0.95;
/** Fator médio de emissão do SIN (kg CO₂/kWh) para a equivalência ambiental. */
const FATOR_CO2 = 0.0817;
/** kg de CO₂ absorvidos por árvore/ano (equivalência). */
const KG_CO2_POR_ARVORE_ANO = 21;

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export interface PortalUsina {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  potenciaInstalada: number | null;
  statusMonitoramento: string;
}

export interface PortalMesGeracao {
  ano: number;
  mes: number; // 1-12
  label: string; // ex.: "mai/26"
  kwh: number;
}

export interface PortalDiaGeracao {
  dia: number;
  kwh: number;
}

export interface PortalClienteData {
  usinas: PortalUsina[];
  potenciaTotal: number;
  // Mês de referência (último mês com dados)
  refLabel: string | null;
  refKwh: number;
  refMediaDia: number;
  refEconomia: number;
  refDias: PortalDiaGeracao[];
  // Janela de 12 meses
  geracao12m: number;
  economia12m: number;
  co2EvitadoKg: number;
  arvoresEquivalentes: number;
  porMes: PortalMesGeracao[];
  temDados: boolean;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export async function getPortalClienteData(
  proprietarioId: string,
): Promise<PortalClienteData> {
  const usinas = await prisma.brasilSolarClient.findMany({
    where: { proprietarioId, active: true },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      cidade: true,
      uf: true,
      potenciaInstalada: true,
      statusMonitoramento: true,
    },
  });

  const potenciaTotal = usinas.reduce((s, u) => s + (u.potenciaInstalada ?? 0), 0);

  const vazio: PortalClienteData = {
    usinas,
    potenciaTotal,
    refLabel: null,
    refKwh: 0,
    refMediaDia: 0,
    refEconomia: 0,
    refDias: [],
    geracao12m: 0,
    economia12m: 0,
    co2EvitadoKg: 0,
    arvoresEquivalentes: 0,
    porMes: [],
    temDados: false,
  };
  if (usinas.length === 0) return vazio;

  const desde = new Date();
  desde.setMonth(desde.getMonth() - 13);

  const rawLogs = await prisma.monitoringLog.findMany({
    where: { clientId: { in: usinas.map((u) => u.id) }, data: { gte: desde } },
    select: { clientId: true, data: true, geracaoDiaria: true },
    orderBy: { data: "asc" },
  });
  if (rawLogs.length === 0) return vazio;

  // Dedup por (usina, dia) — mantém o maior valor do dia (bug de duplicação).
  const byClientDay = new Map<string, number>();
  for (const l of rawLogs) {
    const key = `${l.clientId}|${l.data.toISOString().slice(0, 10)}`;
    const prev = byClientDay.get(key) ?? 0;
    if (l.geracaoDiaria > prev) byClientDay.set(key, l.geracaoDiaria);
  }

  // Soma por dia (todas as usinas) e por mês.
  const porDia = new Map<string, number>(); // "YYYY-MM-DD" -> kwh
  const porMesMap = new Map<string, number>(); // "YYYY-MM" -> kwh
  for (const [key, kwh] of byClientDay) {
    const day = key.split("|")[1]; // YYYY-MM-DD
    const month = day.slice(0, 7); // YYYY-MM
    porDia.set(day, (porDia.get(day) ?? 0) + kwh);
    porMesMap.set(month, (porMesMap.get(month) ?? 0) + kwh);
  }

  const porMes: PortalMesGeracao[] = Array.from(porMesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, kwh]) => {
      const [ano, mes] = ym.split("-").map(Number);
      return { ano, mes, label: `${MES_ABREV[mes - 1]}/${String(ano).slice(2)}`, kwh: round1(kwh) };
    });

  const geracao12m = round1(porMes.slice(-12).reduce((s, m) => s + m.kwh, 0));

  // Mês de referência = último mês com dados.
  const ref = porMes[porMes.length - 1];
  const refPrefix = `${ref.ano}-${String(ref.mes).padStart(2, "0")}`;
  const refDias: PortalDiaGeracao[] = Array.from(porDia.entries())
    .filter(([day]) => day.startsWith(refPrefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, kwh]) => ({ dia: Number(day.slice(8, 10)), kwh: round1(kwh) }));

  const refMediaDia = refDias.length > 0 ? ref.kwh / refDias.length : 0;

  return {
    usinas,
    potenciaTotal,
    refLabel: `${MES_ABREV[ref.mes - 1]}/${String(ref.ano).slice(2)}`,
    refKwh: ref.kwh,
    refMediaDia: round1(refMediaDia),
    refEconomia: Math.round(ref.kwh * TARIFA_REF),
    refDias,
    geracao12m,
    economia12m: Math.round(geracao12m * TARIFA_REF),
    co2EvitadoKg: Math.round(geracao12m * FATOR_CO2),
    arvoresEquivalentes: Math.round((geracao12m * FATOR_CO2) / KG_CO2_POR_ARVORE_ANO),
    porMes: porMes.slice(-13),
    temDados: true,
  };
}

export const PORTAL_TARIFA_REF = TARIFA_REF;
