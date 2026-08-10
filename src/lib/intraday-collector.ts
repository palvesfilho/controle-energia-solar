/**
 * Coleta intradiária multi-plataforma em slots fixos de 15 minutos.
 *
 * Substitui o coletor que só falava Sungrow e só rodava 5×/dia. Aqui as quatro
 * plataformas viram o mesmo formato — potência AC média (W) num slot de 15 min
 * — para que o gráfico "Geração diária" tenha a mesma resolução para todo
 * mundo, e para que somar a potência de várias usinas por instante faça
 * sentido (antes cada inversor caía num timestamp diferente).
 *
 * O que cada API entrega, medido em sondagem (2026-08-08):
 *
 *   SUNGROW   195 usinas · getDevicePointMinuteDataList aceita VÁRIOS ps_key na
 *                          mesma chamada (7 chaves custaram o mesmo que 1) →
 *                          a frota sai em ~10 chamadas por rodada.
 *   SOLAREDGE 241 usinas · /sites/{ids}/power é bulk e já devolve
 *                          QUARTER_OF_AN_HOUR nativo → 3 chamadas por rodada.
 *                          (/sites/{ids}/powerDetails responde 403: a chave da
 *                          conta não tem escopo pro detalhado em lote.)
 *   FRONIUS  1274 usinas · NÃO tem rota de frota (404 em /pvsystems/histdata e
 *                          /pvsystems/flowdata) → 1 chamada por usina. Medido:
 *                          128ms/usina com concorrência 15, sem 429 → ~163s por
 *                          rodada, dentro da janela de 900s.
 *   HUAWEI    105 usinas · a mais restritiva: o login devolve
 *                          ACCESS_FREQUENCY_IS_TOO_HIGH (failCode 407) se
 *                          chamado com frequência. Usa o token cacheado da lib
 *                          e recua sozinho quando a API reclama.
 *
 * Convenção de `psKey` no banco: Sungrow mantém o formato nativo
 * (`psId_deviceType_typeId_pointId`, já são 720 mil linhas assim); as demais
 * plataformas gravam com prefixo — `SE:`, `FR:`, `HW:` — pra que a origem de
 * cada linha seja legível sem consultar a usina.
 */
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dentroDaJanelaSolar } from "@/lib/janela-solar";
import { sungrowFetch } from "@/lib/sungrow";

export type PlataformaIntradia = "SUNGROW" | "SOLAREDGE" | "FRONIUS" | "HUAWEI" | "GROWATT";

export const PLATAFORMAS_INTRADIA: PlataformaIntradia[] = [
  "SUNGROW",
  "SOLAREDGE",
  "FRONIUS",
  "HUAWEI",
  "GROWATT",
];

/** Duração do slot. Muda isto e a resolução de todo o sistema muda junto. */
export const SLOT_MINUTOS = 15;
const SLOT_MS = SLOT_MINUTOS * 60 * 1000;
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

// A janela solar mora em `lib/janela-solar` — a MESMA definição serve pra
// decidir quando coletar e pra decidir quando a falta de dado vira alerta de
// usina muda. Duas definições separadas criariam alerta em horário que o
// coletor nem tenta.
export { dentroDaJanelaSolar };

/**
 * Uma amostra já normalizada: a potência AC média durante o slot que começa em
 * `slotInicio`. `energiaDiaWh` só vem preenchido nas plataformas que entregam o
 * acumulado do dia (Sungrow); nas outras é derivado na hora de fechar o dia.
 */
export interface SlotAmostra {
  clientId: string;
  psKey: string;
  slotInicio: Date;
  potenciaMediaW: number | null;
  energiaDiaWh: number | null;
  energiaLifetimeWh: number | null;
}

export interface ResumoPlataforma {
  plataforma: PlataformaIntradia;
  usinas: number;
  usinasComDado: number;
  chamadas: number;
  slotsGravados: number;
  erros: string[];
  duracaoMs: number;
}

export interface ResumoColeta {
  janelaInicio: Date;
  janelaFim: Date;
  plataformas: ResumoPlataforma[];
  slotsGravados: number;
  duracaoMs: number;
  puladoPorJanelaSolar: boolean;
  /** Slots coletados. Só vem preenchido com `persistir: false`. */
  slots?: SlotAmostra[];
}

interface UsinaAlvo {
  id: string;
  nome: string;
  plantId: string;
}

// ============================================================
// Tempo e slots
// ============================================================

/** Arredonda um instante pra baixo no múltiplo de 15 min (em UTC). */
export function alinharSlot(d: Date): Date {
  return new Date(Math.floor(d.getTime() / SLOT_MS) * SLOT_MS);
}

/**
 * Janela a coletar: os últimos `minutos` alinhados em slots. Coletamos mais que
 * um slot de propósito — o datalogger sobe o dado com atraso, e assim uma
 * rodada conserta o que a anterior pegou incompleto sem precisar de backfill.
 */
export function janelaColeta(agora: Date, minutos = 45): { inicio: Date; fim: Date } {
  const fim = new Date(alinharSlot(agora).getTime() + SLOT_MS);
  const inicio = new Date(alinharSlot(new Date(agora.getTime() - minutos * 60 * 1000)).getTime());
  return { inicio, fim };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "YYYYMMDDHHmmss" em UTC — formato de timestamp da Sungrow. */
function stampSungrow(d: Date): string {
  return (
    `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}` +
    `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`
  );
}

/** "YYYY-MM-DD HH:mm:ss" no horário local do site (BRT) — formato do SolarEdge. */
function stampLocalBrt(d: Date): string {
  const b = new Date(d.getTime() - BRT_OFFSET_MS);
  return (
    `${b.getUTCFullYear()}-${p2(b.getUTCMonth() + 1)}-${p2(b.getUTCDate())} ` +
    `${p2(b.getUTCHours())}:${p2(b.getUTCMinutes())}:${p2(b.getUTCSeconds())}`
  );
}

/** Interpreta "YYYY-MM-DD HH:mm:ss" (horário local BRT) como instante UTC. */
function parseLocalBrt(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number) as unknown as number[];
  return new Date(Date.UTC(y, mo - 1, d, h, mi, se) + BRT_OFFSET_MS);
}

/**
 * Agrega pontos soltos nos slots de 15 min.
 * `modo: "media"` para potência instantânea (Sungrow, SolarEdge);
 * `modo: "energia"` para plataformas que entregam Wh por intervalo (Fronius):
 * soma o Wh do slot e converte em potência média (Wh ÷ 0,25h).
 */
function agregarEmSlots(
  pontos: Array<{ t: Date; valor: number | null }>,
  modo: "media" | "energia",
): Map<number, number> {
  const acc = new Map<number, { soma: number; n: number }>();
  for (const p of pontos) {
    if (p.valor == null || !Number.isFinite(p.valor)) continue;
    const slot = alinharSlot(p.t).getTime();
    const cur = acc.get(slot) ?? { soma: 0, n: 0 };
    cur.soma += p.valor;
    cur.n += 1;
    acc.set(slot, cur);
  }
  const out = new Map<number, number>();
  for (const [slot, { soma, n }] of acc) {
    // energia: Wh acumulado no slot ÷ 0,25 h = W médio.
    out.set(slot, modo === "energia" ? soma / (SLOT_MINUTOS / 60) : soma / n);
  }
  return out;
}

// ============================================================
// Persistência
// ============================================================

/**
 * Grava os slots com upsert em lote (`ON CONFLICT DO UPDATE`).
 *
 * Prisma não tem upsert em lote, e uma rodada produz milhares de linhas — um
 * `upsert()` por linha viraria milhares de idas ao banco e não fecharia dentro
 * do intervalo de 15 min. Daí o SQL cru, em blocos.
 */
export async function gravarSlots(slots: SlotAmostra[]): Promise<number> {
  if (slots.length === 0) return 0;

  // Duas linhas com a mesma chave no mesmo INSERT fazem o Postgres abortar o
  // comando inteiro ("ON CONFLICT DO UPDATE cannot affect row a second time") —
  // uma duplicata de um adapter derrubaria a gravação de toda a plataforma.
  // Aqui a última vence, e valores nulos nunca sobrescrevem um valor real.
  const unicos = new Map<string, SlotAmostra>();
  for (const s of slots) {
    const chave = `${s.psKey}|${s.slotInicio.getTime()}`;
    const anterior = unicos.get(chave);
    unicos.set(
      chave,
      anterior
        ? {
            ...s,
            potenciaMediaW: s.potenciaMediaW ?? anterior.potenciaMediaW,
            energiaDiaWh: Math.max(s.energiaDiaWh ?? 0, anterior.energiaDiaWh ?? 0) || null,
            energiaLifetimeWh:
              Math.max(s.energiaLifetimeWh ?? 0, anterior.energiaLifetimeWh ?? 0) || null,
          }
        : s,
    );
  }

  const deduplicados = [...unicos.values()];
  const BLOCO = 500;
  let gravados = 0;

  for (let i = 0; i < deduplicados.length; i += BLOCO) {
    const bloco = deduplicados.slice(i, i + BLOCO);
    const values = bloco.map(
      (s) => Prisma.sql`(
        ${randomUUID()}, ${s.clientId}, ${s.psKey}, ${s.slotInicio},
        ${s.energiaDiaWh}, ${s.energiaLifetimeWh}, ${s.potenciaMediaW}, NOW()
      )`,
    );

    // COALESCE no p1/p2: uma rodada que só traz potência não pode apagar o
    // acumulado de energia que a rodada anterior já tinha gravado.
    gravados += await prisma.$executeRaw`
      INSERT INTO inverter_samples (id, client_id, ps_key, time_stamp, p1_wh, p2_wh, p_ac_w, created_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (ps_key, time_stamp) DO UPDATE SET
        p_ac_w = COALESCE(EXCLUDED.p_ac_w, inverter_samples.p_ac_w),
        p1_wh  = COALESCE(EXCLUDED.p1_wh,  inverter_samples.p1_wh),
        p2_wh  = COALESCE(EXCLUDED.p2_wh,  inverter_samples.p2_wh)
    `;
  }

  return gravados;
}

/**
 * Dispositivos já conhecidos de cada usina, lidos das amostras recentes.
 *
 * Descobrir dispositivo pela API custa uma chamada por usina — 1.819 chamadas
 * extras por rodada, mais caro que a coleta em si. Como o `psKey` de cada
 * inversor já está gravado, a lista sai de graça do banco; só quem nunca foi
 * coletado precisa da chamada de descoberta.
 */
async function dispositivosConhecidos(
  clientIds: string[],
  desde: Date,
): Promise<Map<string, string[]>> {
  if (clientIds.length === 0) return new Map();

  const rows = await prisma.inverterSample.findMany({
    where: { clientId: { in: clientIds }, timeStamp: { gte: desde } },
    select: { clientId: true, psKey: true },
    distinct: ["clientId", "psKey"],
  });

  const mapa = new Map<string, string[]>();
  for (const r of rows) {
    const lista = mapa.get(r.clientId) ?? [];
    lista.push(r.psKey);
    mapa.set(r.clientId, lista);
  }
  return mapa;
}

// ============================================================
// Adapter: SUNGROW
// ============================================================

/** Pontos pedidos por tipo de dispositivo (1 = inversor string, 55 = micro). */
const PONTOS_SUNGROW: Record<string, string> = {
  "1": "p1,p2,p14,p24",
  "55": "p51346,p51302,p51303",
};

/** O `ps_key` da Sungrow é `psId_deviceType_typeId_pointId`. */
function deviceTypeDoPsKey(psKey: string): string {
  return psKey.split("_")[1] ?? "1";
}

function amostraSungrow(
  s: Record<string, string>,
  deviceType: string,
): { pAcW: number | null; p1: number | null; p2: number | null; t: Date | null } {
  const num = (v: string | undefined) => {
    if (v == null || v === "" || v === "--") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const ts = String(s.time_stamp ?? "");
  const t =
    ts.length === 14
      ? new Date(
          Date.UTC(
            Number(ts.slice(0, 4)), Number(ts.slice(4, 6)) - 1, Number(ts.slice(6, 8)),
            Number(ts.slice(8, 10)), Number(ts.slice(10, 12)), Number(ts.slice(12, 14)),
          ),
        )
      : null;

  if (deviceType === "55") {
    return { t, pAcW: num(s.p51303), p1: num(s.p51346), p2: num(s.p51302) };
  }
  const p14 = num(s.p14);
  const p24 = num(s.p24);
  return {
    t,
    pAcW: p14 == null && p24 == null ? null : (p14 ?? 0) + (p24 ?? 0),
    p1: num(s.p1),
    p2: num(s.p2),
  };
}

/** Quantos ps_key mandamos por chamada. Sondado com 7; 20 é folgado e seguro. */
const SUNGROW_CHAVES_POR_CHAMADA = 20;

async function coletarSungrow(
  usinas: UsinaAlvo[],
  janela: { inicio: Date; fim: Date },
  resumo: ResumoPlataforma,
): Promise<SlotAmostra[]> {
  if (usinas.length === 0) return [];

  const porCliente = await dispositivosConhecidos(
    usinas.map((u) => u.id),
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  );

  // Descobre os inversores de quem ainda não tem amostra nenhuma.
  const semDispositivo = usinas.filter((u) => !porCliente.get(u.id)?.length);
  if (semDispositivo.length > 0) {
    const { getDeviceList } = await import("@/lib/sungrow");
    for (const u of semDispositivo) {
      try {
        resumo.chamadas++;
        const devs = await getDeviceList(u.plantId);
        const keys = devs
          .map((d) => {
            const raw = d as unknown as { ps_key?: string; device_type?: number };
            return { psKey: String(raw.ps_key ?? ""), tipo: Number(raw.device_type ?? d.dev_type) };
          })
          .filter((d) => d.psKey && (d.tipo === 1 || d.tipo === 55))
          .map((d) => d.psKey);
        if (keys.length) porCliente.set(u.id, keys);
      } catch (e) {
        resumo.erros.push(`${u.nome}: descoberta de inversores — ${msg(e)}`);
      }
    }
  }

  // psKey → clientId, e agrupamento por tipo de dispositivo (os `points` mudam).
  const donoDaChave = new Map<string, string>();
  const porTipo = new Map<string, string[]>();
  for (const u of usinas) {
    for (const psKey of porCliente.get(u.id) ?? []) {
      if (psKey.startsWith("SE:") || psKey.startsWith("FR:") || psKey.startsWith("HW:")) continue;
      donoDaChave.set(psKey, u.id);
      const tipo = deviceTypeDoPsKey(psKey);
      const lista = porTipo.get(tipo) ?? [];
      lista.push(psKey);
      porTipo.set(tipo, lista);
    }
  }

  // Acumula as amostras cruas de cada inversor ANTES de agregar em slots. As
  // fatias da janela se sobrepõem na borda (o fim de uma é o início da outra),
  // então agregar por fatia produziria o mesmo slot duas vezes — e duas linhas
  // com a mesma chave no mesmo INSERT derrubam o `ON CONFLICT` inteiro.
  const crus = new Map<string, Array<ReturnType<typeof amostraSungrow>>>();

  for (const [tipo, chaves] of porTipo) {
    const points = PONTOS_SUNGROW[tipo] ?? PONTOS_SUNGROW["1"];

    for (let i = 0; i < chaves.length; i += SUNGROW_CHAVES_POR_CHAMADA) {
      const lote = chaves.slice(i, i + SUNGROW_CHAVES_POR_CHAMADA);
      // A rodada normal (45 min) cabe numa fatia só; o recorte existe pro modo
      // de recuperação (`--minutos=180`), em que a janela larga faria a API
      // responder "the query time interval exceeds the maximum limit".
      for (const fatia of fatiarJanelaSungrow(janela)) {
        try {
          resumo.chamadas++;
          const r = await sungrowFetch<{ result_data?: Record<string, Record<string, string>[]> }>(
            "/openapi/getDevicePointMinuteDataList",
            {
              ps_key_list: lote,
              points,
              start_time_stamp: stampSungrow(fatia.inicio),
              end_time_stamp: stampSungrow(fatia.fim),
            },
          );

          for (const [psKey, amostras] of Object.entries(r.result_data ?? {})) {
            if (!donoDaChave.has(psKey) || !Array.isArray(amostras)) continue;
            const lista = crus.get(psKey) ?? [];
            for (const a of amostras) {
              const m = amostraSungrow(a, tipo);
              if (m.t != null) lista.push(m);
            }
            crus.set(psKey, lista);
          }
        } catch (e) {
          resumo.erros.push(`lote Sungrow tipo ${tipo} (${lote.length} chaves): ${msg(e)}`);
        }
      }
    }
  }

  const slots: SlotAmostra[] = [];
  const comDado = new Set<string>();

  for (const [psKey, mapeadas] of crus) {
    const clientId = donoDaChave.get(psKey);
    if (!clientId || mapeadas.length === 0) continue;

    const potencia = agregarEmSlots(
      mapeadas.map((a) => ({ t: a.t!, valor: a.pAcW })),
      "media",
    );

    // p1/p2 são contadores acumulados: no slot vale o MAIOR, não a média.
    const acumulado = new Map<number, { p1: number | null; p2: number | null }>();
    for (const a of mapeadas) {
      const slot = alinharSlot(a.t!).getTime();
      const cur = acumulado.get(slot) ?? { p1: null, p2: null };
      if (a.p1 != null) cur.p1 = Math.max(cur.p1 ?? 0, a.p1);
      if (a.p2 != null) cur.p2 = Math.max(cur.p2 ?? 0, a.p2);
      acumulado.set(slot, cur);
    }

    for (const slot of new Set([...potencia.keys(), ...acumulado.keys()])) {
      comDado.add(clientId);
      slots.push({
        clientId,
        psKey,
        slotInicio: new Date(slot),
        potenciaMediaW: potencia.get(slot) ?? null,
        energiaDiaWh: acumulado.get(slot)?.p1 ?? null,
        energiaLifetimeWh: acumulado.get(slot)?.p2 ?? null,
      });
    }
  }

  resumo.usinasComDado = comDado.size;
  return slots;
}

/** Teto de janela por chamada na Sungrow — acima disso a API recusa. */
const SUNGROW_MAX_JANELA_MS = 3 * 60 * 60 * 1000;

function fatiarJanelaSungrow(janela: { inicio: Date; fim: Date }): Array<{ inicio: Date; fim: Date }> {
  const fatias: Array<{ inicio: Date; fim: Date }> = [];
  let cursor = janela.inicio.getTime();
  while (cursor < janela.fim.getTime()) {
    const fim = Math.min(cursor + SUNGROW_MAX_JANELA_MS, janela.fim.getTime());
    fatias.push({ inicio: new Date(cursor), fim: new Date(fim) });
    cursor = fim;
  }
  return fatias;
}

// ============================================================
// Adapter: SOLAREDGE
// ============================================================

const SOLAREDGE_BASE_URL = "https://monitoringapi.solaredge.com";
/** Teto documentado do endpoint em lote. */
const SOLAREDGE_SITES_POR_CHAMADA = 100;

interface SolarEdgeBulkPower {
  powerDateValuesList?: {
    timeUnit?: string;
    siteEnergyList?: Array<{
      siteId: number;
      powerDataValueSeries?: { values?: Array<{ date: string; value?: number | null }> };
    }>;
  };
}

async function coletarSolarEdge(
  usinas: UsinaAlvo[],
  janela: { inicio: Date; fim: Date },
  resumo: ResumoPlataforma,
): Promise<SlotAmostra[]> {
  if (usinas.length === 0) return [];

  const apiKey = process.env.SOLAREDGE_API_KEY;
  if (!apiKey) {
    resumo.erros.push("SOLAREDGE_API_KEY não configurada");
    return [];
  }

  const porSite = new Map<string, UsinaAlvo>();
  for (const u of usinas) porSite.set(String(u.plantId), u);

  const ids = [...porSite.keys()];
  const slots: SlotAmostra[] = [];
  const comDado = new Set<string>();

  for (let i = 0; i < ids.length; i += SOLAREDGE_SITES_POR_CHAMADA) {
    const lote = ids.slice(i, i + SOLAREDGE_SITES_POR_CHAMADA);
    const params = new URLSearchParams({
      api_key: apiKey,
      startTime: stampLocalBrt(janela.inicio),
      endTime: stampLocalBrt(janela.fim),
    });

    try {
      resumo.chamadas++;
      const res = await fetch(`${SOLAREDGE_BASE_URL}/sites/${lote.join(",")}/power?${params}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        resumo.erros.push(`lote SolarEdge (${lote.length} sites): HTTP ${res.status}`);
        continue;
      }

      const body = (await res.json()) as SolarEdgeBulkPower;
      for (const site of body.powerDateValuesList?.siteEnergyList ?? []) {
        const usina = porSite.get(String(site.siteId));
        if (!usina) continue;

        for (const v of site.powerDataValueSeries?.values ?? []) {
          if (v.value == null) continue;
          const t = parseLocalBrt(v.date);
          if (!t) continue;
          comDado.add(usina.id);
          slots.push({
            clientId: usina.id,
            // A API já entrega QUARTER_OF_AN_HOUR: o ponto JÁ é o slot.
            psKey: `SE:${site.siteId}`,
            slotInicio: alinharSlot(t),
            potenciaMediaW: v.value,
            energiaDiaWh: null,
            energiaLifetimeWh: null,
          });
        }
      }
    } catch (e) {
      resumo.erros.push(`lote SolarEdge (${lote.length} sites): ${msg(e)}`);
    }
  }

  resumo.usinasComDado = comDado.size;
  return slots;
}

// ============================================================
// Adapter: FRONIUS
// ============================================================

const FRONIUS_BASE_URL = "https://api.solarweb.com/swqapi";
/**
 * Sem rota de frota, é uma chamada por usina — 1.274 por rodada.
 *
 * O ritmo saiu de medição, não de chute: 15 simultâneas passam limpo numa
 * amostra de 30 usinas, mas em carga sustentada a API começa a devolver
 * 429/503 por volta da 900ª chamada (≈22 req/s). Com 6 simultâneas o ritmo
 * fica em torno de 8 req/s e a frota inteira leva ~160s — folgado dentro da
 * janela de 900s, que é o que importa aqui: não adianta ser rápido e ser
 * barrado no meio.
 */
const FRONIUS_CONCORRENCIA = 6;
/** Pausa após um 429/503, pra devolver fôlego à API antes do próximo lote. */
const FRONIUS_PAUSA_APOS_RECUSA_MS = 3000;
/** Canais de energia produzida no intervalo, em ordem de preferência. */
const FRONIUS_CANAL = "EnergyProductionTotal";

interface FroniusHistData {
  data?: Array<{
    logDateTime: string;
    logDuration: number;
    channels?: Array<{ channelName: string; value: number | null }>;
  }>;
  links?: { next?: string | null };
}

/** Teto de páginas por usina — a rodada normal (45 min) cabe na primeira. */
const FRONIUS_MAX_PAGINAS = 12;

async function coletarFronius(
  usinas: UsinaAlvo[],
  janela: { inicio: Date; fim: Date },
  resumo: ResumoPlataforma,
): Promise<SlotAmostra[]> {
  if (usinas.length === 0) return [];

  const keyId = process.env.FRONIUS_ACCESS_KEY_ID;
  const keyValue = process.env.FRONIUS_ACCESS_KEY_VALUE;
  if (!keyId || !keyValue) {
    resumo.erros.push("Credenciais Fronius não configuradas");
    return [];
  }

  const headers = { AccessKeyId: keyId, AccessKeyValue: keyValue, Accept: "application/json" };
  const from = janela.inicio.toISOString().replace(/\.\d{3}Z$/, "Z");
  const to = janela.fim.toISOString().replace(/\.\d{3}Z$/, "Z");
  const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&channel=${FRONIUS_CANAL}&timezone=zulu&limit=200`;

  const slots: SlotAmostra[] = [];
  const comDado = new Set<string>();
  // Uma usina que devolve 429 não deve arrastar as outras 1.273. Recusa em
  // série significa que estamos rápido demais: pausamos e seguimos, em vez de
  // abandonar a frota — abandonar deixaria as últimas usinas da lista sem
  // curva TODO dia, sempre as mesmas, e ninguém perceberia.
  let recusas = 0;
  let recusasTotais = 0;

  for (let i = 0; i < usinas.length; i += FRONIUS_CONCORRENCIA) {
    if (recusas >= 6) {
      await new Promise((r) => setTimeout(r, FRONIUS_PAUSA_APOS_RECUSA_MS));
      recusas = 0;
    }

    const lote = usinas.slice(i, i + FRONIUS_CONCORRENCIA);
    await Promise.all(
      lote.map(async (u) => {
        try {
          // A janela de uma rodada cabe numa página; o laço existe pro modo de
          // recuperação e pro fechamento do dia, que pedem 16h de uma vez.
          let url: string | null = `${FRONIUS_BASE_URL}/pvsystems/${u.plantId}/histdata?${qs}`;
          const pontos: Array<{ t: Date; valor: number | null }> = [];

          for (let pagina = 0; url && pagina < FRONIUS_MAX_PAGINAS; pagina++) {
            resumo.chamadas++;
            const res: Response = await fetch(url, { headers, cache: "no-store" });
            if (res.status === 429 || res.status === 503) {
              recusas++;
              recusasTotais++;
              return;
            }
            if (!res.ok) {
              // 400/404 aqui é usina sem datalogger ativo — ruído, não incidente.
              if (res.status >= 500) resumo.erros.push(`${u.nome}: HTTP ${res.status}`);
              return;
            }
            recusas = 0;

            const body = (await res.json()) as FroniusHistData;
            for (const d of body.data ?? []) {
              pontos.push({
                t: new Date(d.logDateTime),
                valor: d.channels?.find((c) => c.channelName === FRONIUS_CANAL)?.value ?? null,
              });
            }
            url = body.links?.next ?? null;
          }

          // Wh por intervalo de ~300s → potência média do slot.
          const potencia = agregarEmSlots(pontos, "energia");
          if (potencia.size === 0) return;

          comDado.add(u.id);
          for (const [slot, w] of potencia) {
            slots.push({
              clientId: u.id,
              psKey: `FR:${u.plantId}`,
              slotInicio: new Date(slot),
              potenciaMediaW: w,
              energiaDiaWh: null,
              energiaLifetimeWh: null,
            });
          }
        } catch (e) {
          if (resumo.erros.length < 30) resumo.erros.push(`${u.nome}: ${msg(e)}`);
        }
      }),
    );
  }

  // Recusa isolada é ruído; recusa em volume é sinal de que o ritmo precisa
  // baixar — e sem registrar isso a frota perderia usinas em silêncio.
  if (recusasTotais > 0) {
    resumo.erros.push(
      `${recusasTotais} usina(s) recusadas com 429/503 — a API pediu ritmo menor`,
    );
  }

  resumo.usinasComDado = comDado.size;
  return slots;
}

// ============================================================
// Adapter: HUAWEI
// ============================================================

/**
 * A Huawei é a mais avarenta: o próprio login responde
 * ACCESS_FREQUENCY_IS_TOO_HIGH (failCode 407) quando chamado com frequência, e
 * `getDevFiveMinutes` tem limite próprio por interface. Por isso aqui: token
 * cacheado da lib, um dia inteiro por chamada (não uma janela curta) e desiste
 * na primeira reclamação de frequência em vez de insistir.
 */
const HUAWEI_DEVICES_POR_CHAMADA = 100;
/** Tipos de dispositivo que geram energia — mesmo conjunto usado pelo resto da lib. */
const HUAWEI_TIPOS_INVERSOR = new Set([1, 38, 39]);
/** Usinas novas descobertas por rodada. Ver comentário na descoberta. */
const HUAWEI_DESCOBERTAS_POR_RODADA = 3;

/**
 * `HW:{devTypeId}:{devId}` — o tipo entra na chave porque o
 * `getDevFiveMinutes` exige um único `devTypeId` por chamada. Sem guardá-lo,
 * toda rodada teria que redescobrir o tipo via `/getDevList`, que é justamente
 * a chamada que a cota da Huawei não perdoa.
 */
function psKeyHuawei(devTypeId: number, devId: number | string): string {
  return `HW:${devTypeId}:${devId}`;
}

function parsePsKeyHuawei(psKey: string): { devTypeId: number; devId: string } | null {
  const m = /^HW:(\d+):(.+)$/.exec(psKey);
  return m ? { devTypeId: Number(m[1]), devId: m[2] } : null;
}

async function coletarHuawei(
  usinas: UsinaAlvo[],
  janela: { inicio: Date; fim: Date },
  resumo: ResumoPlataforma,
): Promise<SlotAmostra[]> {
  if (usinas.length === 0) return [];

  const { getDeviceList, getDeviceFiveMinutes } = await import("@/lib/huawei");

  const porCliente = await dispositivosConhecidos(
    usinas.map((u) => u.id),
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  );

  // devId → { clientId, devTypeId }
  const donoDoDevice = new Map<string, { clientId: string; devTypeId: number }>();
  const comDeviceConhecido = new Set<string>();
  for (const u of usinas) {
    for (const psKey of porCliente.get(u.id) ?? []) {
      const p = parsePsKeyHuawei(psKey);
      if (!p) continue;
      donoDoDevice.set(p.devId, { clientId: u.id, devTypeId: p.devTypeId });
      comDeviceConhecido.add(u.id);
    }
  }

  // Descoberta só de quem não tem device conhecido — cada uma custa 1 chamada
  // ao `/getDevList`, e a Huawei responde 407 (frequência alta) bem antes das
  // 105 usinas. Descobrindo poucas por rodada, a frota se completa ao longo do
  // dia (96 rodadas × 3) sem estourar a cota logo na primeira.
  const aDescobrir = usinas.filter((x) => !comDeviceConhecido.has(x.id));
  for (const u of aDescobrir.slice(0, HUAWEI_DESCOBERTAS_POR_RODADA)) {
    try {
      resumo.chamadas++;
      const devs = await getDeviceList(u.plantId);
      for (const d of devs) {
        const raw = d as unknown as { id?: number | string; devTypeId?: number };
        const tipo = Number(raw.devTypeId ?? d.devTypeId);
        if (raw.id != null && HUAWEI_TIPOS_INVERSOR.has(tipo)) {
          donoDoDevice.set(String(raw.id), { clientId: u.id, devTypeId: tipo });
        }
      }
    } catch (e) {
      resumo.erros.push(`${u.nome}: descoberta de dispositivos — ${msg(e)}`);
      // 407 = ACCESS_FREQUENCY_IS_TOO_HIGH. Insistir só afunda mais a cota.
      if (msg(e).includes("407")) break;
    }
  }

  const slots: SlotAmostra[] = [];
  const comDado = new Set<string>();

  // Agrupa por devTypeId: o endpoint aceita um tipo por chamada.
  const porTipo = new Map<number, string[]>();
  for (const [devId, info] of donoDoDevice) {
    const lista = porTipo.get(info.devTypeId) ?? [];
    lista.push(devId);
    porTipo.set(info.devTypeId, lista);
  }

  cotaHuawei: for (const [devTypeId, devIds] of porTipo) {
    for (let i = 0; i < devIds.length; i += HUAWEI_DEVICES_POR_CHAMADA) {
      const lote = devIds.slice(i, i + HUAWEI_DEVICES_POR_CHAMADA);
      try {
        resumo.chamadas++;
        const leituras = await getDeviceFiveMinutes(lote, janela.inicio, devTypeId);
        for (const l of leituras) {
          const info = donoDoDevice.get(String(l.devId));
          if (!info) continue;
          const t = new Date(l.collectTime);
          if (t < janela.inicio || t >= janela.fim) continue;
          comDado.add(info.clientId);
          slots.push({
            clientId: info.clientId,
            psKey: psKeyHuawei(devTypeId, l.devId),
            slotInicio: alinharSlot(t),
            potenciaMediaW: l.activePowerW,
            energiaDiaWh: l.energiaDiaWh,
            energiaLifetimeWh: null,
          });
        }
      } catch (e) {
        resumo.erros.push(`lote Huawei tipo ${devTypeId} (${lote.length} devices): ${msg(e)}`);
        break cotaHuawei; // erro aqui costuma ser cota — não insiste
      }
    }
  }

  // O getDevFiveMinutes entrega 5 em 5 min: consolida em slots de 15.
  const consolidado = new Map<string, SlotAmostra>();
  for (const s of slots) {
    const chave = `${s.psKey}|${s.slotInicio.getTime()}`;
    const cur = consolidado.get(chave);
    if (!cur) {
      consolidado.set(chave, { ...s });
      continue;
    }
    if (s.potenciaMediaW != null) {
      cur.potenciaMediaW = ((cur.potenciaMediaW ?? 0) + s.potenciaMediaW) / 2;
    }
    if (s.energiaDiaWh != null) {
      cur.energiaDiaWh = Math.max(cur.energiaDiaWh ?? 0, s.energiaDiaWh);
    }
  }

  resumo.usinasComDado = comDado.size;
  return [...consolidado.values()];
}

// ============================================================
// Adapter: GROWATT
// ============================================================

const GROWATT_BASE_URL_INTRADIA = process.env.GROWATT_BASE_URL || "https://openapi.growatt.com";
/** Frota pequena (~78), mas a OpenAPI tem cota por endpoint — vai devagar. */
const GROWATT_CONCORRENCIA = 5;
/**
 * ⚠️ Unidade da potência do endpoint /v1/plant/power. A doc v1 indica WATT, mas
 * não pude confirmar contra dado real (token com 0 devices em 08/08/2026). Se a
 * validação ao vivo mostrar kW, trocar para 1000. É o ÚNICO ponto de dúvida de
 * unidade — deixado explícito de propósito (anomalia se sinaliza, não se silencia).
 */
const GROWATT_POTENCIA_PARA_W = 1;

interface GrowattPowerResponse {
  error_code: number;
  error_msg?: string;
  data?: { count?: number; powers?: Array<{ time?: string; power?: number | string | null }> };
}

/** Datas-calendário BRT (YYYY-MM-DD) tocadas pela janela — normalmente 1, 2 na virada. */
function datasBrtDaJanela(janela: { inicio: Date; fim: Date }): string[] {
  const dias = new Set<string>();
  dias.add(stampLocalBrt(janela.inicio).slice(0, 10));
  dias.add(stampLocalBrt(janela.fim).slice(0, 10));
  return [...dias];
}

async function coletarGrowatt(
  usinas: UsinaAlvo[],
  janela: { inicio: Date; fim: Date },
  resumo: ResumoPlataforma,
): Promise<SlotAmostra[]> {
  if (usinas.length === 0) return [];

  const token = process.env.GROWATT_TOKEN;
  if (!token) {
    resumo.erros.push("GROWATT_TOKEN não configurado");
    return [];
  }

  const dias = datasBrtDaJanela(janela);
  const headers = { token };
  const slots: SlotAmostra[] = [];
  const comDado = new Set<string>();

  for (let i = 0; i < usinas.length; i += GROWATT_CONCORRENCIA) {
    const lote = usinas.slice(i, i + GROWATT_CONCORRENCIA);
    await Promise.all(
      lote.map(async (u) => {
        for (const dia of dias) {
          try {
            resumo.chamadas++;
            const params = new URLSearchParams({ plant_id: u.plantId, date: dia });
            const res = await fetch(
              `${GROWATT_BASE_URL_INTRADIA}/v1/plant/power?${params}`,
              { headers, cache: "no-store" },
            );
            if (!res.ok) {
              if (res.status >= 500) resumo.erros.push(`${u.nome}: HTTP ${res.status}`);
              continue;
            }
            const body = (await res.json()) as GrowattPowerResponse;
            if (body.error_code !== 0) {
              // 0 devices / sem permissão / sem dado do dia — ruído esperado até o
              // vínculo no OSS; só registramos erro de servidor, não de negócio.
              continue;
            }
            for (const pt of body.data?.powers ?? []) {
              if (pt.power == null || !pt.time) continue;
              // Growatt manda "YYYY-MM-DD HH:mm" (sem segundos): normaliza pro parser.
              const stamp = /:\d{2}:\d{2}/.test(pt.time) ? pt.time : `${pt.time}:00`;
              const t = parseLocalBrt(stamp);
              if (!t) continue;
              if (t < janela.inicio || t >= janela.fim) continue;
              const watts =
                (typeof pt.power === "string" ? parseFloat(pt.power.replace(/,/g, "")) : pt.power) *
                GROWATT_POTENCIA_PARA_W;
              if (!Number.isFinite(watts)) continue;
              comDado.add(u.id);
              slots.push({
                clientId: u.id,
                psKey: `GW:${u.plantId}`,
                slotInicio: alinharSlot(t),
                potenciaMediaW: watts,
                energiaDiaWh: null,
                energiaLifetimeWh: null,
              });
            }
          } catch (e) {
            resumo.erros.push(`${u.nome} (${dia}): ${msg(e)}`);
          }
        }
      }),
    );
  }

  // O endpoint entrega pontos de ~5 min: consolida em slots de 15 (média), igual
  // ao Huawei, pra não gravar 3 amostras por slot.
  const consolidado = new Map<string, SlotAmostra>();
  for (const s of slots) {
    const chave = `${s.psKey}|${s.slotInicio.getTime()}`;
    const cur = consolidado.get(chave);
    if (!cur) {
      consolidado.set(chave, { ...s });
      continue;
    }
    if (s.potenciaMediaW != null) {
      cur.potenciaMediaW = ((cur.potenciaMediaW ?? 0) + s.potenciaMediaW) / 2;
    }
  }

  resumo.usinasComDado = comDado.size;
  return [...consolidado.values()];
}

// ============================================================
// Orquestração
// ============================================================

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const ADAPTERS: Record<
  PlataformaIntradia,
  (u: UsinaAlvo[], j: { inicio: Date; fim: Date }, r: ResumoPlataforma) => Promise<SlotAmostra[]>
> = {
  SUNGROW: coletarSungrow,
  SOLAREDGE: coletarSolarEdge,
  FRONIUS: coletarFronius,
  HUAWEI: coletarHuawei,
  GROWATT: coletarGrowatt,
};

export interface OpcoesColeta {
  /** Restringe a coleta a estas plataformas. Default: todas. */
  plataformas?: PlataformaIntradia[];
  /** Restringe a estas usinas (BrasilSolarClient.id). Default: a frota ativa. */
  clientIds?: string[];
  /** Quantos minutos pra trás coletar. Default 45 (3 slots). */
  minutos?: number;
  /** Instante de referência — existe pra teste; default `new Date()`. */
  agora?: Date;
  /** Coleta mesmo fora da janela solar (usado pelo fechamento do dia). */
  ignorarJanelaSolar?: boolean;
  /**
   * `false` devolve os slots em `ResumoColeta.slots` sem gravá-los.
   *
   * É o que torna viável recalcular a geração de meses passados: um backfill
   * de 39 dias sobre a frota gravaria da ordem de 4 milhões de linhas de
   * amostra só pra corrigir 39 totais diários por usina. Default: `true`.
   */
  persistir?: boolean;
}

/**
 * Roda uma rodada de coleta. É idempotente: chamar duas vezes na mesma janela
 * reescreve os mesmos slots com os mesmos valores.
 */
export async function coletarIntradia(opts: OpcoesColeta = {}): Promise<ResumoColeta> {
  const agora = opts.agora ?? new Date();
  const t0 = Date.now();
  const janela = janelaColeta(agora, opts.minutos ?? 45);
  const plataformas = opts.plataformas ?? PLATAFORMAS_INTRADIA;

  if (!opts.ignorarJanelaSolar && !dentroDaJanelaSolar(agora)) {
    return {
      janelaInicio: janela.inicio,
      janelaFim: janela.fim,
      plataformas: [],
      slotsGravados: 0,
      duracaoMs: Date.now() - t0,
      puladoPorJanelaSolar: true,
    };
  }

  const usinas = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      plataformaMonitoramento: { in: plataformas },
      monitoramentoPlantId: { not: null },
      ...(opts.clientIds ? { id: { in: opts.clientIds } } : {}),
    },
    select: { id: true, nome: true, monitoramentoPlantId: true, plataformaMonitoramento: true },
  });

  const resumos: ResumoPlataforma[] = [];
  const persistir = opts.persistir !== false;
  const coletados: SlotAmostra[] = [];
  let totalGravado = 0;

  for (const plataforma of plataformas) {
    const alvo: UsinaAlvo[] = usinas
      .filter((u) => u.plataformaMonitoramento === plataforma)
      .map((u) => ({ id: u.id, nome: u.nome, plantId: u.monitoramentoPlantId! }));

    const resumo: ResumoPlataforma = {
      plataforma,
      usinas: alvo.length,
      usinasComDado: 0,
      chamadas: 0,
      slotsGravados: 0,
      erros: [],
      duracaoMs: 0,
    };
    if (alvo.length === 0) {
      resumos.push(resumo);
      continue;
    }

    const tp = Date.now();
    try {
      const slots = await ADAPTERS[plataforma](alvo, janela, resumo);
      if (persistir) {
        resumo.slotsGravados = await gravarSlots(slots);
        totalGravado += resumo.slotsGravados;
      } else {
        resumo.slotsGravados = slots.length;
        coletados.push(...slots);
      }
    } catch (e) {
      resumo.erros.push(`falha geral: ${msg(e)}`);
    }
    resumo.duracaoMs = Date.now() - tp;
    resumos.push(resumo);
  }

  return {
    janelaInicio: janela.inicio,
    janelaFim: janela.fim,
    plataformas: resumos,
    slotsGravados: persistir ? totalGravado : coletados.length,
    duracaoMs: Date.now() - t0,
    puladoPorJanelaSolar: false,
    ...(persistir ? {} : { slots: coletados }),
  };
}
