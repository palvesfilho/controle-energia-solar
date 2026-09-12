/**
 * Recupera a CURVA dos dias que ficaram faltando.
 *
 * 🔑 O buraco que isto fecha: a rodada de 15 min só enxerga os últimos 45 min
 * — alargados até o último slot que a PLATAFORMA entregou, com teto de 6h e
 * piso no início do dia solar de HOJE (`janelaDaPlataforma`). Ou seja, **nada
 * no sistema voltava a pedir a curva de um dia passado**. Um dia perdido (cota
 * estourada, portal fora do ar, dado que chegou 10h atrasado, usina que voltou
 * depois de dias) ficava perdido para sempre: o fechamento não conserta, porque
 * ele só fecha dia que JÁ TEM curva, e a poda apaga a janela em 7 dias.
 *
 * Era exatamente isso que o botão "coletar 7 dias" fazia na mão, uma usina por
 * vez. Medido em 12/09/2026 entre as usinas VIVAS: 130 dias-usina faltando e 97
 * dias parciais — Sungrow 0, Fronius 82, SolarEdge 28, Huawei 13, Growatt 7.
 *
 * Só olha usina VIVA — que entregou curva em algum dia da janela — e só a
 * partir do primeiro dia em que ela apareceu: usina cadastrada anteontem não
 * tem "buraco" nos cinco dias anteriores, e usina muda é assunto do alerta de
 * mudez (`sync-alerts`), não deste recuperador. É o que segura o custo: o alvo
 * são dezenas de dias-usina por noite, não a frota inteira.
 */
import { prisma } from "@/lib/prisma";
import {
  coletarIntradia,
  PLATAFORMAS_INTRADIA,
  type PlataformaIntradia,
} from "@/lib/intraday-collector";

/** Janela de retenção da curva — a poda apaga o que passa disso. */
export const DIAS_JANELA_PADRAO = 7;
/** Abaixo disto o dia conta como PARCIAL e vale uma segunda pedida. */
export const MIN_SLOTS_DIA = 20;
/**
 * Quantas vezes insistir no mesmo (usina, dia). Dia em que a usina realmente
 * não gerou responde vazio para sempre; sem esse teto, os mesmos buracos
 * custariam chamada toda noite até a poda levá-los.
 */
export const MAX_TENTATIVAS = 2;
/** Orçamento por execução, em pares (usina, dia). */
export const MAX_PARES_PADRAO = 80;

const CHAVE_TENTATIVAS = "intraday.gapfill.tentativas";
const DIA_MS = 24 * 3600_000;

export interface ParFaltante {
  clientId: string;
  nome: string;
  plataforma: PlataformaIntradia;
  dia: string;
  slots: number;
  tentativas: number;
}

export interface ResumoGapfill {
  paresFaltando: number;
  paresParciais: number;
  /** Já bateram o teto de tentativas — não custam mais chamada. */
  paresPulados: number;
  paresTentados: number;
  paresRecuperados: number;
  paresVazios: number;
  slotsGravados: number;
  chamadas: number;
  duracaoMs: number;
  aplicado: boolean;
  amostra: ParFaltante[];
}

const chave = (clientId: string, dia: string) => `${clientId}|${dia}`;
const diaIso = (d: Date) => d.toISOString().slice(0, 10);

/** Dias-calendário fechados da janela: de `dias` atrás até ONTEM. */
export function diasDaJanela(dias: number, agora: Date): string[] {
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  const out: string[] = [];
  for (let i = dias; i >= 1; i--) out.push(diaIso(new Date(hoje - i * DIA_MS)));
  return out;
}

/** Slots por (usina, dia) na janela, direto do banco. */
async function slotsPorUsinaDia(desde: string): Promise<Map<string, Map<string, number>>> {
  const linhas = await prisma.$queryRaw<Array<{ client_id: string; dia: string; slots: bigint }>>`
    SELECT client_id, to_char(time_stamp, 'YYYY-MM-DD') AS dia, COUNT(*)::bigint AS slots
      FROM inverter_samples
     WHERE time_stamp >= ${new Date(`${desde}T00:00:00Z`)}
       AND time_stamp < date_trunc('day', NOW())
     GROUP BY 1, 2
  `;
  const mapa = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    if (!mapa.has(l.client_id)) mapa.set(l.client_id, new Map());
    mapa.get(l.client_id)!.set(l.dia, Number(l.slots));
  }
  return mapa;
}

/**
 * Encontra os pares (usina, dia) sem curva ou com curva parcial.
 * Consulta pura — não chama portal nenhum, não escreve nada.
 */
export async function encontrarDiasFaltantes(
  opts: { dias?: number; minSlots?: number; agora?: Date } = {},
): Promise<{ faltando: ParFaltante[]; parciais: ParFaltante[] }> {
  const agora = opts.agora ?? new Date();
  const dias = opts.dias ?? DIAS_JANELA_PADRAO;
  const minSlots = opts.minSlots ?? MIN_SLOTS_DIA;
  const janela = diasDaJanela(dias, agora);

  const porUsina = await slotsPorUsinaDia(janela[0]);
  const usinas = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      plataformaMonitoramento: { in: [...PLATAFORMAS_INTRADIA] },
      monitoramentoPlantId: { not: null },
    },
    select: { id: true, nome: true, plataformaMonitoramento: true },
  });
  const porId = new Map(usinas.map((u) => [u.id, u]));

  const faltando: ParFaltante[] = [];
  const parciais: ParFaltante[] = [];

  for (const [clientId, porDia] of porUsina) {
    const u = porId.get(clientId);
    if (!u) continue;
    // Usina que estreou no meio da janela não tem buraco antes de estrear.
    const estreia = [...porDia.keys()].sort()[0];
    for (const dia of janela) {
      if (dia < estreia) continue;
      const slots = porDia.get(dia) ?? 0;
      const par: ParFaltante = {
        clientId,
        nome: u.nome,
        plataforma: u.plataformaMonitoramento as PlataformaIntradia,
        dia,
        slots,
        tentativas: 0,
      };
      if (slots === 0) faltando.push(par);
      else if (slots < minSlots) parciais.push(par);
    }
  }

  return { faltando, parciais };
}

async function lerTentativas(): Promise<Record<string, number>> {
  const row = await prisma.appSetting.findUnique({ where: { key: CHAVE_TENTATIVAS } });
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, number>;
  } catch {
    // JSON corrompido não pode parar a recuperação: pior caso, tenta de novo.
    return {};
  }
}

async function gravarTentativas(mapa: Record<string, number>, janela: string[]): Promise<void> {
  // Entrada de dia que saiu da janela não serve mais para nada — a poda já
  // levou a curva. Limpar aqui evita o JSON crescer para sempre.
  const vivos = new Set(janela);
  const limpo: Record<string, number> = {};
  for (const [k, v] of Object.entries(mapa)) {
    if (vivos.has(k.split("|")[1])) limpo[k] = v;
  }
  await prisma.appSetting.upsert({
    where: { key: CHAVE_TENTATIVAS },
    create: { key: CHAVE_TENTATIVAS, value: JSON.stringify(limpo) },
    update: { value: JSON.stringify(limpo) },
  });
}

/**
 * Fecha os buracos da curva pedindo o dia inteiro ao portal — o mesmo caminho
 * do botão manual, só que sozinho e em lote.
 *
 * Agrupa por (plataforma, dia) para aproveitar o lote dos adaptadores: 30
 * usinas Fronius do mesmo dia viram UMA passada, não 30.
 */
export async function recuperarDiasFaltantes(
  opts: {
    dias?: number;
    minSlots?: number;
    maxPares?: number;
    maxTentativas?: number;
    aplicar?: boolean;
    agora?: Date;
  } = {},
): Promise<ResumoGapfill> {
  const t0 = Date.now();
  const agora = opts.agora ?? new Date();
  const dias = opts.dias ?? DIAS_JANELA_PADRAO;
  const minSlots = opts.minSlots ?? MIN_SLOTS_DIA;
  const maxPares = opts.maxPares ?? MAX_PARES_PADRAO;
  const maxTentativas = opts.maxTentativas ?? MAX_TENTATIVAS;
  const aplicar = opts.aplicar === true;

  const { faltando, parciais } = await encontrarDiasFaltantes({ dias, minSlots, agora });
  const tentativas = await lerTentativas();

  // Dia sem NADA primeiro (buraco inteiro dói mais que dia capado), depois quem
  // foi menos tentado, depois o mais recente — é o que o cliente olha.
  const candidatos = [...faltando, ...parciais]
    .map((p) => ({ ...p, tentativas: tentativas[chave(p.clientId, p.dia)] ?? 0 }))
    .filter((p) => p.tentativas < maxTentativas)
    .sort(
      (a, b) =>
        Number(a.slots > 0) - Number(b.slots > 0) ||
        a.tentativas - b.tentativas ||
        b.dia.localeCompare(a.dia),
    );

  const resumo: ResumoGapfill = {
    paresFaltando: faltando.length,
    paresParciais: parciais.length,
    paresPulados: faltando.length + parciais.length - candidatos.length,
    paresTentados: 0,
    paresRecuperados: 0,
    paresVazios: 0,
    slotsGravados: 0,
    chamadas: 0,
    duracaoMs: 0,
    aplicado: aplicar,
    amostra: candidatos.slice(0, 15),
  };

  const alvo = candidatos.slice(0, maxPares);
  resumo.paresTentados = alvo.length;
  if (!aplicar || alvo.length === 0) {
    resumo.duracaoMs = Date.now() - t0;
    return resumo;
  }

  const grupos = new Map<string, { plataforma: PlataformaIntradia; dia: string; ids: string[] }>();
  for (const p of alvo) {
    const k = `${p.plataforma}|${p.dia}`;
    if (!grupos.has(k)) grupos.set(k, { plataforma: p.plataforma, dia: p.dia, ids: [] });
    grupos.get(k)!.ids.push(p.clientId);
  }

  for (const g of grupos.values()) {
    // Âncora no fim do dia + janela de 15h = o dia solar inteiro daquele dia.
    const fimDoDia = new Date(`${g.dia}T23:00:00Z`);
    const r = await coletarIntradia({
      clientIds: g.ids,
      plataformas: [g.plataforma],
      minutos: 15 * 60,
      agora: fimDoDia,
      ignorarJanelaSolar: true,
    });
    resumo.slotsGravados += r.slotsGravados;
    resumo.chamadas += r.plataformas.reduce((s, p) => s + p.chamadas, 0);
    for (const id of g.ids) {
      tentativas[chave(id, g.dia)] = (tentativas[chave(id, g.dia)] ?? 0) + 1;
    }
  }

  // Conferência pelo BANCO, não pelo retorno da coleta: o que importa é o dia
  // ter passado a existir. `slotsGravados` conta upsert, e reescrever um slot
  // que já estava lá também conta — contar por ele diria "recuperei" sem ter
  // recuperado nada.
  const depois = await slotsPorUsinaDia(diasDaJanela(dias, agora)[0]);
  for (const p of alvo) {
    const slots = depois.get(p.clientId)?.get(p.dia) ?? 0;
    if (slots > p.slots && slots >= minSlots) resumo.paresRecuperados++;
    else if (slots === p.slots) resumo.paresVazios++;
  }

  await gravarTentativas(tentativas, diasDaJanela(dias, agora));
  resumo.duracaoMs = Date.now() - t0;
  return resumo;
}
