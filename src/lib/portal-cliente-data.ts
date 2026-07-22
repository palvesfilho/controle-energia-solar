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

/** Tarifa de referência (R$/kWh) de fallback quando não há fatura para derivar a tarifa real. */
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
  /**
   * Consumo TOTAL do mês (kWh) = consumo da rede (faturas das UCs) + autoconsumo
   * instantâneo (geração − injeção no medidor). Mesma definição do relatório do
   * cliente. null quando não há fatura para o mês.
   */
  consumoKwh: number | null;
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
  // Tarifa (R$/kWh) usada nas estimativas de economia.
  tarifaRef: number;
  /** Mês da fatura de onde a tarifa foi extraída (ex.: "jun/26"), ou null se usou o fallback. */
  tarifaRefFonte: string | null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * UCs do proprietário: todas as consumidoras (beneficiárias + titular) e, à
 * parte, as titulares (geradoras) — usadas para separar a injeção no medidor.
 */
async function getProprietarioUcs(
  proprietarioId: string,
): Promise<{ allUcIds: string[]; titularUcIds: string[] }> {
  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    select: {
      codigoUc: true,
      codigoUcAntigo: true,
      beneficiarias: {
        where: { active: true },
        select: { consumerUnitId: true },
      },
    },
  });
  if (!prop) return { allUcIds: [], titularUcIds: [] };

  const allUcIds = new Set<string>();
  for (const b of prop.beneficiarias) {
    if (b.consumerUnitId) allUcIds.add(b.consumerUnitId);
  }
  // UC titular do proprietário, resolvida pelo código (novo ou antigo da RGE).
  const titularUcIds = new Set<string>();
  const codigos = [prop.codigoUc, prop.codigoUcAntigo].filter(
    (c): c is string => !!c,
  );
  if (codigos.length > 0) {
    const titulares = await prisma.consumerUnit.findMany({
      where: {
        OR: [{ codigoUc: { in: codigos } }, { codigoUcAntigo: { in: codigos } }],
      },
      select: { id: true },
    });
    for (const u of titulares) {
      titularUcIds.add(u.id);
      allUcIds.add(u.id);
    }
  }
  return { allUcIds: Array.from(allUcIds), titularUcIds: Array.from(titularUcIds) };
}

/**
 * Tarifa cheia de energia (TE + TUSD com tributos, R$/kWh) da fatura mais
 * recente ANTERIOR ao mês de referência do relatório, entre as UCs do
 * proprietário. É a tarifa que o cliente deixaria de pagar por kWh — base das
 * estimativas de economia. Retorna null se não houver fatura com tarifa; o
 * chamador cai no TARIFA_REF de fallback.
 */
async function resolveTarifaReferencia(
  ucIds: string[],
  refAno: number,
  refMes: number,
): Promise<{ tarifa: number; ano: number; mes: number } | null> {
  if (ucIds.length === 0) return null;

  // Fatura mais recente ESTRITAMENTE antes do mês de referência com tarifa cheia.
  const bill = await prisma.consumerBill.findFirst({
    where: {
      consumerUnitId: { in: ucIds },
      AND: [
        {
          OR: [
            { anoReferencia: { lt: refAno } },
            { anoReferencia: refAno, mesReferencia: { lt: refMes } },
          ],
        },
        {
          OR: [
            { tarifaTeComTributos: { not: null } },
            { tarifaTusdComTributos: { not: null } },
          ],
        },
      ],
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: {
      tarifaTeComTributos: true,
      tarifaTusdComTributos: true,
      anoReferencia: true,
      mesReferencia: true,
    },
  });
  if (!bill) return null;

  const tarifa =
    (bill.tarifaTeComTributos ?? 0) + (bill.tarifaTusdComTributos ?? 0);
  return tarifa > 0
    ? { tarifa, ano: bill.anoReferencia, mes: bill.mesReferencia }
    : null;
}

/**
 * Consumo mensal agregado das faturas do proprietário, por "YYYY-MM":
 *   - rede: Σ ConsumerBill.consumoKwh (todas as UCs consumidoras)
 *   - injetada: Σ energiaInjetadaMedidorKwh (só das UCs titulares/geradoras)
 * O consumo instantâneo (geração − injetada) é somado depois, no chamador, que
 * tem a geração medida por mês. Só entram meses que têm alguma fatura.
 */
async function getConsumoPorMes(
  allUcIds: string[],
  titularUcIds: string[],
): Promise<Map<string, { rede: number | null; injetada: number | null }>> {
  const map = new Map<string, { rede: number | null; injetada: number | null }>();
  if (allUcIds.length === 0) return map;

  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: { in: allUcIds } },
    select: {
      consumerUnitId: true,
      anoReferencia: true,
      mesReferencia: true,
      consumoKwh: true,
      energiaInjetadaMedidorKwh: true,
    },
  });

  const titularSet = new Set(titularUcIds);
  for (const b of bills) {
    const ym = `${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}`;
    const cur = map.get(ym) ?? { rede: null, injetada: null };
    if (b.consumoKwh != null) cur.rede = (cur.rede ?? 0) + b.consumoKwh;
    if (
      b.consumerUnitId &&
      titularSet.has(b.consumerUnitId) &&
      b.energiaInjetadaMedidorKwh != null
    ) {
      cur.injetada = (cur.injetada ?? 0) + b.energiaInjetadaMedidorKwh;
    }
    map.set(ym, cur);
  }
  return map;
}

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
    tarifaRef: TARIFA_REF,
    tarifaRefFonte: null,
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
      return { ano, mes, label: `${MES_ABREV[mes - 1]}/${String(ano).slice(2)}`, kwh: round1(kwh), consumoKwh: null };
    });

  // Consumo mensal (rede + autoconsumo instantâneo) das faturas do proprietário.
  const { allUcIds, titularUcIds } = await getProprietarioUcs(proprietarioId);
  const consumoMap = await getConsumoPorMes(allUcIds, titularUcIds);
  for (const m of porMes) {
    const ym = `${m.ano}-${String(m.mes).padStart(2, "0")}`;
    const c = consumoMap.get(ym);
    if (c && c.rede != null) {
      // Instantâneo = geração medida − injeção no medidor (só quando há injeção).
      const instantaneo = c.injetada != null ? Math.max(0, m.kwh - c.injetada) : 0;
      m.consumoKwh = round1(c.rede + instantaneo);
    }
  }

  const geracao12m = round1(porMes.slice(-12).reduce((s, m) => s + m.kwh, 0));

  // Mês de referência = último mês com dados.
  const ref = porMes[porMes.length - 1];
  const refPrefix = `${ref.ano}-${String(ref.mes).padStart(2, "0")}`;
  const refDias: PortalDiaGeracao[] = Array.from(porDia.entries())
    .filter(([day]) => day.startsWith(refPrefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, kwh]) => ({ dia: Number(day.slice(8, 10)), kwh: round1(kwh) }));

  const refMediaDia = refDias.length > 0 ? ref.kwh / refDias.length : 0;

  // Tarifa de referência = tarifa cheia da fatura do mês anterior ao relatório.
  const tarifaResolvida = await resolveTarifaReferencia(allUcIds, ref.ano, ref.mes);
  const tarifaRef = tarifaResolvida?.tarifa ?? TARIFA_REF;
  const tarifaRefFonte = tarifaResolvida
    ? `${MES_ABREV[tarifaResolvida.mes - 1]}/${String(tarifaResolvida.ano).slice(2)}`
    : null;

  return {
    usinas,
    potenciaTotal,
    refLabel: `${MES_ABREV[ref.mes - 1]}/${String(ref.ano).slice(2)}`,
    refKwh: ref.kwh,
    refMediaDia: round1(refMediaDia),
    refEconomia: Math.round(ref.kwh * tarifaRef),
    refDias,
    geracao12m,
    economia12m: Math.round(geracao12m * tarifaRef),
    co2EvitadoKg: Math.round(geracao12m * FATOR_CO2),
    arvoresEquivalentes: Math.round((geracao12m * FATOR_CO2) / KG_CO2_POR_ARVORE_ANO),
    porMes: porMes.slice(-13),
    temDados: true,
    tarifaRef,
    tarifaRefFonte,
  };
}

export const PORTAL_TARIFA_REF = TARIFA_REF;
