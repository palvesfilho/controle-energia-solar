/**
 * Dados do portal do cliente Brasil Solar — geração, economia e usinas do
 * proprietário logado. Lê MonitoringLog das usinas dele, deduplica por
 * usina/dia (bug conhecido de duplicação), agrega por mês e por dia do mês de
 * referência, e estima a economia.
 *
 * Só de leitura (exceto `refreshAmostrasDia`, que coleta as amostras Sungrow do
 * dia sob demanda). Escopo garantido pelo chamador (portal-cliente identifica o
 * proprietário pelo clerkUserId).
 */
import { prisma } from "@/lib/prisma";
import { coletarIntradia, PLATAFORMAS_INTRADIA } from "@/lib/intraday-collector";
import { precoKwhSolar } from "@/lib/preco-kwh";

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

/** Ponto da curva intradiária: potência AC instantânea (kW) num horário BRT. */
export interface PortalPontoCurva {
  hora: string; // "HH:mm" em horário de Brasília
  kw: number;
}

/** Curva de um dia específico + total do dia. */
export interface PortalCurvaDia {
  /** Data consultada, "YYYY-MM-DD" (calendário de Brasília). */
  data: string;
  /** Rótulo amigável, ex.: "22/07/2026". */
  label: string;
  pontos: PortalPontoCurva[];
  /** Pico de potência (kW) no dia. */
  picoKw: number;
  /** Geração total do dia (kWh) vinda do MonitoringLog; null se não houver leitura. */
  totalKwh: number | null;
}

/**
 * Estado de comunicação das usinas do proprietário:
 *  - ONLINE: houve leitura recente (dentro da janela de sincronização);
 *  - REPOUSO: sem leitura recente, mas fora do horário de geração (noite);
 *  - OFFLINE: sem leitura recente em pleno horário de sol;
 *  - SEM_DADOS: nunca houve leitura instantânea (usina sem telemetria).
 */
export interface PortalStatusMonitoramento {
  estado: "ONLINE" | "REPOUSO" | "OFFLINE" | "SEM_DADOS";
  /** Última leitura instantânea, ISO em UTC. */
  ultimaLeituraIso: string | null;
  /** Última leitura formatada em horário de Brasília, ex.: "22/07 14:35". */
  ultimaLeituraLabel: string | null;
}

/** Série de barras genérica (mês do ano ou dia do mês). */
export interface PortalSerieGeracao {
  ano: number;
  /** Mês selecionado (1-12) quando a série é diária; null quando é anual. */
  mes: number | null;
  /**
   * `manual: true` = o kWh do ponto veio (em maior parte) de lançamento manual,
   * não de leitura da plataforma. O gráfico precisa dizer isso ao cliente.
   */
  pontos: { label: string; kwh: number; manual?: boolean }[];
  totalKwh: number;
  /** kWh do período informado manualmente — 0 quando tudo é medido. */
  manualKwh?: number;
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
  /** Curva intradiária do dia de HOJE (calendário de Brasília) — carga inicial. */
  curvaDia: PortalCurvaDia;
  /** Data de hoje em Brasília, "YYYY-MM-DD" (máximo do seletor de data). */
  hojeYmd: string;
  /** Estado de comunicação das usinas (online/offline). */
  statusMonitoramento: PortalStatusMonitoramento;
  /** Anos com geração registrada, do mais recente para o mais antigo. */
  anosDisponiveis: number[];
  /** Série mensal do ano corrente — carga inicial do gráfico "Geração Mensal". */
  serieMensal: PortalSerieGeracao;
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
            // Grupo A não preenche as tarifas "únicas" acima — o preço vem do
            // posto FORA PONTA. Sem estas linhas a fatura Grupo A nem era
            // considerada e o portal caía no TARIFA_REF de fallback.
            { consumoTusdForaPontaValor: { not: null } },
            { tarifaTusdForaPonta: { not: null } },
          ],
        },
      ],
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    select: {
      tarifaTeComTributos: true,
      tarifaTusdComTributos: true,
      // Grupo A — posto FORA PONTA: de onde sai o preco do kWh que o solar
      // evita (ver lib/preco-kwh.ts). Ausentes em fatura Grupo B.
      consumoTeForaPontaKwh: true,
      consumoTeForaPontaValor: true,
      consumoTusdForaPontaKwh: true,
      consumoTusdForaPontaValor: true,
      tarifaTeForaPonta: true,
      tarifaTusdForaPonta: true,
      anoReferencia: true,
      mesReferencia: true,
    },
  });
  if (!bill) return null;

  // 🔑 Grupo A: o preço é o do posto FORA PONTA, onde há sol. Ver lib/preco-kwh.ts.
  const tarifa = precoKwhSolar(bill).precoKwh ?? 0;
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

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "YYYY-MM-DD" de hoje no calendário de Brasília. */
export function hojeBrtYmd(): string {
  const brt = new Date(Date.now() - BRT_OFFSET_MS);
  return brt.toISOString().slice(0, 10);
}

/** Valida "YYYY-MM-DD"; devolve null quando o formato/data não bate. */
export function parseYmd(ymd: string | null | undefined): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return ymd;
}

/** Ano/mês de uma query string, com fallback no ano corrente e ano inteiro. */
export function parseAnoMes(sp: URLSearchParams): { ano: number; mes: number | null } {
  const anoRaw = Number(sp.get("ano"));
  const mesRaw = Number(sp.get("mes"));
  const ano =
    Number.isInteger(anoRaw) && anoRaw >= 2000 && anoRaw <= 2100
      ? anoRaw
      : Number(hojeBrtYmd().slice(0, 4));
  const mes = Number.isInteger(mesRaw) && mesRaw >= 1 && mesRaw <= 12 ? mesRaw : null;
  return { ano, mes };
}

/** Ids das usinas ativas do proprietário. */
async function getClientIds(proprietarioId: string): Promise<string[]> {
  const usinas = await prisma.brasilSolarClient.findMany({
    where: { proprietarioId, active: true },
    select: { id: true },
  });
  return usinas.map((u) => u.id);
}

/**
 * Curva de geração intradiária (potência AC instantânea, kW) de um dia
 * específico, somando todos os inversores/usinas do proprietário. Lê o `pAcW`
 * do `InverterSample` (só Sungrow persiste hoje) — null à noite, então a curva
 * cobre naturalmente só o período de sol. Timestamps são convertidos de UTC
 * para horário de Brasília (BRT, UTC−3); como toda a geração de um dia BRT cai
 * dentro do mesmo dia UTC, agrupar por dia UTC é equivalente aqui. As pontas em
 * zero (antes do nascer e depois do pôr do sol) são aparadas — ver comentário
 * no recorte.
 *
 * `totalKwh` vem do MonitoringLog do dia (leitura oficial da distribuidora do
 * inversor) e existe mesmo quando a usina não tem curva intradiária.
 */
async function getCurvaDia(
  clientIds: string[],
  ymd: string,
): Promise<PortalCurvaDia> {
  const [y, m, d] = ymd.split("-").map(Number);
  const label = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  const vazio: PortalCurvaDia = { data: ymd, label, pontos: [], picoKw: 0, totalKwh: null };
  if (clientIds.length === 0) return vazio;

  const dayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [rows, logs] = await Promise.all([
    prisma.inverterSample.findMany({
      where: {
        clientId: { in: clientIds },
        timeStamp: { gte: dayStart, lt: dayEnd },
        pAcW: { not: null },
      },
      select: { timeStamp: true, pAcW: true },
      orderBy: { timeStamp: "asc" },
    }),
    prisma.monitoringLog.findMany({
      where: { clientId: { in: clientIds }, data: { gte: dayStart, lt: dayEnd } },
      select: { clientId: true, geracaoDiaria: true },
    }),
  ]);

  // Total do dia: dedup por usina (bug conhecido de duplicação) mantendo o maior.
  let totalKwh: number | null = null;
  if (logs.length > 0) {
    const porUsina = new Map<string, number>();
    for (const l of logs) {
      const prev = porUsina.get(l.clientId) ?? 0;
      if (l.geracaoDiaria > prev) porUsina.set(l.clientId, l.geracaoDiaria);
    }
    totalKwh = round1(Array.from(porUsina.values()).reduce((s, v) => s + v, 0));
  }

  if (rows.length === 0) return { ...vazio, totalKwh };

  // Soma a potência de todos os inversores/usinas por instante.
  const byInstant = new Map<number, number>();
  for (const r of rows) {
    if (r.pAcW == null) continue;
    const t = r.timeStamp.getTime();
    byInstant.set(t, (byInstant.get(t) ?? 0) + r.pAcW);
  }

  // A coleta da Sungrow varre 8h–24h UTC (= 5h–21h BRT), então sobram amostras
  // com potência zero antes do nascer e depois do pôr do sol. Sem aparar, o
  // gráfico "começa" às 5h da manhã — hora em que não há sol no Brasil. Mantém
  // uma amostra zerada de cada lado pra curva ancorar no chão.
  const ordenados = Array.from(byInstant.entries()).sort(([a], [b]) => a - b);
  const primeiroSol = ordenados.findIndex(([, w]) => w > 0);
  const recorte =
    primeiroSol === -1
      ? ordenados // dia inteiro em zero: mostra a linha no chão, não "sem dados"
      : (() => {
          let ultimoSol = ordenados.length - 1;
          while (ultimoSol > primeiroSol && ordenados[ultimoSol][1] <= 0) ultimoSol--;
          return ordenados.slice(Math.max(0, primeiroSol - 1), ultimoSol + 2);
        })();

  let picoW = 0;
  const pontos = recorte.map(([t, w]) => {
    if (w > picoW) picoW = w;
    const brt = new Date(t - BRT_OFFSET_MS);
    const hh = String(brt.getUTCHours()).padStart(2, "0");
    const mm = String(brt.getUTCMinutes()).padStart(2, "0");
    return { hora: `${hh}:${mm}`, kw: Math.round((w / 1000) * 100) / 100 };
  });

  return { data: ymd, label, pontos, picoKw: Math.round((picoW / 1000) * 10) / 10, totalKwh };
}

/** Anti-spam do refresh sob demanda: chave `clientId|YYYY-MM-DD` -> epoch ms. */
const ultimoRefresh = new Map<string, number>();
const REFRESH_MIN_INTERVALO_MS = 5 * 60 * 1000;
/** Amostra de hoje considerada "fresca" se tiver menos de 20 min. */
const FRESCOR_HOJE_MS = 20 * 60 * 1000;

/**
 * Coleta sob demanda as amostras do dia pedido, quando o que está no banco
 * está velho ou não existe. Sem isto o cliente só vê a curva dos dias já
 * varridos pelo cron — hoje e ontem ficam vazios enquanto o cron não roda.
 *
 * Passa pelo `coletarIntradia` — o MESMO coletor do cron — por dois motivos:
 *
 *  1. Cobertura. O caminho antigo só falava Sungrow, e das 13 usinas que hoje
 *     aparecem no portal apenas 6 são Sungrow: as outras 7 (Fronius e
 *     SolarEdge) nunca atualizavam ao vivo, por mais que o cliente recarregasse.
 *  2. Convenção única. O caminho antigo gravava a resolução crua de 5 min; o
 *     cron grava slots de 15. As duas convenções na mesma tabela deixam o
 *     gráfico serrilhado, porque a curva soma a potência por instante e nos
 *     minutos "soltos" só um inversor tem valor.
 *
 * Só age em HOJE e ONTEM (BRT); dias mais antigos já estão fechados no banco.
 * Cada usina é coletada no máximo 1x a cada 5 min (guard em memória) e as
 * falhas são engolidas: o portal segue exibindo o que houver persistido.
 */
async function refreshAmostrasDia(clientIds: string[], ymd: string): Promise<void> {
  if (clientIds.length === 0) return;

  const hoje = hojeBrtYmd();
  const ontem = (() => {
    const [y, m, d] = hoje.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - 1));
    return dt.toISOString().slice(0, 10);
  })();
  if (ymd !== hoje && ymd !== ontem) return;

  const usinas = await prisma.brasilSolarClient.findMany({
    where: {
      id: { in: clientIds },
      active: true,
      plataformaMonitoramento: { in: PLATAFORMAS_INTRADIA },
      monitoramentoPlantId: { not: null },
    },
    select: { id: true, monitoramentoPlantId: true },
  });
  if (usinas.length === 0) return;

  const [y, m, d] = ymd.split("-").map(Number);
  const dayStart = new Date(Date.UTC(y, m - 1, d));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const agora = Date.now();
  const aColetar: string[] = [];

  await Promise.all(
    usinas.map(async (u) => {
      const chave = `${u.id}|${ymd}`;
      const anterior = ultimoRefresh.get(chave) ?? 0;
      if (agora - anterior < REFRESH_MIN_INTERVALO_MS) return;

      // Já tem a curva completa desse dia? Então não precisa bater na Sungrow.
      const ultima = await prisma.inverterSample.findFirst({
        where: {
          clientId: u.id,
          timeStamp: { gte: dayStart, lt: dayEnd },
          pAcW: { not: null },
        },
        orderBy: { timeStamp: "desc" },
        select: { timeStamp: true },
      });
      if (ultima) {
        const horaBrt = new Date(ultima.timeStamp.getTime() - BRT_OFFSET_MS).getUTCHours();
        // Ontem: completo quando a última amostra já é do fim da tarde.
        if (ymd !== hoje && horaBrt >= 18) return;
        // Hoje: completo quando a última amostra é recente (ou já é fim de dia).
        if (ymd === hoje && (agora - ultima.timeStamp.getTime() < FRESCOR_HOJE_MS || horaBrt >= 19)) {
          return;
        }
      }

      ultimoRefresh.set(chave, agora);
      aColetar.push(u.id);
    }),
  );

  if (aColetar.length === 0) return;

  try {
    // Uma chamada só pras usinas que precisam: os adapters já agrupam por
    // plataforma e usam os endpoints em lote onde existem.
    await coletarIntradia({
      clientIds: aColetar,
      // Do começo do dia solar até o fim da janela pedida — é o que preenche a
      // curva inteira de quem abriu o portal antes do cron passar.
      minutos: 15 * 60,
      agora: new Date(dayStart.getTime() + 23 * 60 * 60 * 1000),
      ignorarJanelaSolar: true,
    });
  } catch {
    // Instabilidade de qualquer plataforma: mantém o que já está persistido.
  }
}

/**
 * Estado de comunicação das usinas, derivado da última leitura instantânea
 * (`InverterSample`). A coleta roda de 3 em 3 horas (cron Sungrow), então a
 * janela de tolerância é de 4h — abaixo disso a usina está reportando. Fora do
 * horário de sol (18h–06h BRT) a ausência de leitura é normal: vira REPOUSO em
 * vez de OFFLINE, para não alarmar o cliente à noite.
 */
async function getStatusMonitoramento(
  clientIds: string[],
): Promise<PortalStatusMonitoramento> {
  const semDados: PortalStatusMonitoramento = {
    estado: "SEM_DADOS",
    ultimaLeituraIso: null,
    ultimaLeituraLabel: null,
  };
  if (clientIds.length === 0) return semDados;

  const ultimo = await prisma.inverterSample.findFirst({
    where: { clientId: { in: clientIds }, pAcW: { not: null } },
    orderBy: { timeStamp: "desc" },
    select: { timeStamp: true },
  });
  if (!ultimo) return semDados;

  const agora = Date.now();
  const idadeMs = agora - ultimo.timeStamp.getTime();
  const brtUltima = new Date(ultimo.timeStamp.getTime() - BRT_OFFSET_MS);
  const ultimaLeituraLabel =
    `${String(brtUltima.getUTCDate()).padStart(2, "0")}/${String(brtUltima.getUTCMonth() + 1).padStart(2, "0")}` +
    ` ${String(brtUltima.getUTCHours()).padStart(2, "0")}:${String(brtUltima.getUTCMinutes()).padStart(2, "0")}`;

  const horaBrtAgora = new Date(agora - BRT_OFFSET_MS).getUTCHours();
  const noite = horaBrtAgora >= 18 || horaBrtAgora < 6;

  const estado =
    idadeMs <= 4 * 60 * 60 * 1000 ? "ONLINE" : noite ? "REPOUSO" : "OFFLINE";

  return {
    estado,
    ultimaLeituraIso: ultimo.timeStamp.toISOString(),
    ultimaLeituraLabel,
  };
}

/**
 * Série de geração para o gráfico "Geração Mensal":
 *  - sem `mes`: 12 barras (jan..dez) com o total de cada mês do ano;
 *  - com `mes`: uma barra por dia do mês escolhido.
 * Dedup por (usina, dia) mantendo o maior valor, igual ao resto do portal.
 */
async function getSerieGeracao(
  clientIds: string[],
  ano: number,
  mes: number | null,
): Promise<PortalSerieGeracao> {
  const vazia: PortalSerieGeracao = { ano, mes, pontos: [], totalKwh: 0 };
  if (clientIds.length === 0) return vazia;

  const inicio = mes
    ? new Date(Date.UTC(ano, mes - 1, 1))
    : new Date(Date.UTC(ano, 0, 1));
  const fim = mes
    ? new Date(Date.UTC(ano, mes, 1))
    : new Date(Date.UTC(ano + 1, 0, 1));

  const logs = await prisma.monitoringLog.findMany({
    where: { clientId: { in: clientIds }, data: { gte: inicio, lt: fim } },
    select: { clientId: true, data: true, geracaoDiaria: true, origem: true },
  });

  // Dedup por (usina, dia) — mantém o maior valor do dia.
  const byClientDay = new Map<string, { kwh: number; manual: boolean }>();
  for (const l of logs) {
    const key = `${l.clientId}|${l.data.toISOString().slice(0, 10)}`;
    const prev = byClientDay.get(key);
    if (!prev || l.geracaoDiaria > prev.kwh) {
      byClientDay.set(key, { kwh: l.geracaoDiaria, manual: l.origem === "MANUAL" });
    }
  }

  const acc = new Map<number, number>(); // índice (mês 1-12 ou dia 1-31) -> kWh
  const accManual = new Map<number, number>();
  for (const [key, v] of byClientDay) {
    const day = key.split("|")[1]; // YYYY-MM-DD
    const idx = mes ? Number(day.slice(8, 10)) : Number(day.slice(5, 7));
    acc.set(idx, (acc.get(idx) ?? 0) + v.kwh);
    if (v.manual) accManual.set(idx, (accManual.get(idx) ?? 0) + v.kwh);
  }

  // Recorte do ano: começa em janeiro, mas nunca antes do mês em que a usina
  // entrou em operação, e nunca depois do mês corrente. Sem isso o cliente que
  // ligou a usina em março via jan e fev zerados — parecendo usina parada — e
  // meia dúzia de barras vazias de meses que ainda não aconteceram.
  const { primeiroMes, ultimoMes } = mes
    ? { primeiroMes: 1, ultimoMes: ultimoDiaAExibir(ano, mes) }
    : await recorteDoAno(clientIds, ano);

  const pontos = [];
  for (let idx = primeiroMes; idx <= ultimoMes; idx++) {
    const kwh = acc.get(idx) ?? 0;
    const manualKwh = accManual.get(idx) ?? 0;
    pontos.push({
      label: mes ? String(idx) : MES_ABREV[idx - 1],
      kwh: round1(kwh),
      // Ponto marcado quando a maior parte do kWh é informada, não medida.
      manual: manualKwh > 0 && manualKwh > kwh / 2,
    });
  }

  return {
    ano,
    mes,
    pontos,
    totalKwh: round1(pontos.reduce((s, p) => s + p.kwh, 0)),
    manualKwh: round1(Array.from(accManual.values()).reduce((s, v) => s + v, 0)),
  };
}

/**
 * Último dia a desenhar na visão de um mês: o mês inteiro, exceto no mês
 * corrente, que para em hoje — barra de dia que ainda não aconteceu lê como
 * usina parada.
 */
function ultimoDiaAExibir(ano: number, mes: number): number {
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const hoje = hojeBrtYmd();
  const ehMesCorrente = ano === Number(hoje.slice(0, 4)) && mes === Number(hoje.slice(5, 7));
  return ehMesCorrente ? Number(hoje.slice(8, 10)) : diasNoMes;
}

/**
 * Primeiro e último mês a desenhar no gráfico do ano.
 *
 * A borda de início vem da PRIMEIRA LEITURA registrada, não do campo
 * `dataInstalacao` do cadastro: das 13 usinas que hoje aparecem no portal, 7
 * estão com esse campo vazio — inclusive as três da Fundação Meneghetti. Data
 * de leitura sempre existe quando existe gráfico.
 */
async function recorteDoAno(
  clientIds: string[],
  ano: number,
): Promise<{ primeiroMes: number; ultimoMes: number }> {
  const hoje = hojeBrtYmd();
  const anoAtual = Number(hoje.slice(0, 4));
  const mesAtual = Number(hoje.slice(5, 7));

  const ultimoMes = ano === anoAtual ? mesAtual : 12;
  if (clientIds.length === 0) return { primeiroMes: 1, ultimoMes };

  const primeira = await prisma.monitoringLog.findFirst({
    where: { clientId: { in: clientIds }, geracaoDiaria: { gt: 0 } },
    orderBy: { data: "asc" },
    select: { data: true },
  });
  if (!primeira) return { primeiroMes: 1, ultimoMes };

  // Entrou em operação num ano anterior → o ano inteiro conta desde janeiro.
  const primeiroMes =
    primeira.data.getUTCFullYear() === ano ? primeira.data.getUTCMonth() + 1 : 1;

  // Guarda-costas: usina que só começou depois da janela consultada devolve
  // faixa vazia, em vez de inverter o laço e desenhar o ano ao contrário.
  return { primeiroMes: Math.min(primeiroMes, ultimoMes + 1), ultimoMes };
}

/** Anos com geração registrada, do mais recente para o mais antigo. */
async function getAnosDisponiveis(clientIds: string[]): Promise<number[]> {
  const anoAtual = Number(hojeBrtYmd().slice(0, 4));
  if (clientIds.length === 0) return [anoAtual];

  const primeiro = await prisma.monitoringLog.findFirst({
    where: { clientId: { in: clientIds } },
    orderBy: { data: "asc" },
    select: { data: true },
  });
  const anoInicial = primeiro ? primeiro.data.getUTCFullYear() : anoAtual;
  const anos: number[] = [];
  for (let a = anoAtual; a >= Math.min(anoInicial, anoAtual); a--) anos.push(a);
  return anos;
}

/**
 * Curva intradiária de um dia para o proprietário (usada pelas rotas de API).
 * Com `refresh`, coleta antes as amostras de hoje/ontem que ainda não estão no
 * banco — é o que permite ao cliente ver o dia atual sem esperar o cron.
 */
export async function getPortalCurvaDia(
  proprietarioId: string,
  ymd: string,
  opts: { refresh?: boolean } = {},
): Promise<PortalCurvaDia & { statusMonitoramento: PortalStatusMonitoramento }> {
  const clientIds = await getClientIds(proprietarioId);
  if (opts.refresh) await refreshAmostrasDia(clientIds, ymd);
  const [curva, status] = await Promise.all([
    getCurvaDia(clientIds, ymd),
    getStatusMonitoramento(clientIds),
  ]);
  return { ...curva, statusMonitoramento: status };
}

/**
 * Subconjunto GRÁTIS dos dados do portal: só geração (curva do dia + série
 * mensal + status), SEM nenhum número do plano pago (economia, tarifa, consumo,
 * CO₂). É o que vai serializado pro cliente no free-tier — assim os dados
 * exclusivos do Plano de Acompanhamento nunca vazam no HTML de quem não pagou.
 */
export interface PortalGeracaoFree {
  temDados: boolean;
  /** Data de hoje em Brasília, "YYYY-MM-DD" (máximo do seletor de data). */
  hojeYmd: string;
  /** Curva intradiária de HOJE — carga inicial do card "Geração diária". */
  curvaDia: PortalCurvaDia;
  statusMonitoramento: PortalStatusMonitoramento;
  anosDisponiveis: number[];
  /** Série mensal do ano corrente — carga inicial do card "Geração Mensal". */
  serieMensal: PortalSerieGeracao;
  /** Geração total do mês corrente (kWh) e rótulo curto ("jul"), pro card. */
  mesAtualKwh: number;
  mesAtualLabel: string;
}

/**
 * Monta o payload GRÁTIS do portal. Reaproveita os mesmos helpers do endpoint
 * pago (curva, status, série mensal), mas NÃO calcula economia/tarifa/consumo —
 * é de propósito, pra não expor dado pago ao cliente do plano grátis.
 */
export async function getPortalGeracaoFree(
  proprietarioId: string,
): Promise<PortalGeracaoFree> {
  const clientIds = await getClientIds(proprietarioId);
  const hojeYmd = hojeBrtYmd();
  const anoAtual = Number(hojeYmd.slice(0, 4));
  const mesAtualIdx = Number(hojeYmd.slice(5, 7)) - 1; // 0-11

  const [curvaDia, statusMonitoramento, anosDisponiveis, serieMensal] =
    await Promise.all([
      getCurvaDia(clientIds, hojeYmd),
      getStatusMonitoramento(clientIds),
      getAnosDisponiveis(clientIds),
      getSerieGeracao(clientIds, anoAtual, null),
    ]);

  const mesAtualKwh = serieMensal.pontos[mesAtualIdx]?.kwh ?? 0;
  const temDados =
    serieMensal.pontos.some((p) => p.kwh > 0) ||
    curvaDia.pontos.length > 0 ||
    curvaDia.totalKwh != null;

  return {
    temDados,
    hojeYmd,
    curvaDia,
    statusMonitoramento,
    anosDisponiveis,
    serieMensal,
    mesAtualKwh,
    mesAtualLabel: MES_ABREV[mesAtualIdx],
  };
}

/** Série mensal/diária do proprietário (usada pelas rotas de API). */
export async function getPortalSerieGeracao(
  proprietarioId: string,
  ano: number,
  mes: number | null,
): Promise<PortalSerieGeracao> {
  const clientIds = await getClientIds(proprietarioId);
  return getSerieGeracao(clientIds, ano, mes);
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
  const clientIds = usinas.map((u) => u.id);
  const hojeYmd = hojeBrtYmd();
  const anoAtual = Number(hojeYmd.slice(0, 4));

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
    curvaDia: {
      data: hojeYmd,
      label: hojeYmd.split("-").reverse().join("/"),
      pontos: [],
      picoKw: 0,
      totalKwh: null,
    },
    hojeYmd,
    statusMonitoramento: {
      estado: "SEM_DADOS",
      ultimaLeituraIso: null,
      ultimaLeituraLabel: null,
    },
    anosDisponiveis: [anoAtual],
    serieMensal: { ano: anoAtual, mes: null, pontos: [], totalKwh: 0 },
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

  // Carga inicial dos gráficos interativos: curva intradiária de HOJE, estado
  // de comunicação e série mensal do ano corrente (o cliente troca a data / o
  // ano / o mês na própria tela, via /api/portal-cliente/geracao/*).
  const [curva, statusMonitoramento, anosDisponiveis, serieMensal] = await Promise.all([
    getCurvaDia(clientIds, hojeYmd),
    getStatusMonitoramento(clientIds),
    getAnosDisponiveis(clientIds),
    getSerieGeracao(clientIds, anoAtual, null),
  ]);

  return {
    usinas,
    potenciaTotal,
    refLabel: `${MES_ABREV[ref.mes - 1]}/${String(ref.ano).slice(2)}`,
    refKwh: ref.kwh,
    refMediaDia: round1(refMediaDia),
    refEconomia: Math.round(ref.kwh * tarifaRef),
    refDias,
    curvaDia: curva,
    hojeYmd,
    statusMonitoramento,
    anosDisponiveis,
    serieMensal,
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
