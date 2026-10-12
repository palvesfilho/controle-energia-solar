import { prisma } from "./prisma";
import {
  getTasksForWeek,
  startOfWeekMonday,
  endOfWeekSunday,
  type AgendaTask,
  type AgendaTaskType,
} from "./agenda";
import {
  addDaysOnly,
  dateOnlyKey,
  dayInBrasil,
  diffDaysOnly,
  formatDateOnlyBR,
  startOfDayInstant,
  toDateOnly,
  todayInBrasil,
} from "./date-only";
import { PRAZO_ANALISE_RGE_DIAS } from "./transferencia-creditos";
import { precisaConferenciaManual, type SituacaoProtocolo } from "./rge-protocolo";
import { ucsQueJaCompensaram } from "./uc-trava-faturamento";
import { SEM_UC_BRASIL_SOLAR } from "./uc-origem";
import { formatCodigoUc } from "./uc-codigo";

/**
 * Painel do Dia — a tela de entrada do módulo Associação.
 *
 * Não inventa regra: cada fila lê a MESMA fonte da tela onde o trabalho é feito
 * (Agenda, Rateios, Faturamento), para o número daqui bater com o de lá. Quando
 * um critério mudar, muda lá — aqui só se soma e se aponta o caminho.
 *
 * Fila é o que FALTA FAZER; "novidades" é o que ACONTECEU. São duas perguntas,
 * por isso duas estruturas.
 */

/** Quantas semanas para trás a varredura de tarefas atrasadas alcança. */
export const SEMANAS_ATRAS = 4;

/**
 * Competências que contam como "cobrança disponível": o mês corrente e os
 * anteriores até completar este número. O que é mais antigo e nunca foi emitido
 * é estoque legado (cobrado por fora do sistema, antes do Asaas) — entra no
 * aviso com quantidade e valor, mas não na fila, senão a fila nasce com
 * centenas de itens que ninguém vai emitir.
 */
export const MESES_COBRANCA_NA_FILA = 3;

/** Janela do quadro de novidades. */
export const DIAS_NOVIDADES = 7;

export type FilaKey =
  | "PAGAR_FATURA"
  | "INFORMAR_LEITURA"
  | "ACEITE_TRANSFERENCIA"
  | "ACEITE_RATEIO"
  | "EMITIR_COBRANCA"
  | "INADIMPLENTES"
  | "EMITIR_RELATORIO"
  | "PAGAR_INVESTIDOR"
  | "CONFERIR_PAGAMENTO";

export type TomItem = "atrasado" | "hoje" | "normal";

export interface FilaItem {
  id: string;
  titulo: string;
  detalhe: string | null;
  tom: TomItem;
  /** Data da linha, já em dd/mm/aaaa — o que ela significa está em `Fila.rotuloData`. */
  data: string | null;
  valor: number | null;
  href: string;
  /** Conta de energia a pagar: a linha abre a janela de pagamento aqui mesmo. */
  pagarFaturaId?: string;
}

export interface Fila {
  key: FilaKey;
  titulo: string;
  /** O que fazer com isto, em uma linha — quem abre a tela é gente nova. */
  instrucao: string;
  total: number;
  atrasados: number;
  hoje: number;
  /** R$ somado, quando a fila é de dinheiro. */
  valor: number | null;
  /** Sobre o que a conta foi feita — KPI sem denominador esconde buraco. */
  base: string;
  /** Aviso que não cabe em contador (ex.: "3 sem protocolo"). */
  aviso: string | null;
  href: string;
  /** Título da coluna de data na tabela (vencimento, envio, competência…). */
  rotuloData: string;
  /** A fila INTEIRA, já na ordem de trabalho. */
  itens: FilaItem[];
}

export interface Novidade {
  titulo: string;
  hoje: number;
  /** Últimos `DIAS_NOVIDADES` dias, hoje incluído. */
  semana: number;
  href: string;
}

export interface PainelDoDia {
  hoje: string; // YYYY-MM-DD
  semanaInicio: string;
  semanaFim: string;
  resumo: {
    atrasadas: number;
    paraHoje: number;
    restoDaSemana: number;
    feitasNaSemana: number;
    totalDaSemana: number;
    aPagarNaSemana: number;
  };
  filas: Fila[];
  novidades: Novidade[];
}

const TIPO_PARA_FILA: Partial<Record<AgendaTaskType, FilaKey>> = {
  PAGAR_FATURA: "PAGAR_FATURA",
  INFORMAR_LEITURA_RGE: "INFORMAR_LEITURA",
  EMITIR_RELATORIO_MENSAL: "EMITIR_RELATORIO",
  PAGAR_INVESTIDOR: "PAGAR_INVESTIDOR",
  CONFERIR_PAGAMENTO_RGE: "CONFERIR_PAGAMENTO",
  // CADASTRAR_ACESSO_CONCESSIONARIA fica de fora de propósito: é pendência de
  // cadastro, que segue com a gestão — não é trabalho de quem opera o painel.
};

const META_FILA_AGENDA: Record<
  "PAGAR_FATURA" | "INFORMAR_LEITURA" | "EMITIR_RELATORIO" | "PAGAR_INVESTIDOR" | "CONFERIR_PAGAMENTO",
  { titulo: string; instrucao: string }
> = {
  PAGAR_FATURA: {
    titulo: "Pagar contas de energia",
    instrucao: "Pagar a fatura da distribuidora e registrar o pagamento com o comprovante.",
  },
  INFORMAR_LEITURA: {
    titulo: "Informar autoleitura",
    instrucao: "Usina de leitura plurimensal: informar a leitura do medidor no portal da distribuidora.",
  },
  EMITIR_RELATORIO: {
    titulo: "Emitir relatório mensal",
    instrucao: "Publicar o relatório da usina antes do pagamento ao investidor.",
  },
  PAGAR_INVESTIDOR: {
    titulo: "Pagar investidor",
    instrucao: "Fechar e pagar o repasse do mês de cada usina.",
  },
  CONFERIR_PAGAMENTO: {
    titulo: "Conferir pagamento na distribuidora",
    instrucao: "Pagamos, mas a distribuidora ainda não deu baixa: conferir no portal.",
  },
};

function tomDaTask(t: AgendaTask, hojeKey: string): TomItem {
  if (t.status === "OVERDUE") return "atrasado";
  return dateOnlyKey(t.scheduledFor) === hojeKey ? "hoje" : "normal";
}

/** Atrasado primeiro, depois o que vence antes. */
function ordenarItens<T extends { tom: TomItem; ordem: number }>(itens: T[]): T[] {
  const peso: Record<TomItem, number> = { atrasado: 0, hoje: 1, normal: 2 };
  return itens.sort((a, b) => peso[a.tom] - peso[b.tom] || a.ordem - b.ordem);
}

/** Tira o campo auxiliar de ordenação antes de entregar a fila. */
function semOrdem(itens: Array<FilaItem & { ordem: number }>): FilaItem[] {
  return itens.map((i) => ({
    id: i.id,
    titulo: i.titulo,
    detalhe: i.detalhe,
    tom: i.tom,
    data: i.data,
    valor: i.valor,
    href: i.href,
    pagarFaturaId: i.pagarFaturaId,
  }));
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export async function getPainelDoDia(): Promise<PainelDoDia> {
  const hoje = todayInBrasil();
  const hojeKey = dateOnlyKey(hoje);
  const semanaInicio = startOfWeekMonday(hoje);
  const semanaFim = endOfWeekSunday(hoje);
  const inicioHoje = startOfDayInstant(hoje);
  // "Últimos 7 dias", e não a semana-calendário: na segunda de manhã a
  // semana-calendário está vazia e o quadro não diria nada.
  const inicioJanela = startOfDayInstant(addDaysOnly(hoje, -(DIAS_NOVIDADES - 1)));

  // ─── Tarefas da Agenda: semana atual + as anteriores (atraso não some na virada) ───
  // Uma chamada por semana, e não uma janela de 5 semanas: PAGAR_INVESTIDOR e
  // EMITIR_RELATORIO calculam os candidatos a partir do mês de `windowStart`,
  // então uma janela longa perderia meses pelo caminho.
  const janelas = Array.from({ length: SEMANAS_ATRAS + 1 }, (_, i) => ({
    inicio: addDaysOnly(semanaInicio, -7 * i),
    fim: addDaysOnly(semanaFim, -7 * i),
  }));

  const [
    semanas,
    rateiosPendentes,
    transferenciasEnviadas,
    cobrancasPendentes,
    cobrancasEmAtraso,
    novidades,
  ] = await Promise.all([
    Promise.all(janelas.map((j) => getTasksForWeek(j.inicio, j.fim))),

    prisma.rateioVersion.findMany({
      where: { status: "PENDENTE_ACEITE", plant: { active: true } },
      select: {
        id: true,
        status: true,
        protocolo: true,
        protocoloSituacao: true,
        criadoEm: true,
        plantId: true,
        plant: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),

    prisma.creditTransfer.findMany({
      where: { status: "ENVIADA" },
      select: {
        id: true,
        ucOrigemCodigo: true,
        enviadoEm: true,
        createdAt: true,
        plant: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),

    // Mesmo recorte do "Realizar Cobrança" da tela de Faturamento: valor
    // calculado, ainda PENDENTE, sem cobrança viva no Asaas.
    prisma.consumerUnitBilling.findMany({
      where: {
        status: "PENDENTE",
        valorCobranca: { gt: 0 },
        asaasChargeId: null,
        installments: null,
        consumerUnit: { active: true, ...SEM_UC_BRASIL_SOLAR },
      },
      select: {
        id: true,
        ano: true,
        mes: true,
        valorCobranca: true,
        demonstrativoValidadoEm: true,
        consumerUnitId: true,
        consumerUnit: { select: { nome: true } },
      },
    }),

    // Mesma definição de atraso do card "Inadimplência" da Gestora de Energia
    // (admin/page.tsx): atraso é o FATO — comunicada, não paga, vencida.
    prisma.consumerUnitBilling.findMany({
      where: {
        status: { notIn: ["CANCELADO", "PENDENTE", "PAGO", "PARCIALMENTE_PAGO"] },
        pagoEm: null,
        OR: [{ status: "ATRASADO" }, { dataVencimento: { lt: inicioHoje } }],
      },
      select: {
        id: true,
        ano: true,
        mes: true,
        valorCobranca: true,
        dataVencimento: true,
        consumerUnitId: true,
        consumerUnit: {
          select: { nome: true, consumerId: true, consumer: { select: { name: true } } },
        },
      },
    }),

    contarNovidades(inicioHoje, inicioJanela),
  ]);

  // ─── Filas vindas da Agenda ───────────────────────────────────────────
  const vistos = new Set<string>();
  const tasks: AgendaTask[] = [];
  for (const t of semanas.flat()) {
    if (vistos.has(t.id)) continue;
    vistos.add(t.id);
    if (!TIPO_PARA_FILA[t.type]) continue;
    // Fatura que o investidor paga direto aparece na Agenda só para controle.
    if (t.type === "PAGAR_FATURA" && t.pagaInvestidor) continue;
    tasks.push(t);
  }

  const daSemana = tasks.filter(
    (t) => t.scheduledFor >= semanaInicio && t.scheduledFor <= semanaFim,
  );
  const abertas = tasks.filter((t) => t.status !== "DONE");

  const filas: Fila[] = [];

  function filaDaAgenda(key: keyof typeof META_FILA_AGENDA, href: string): Fila {
    const doTipo = abertas.filter((t) => TIPO_PARA_FILA[t.type] === key);
    const itens = ordenarItens(
      doTipo.map((t) => ({
        id: t.id,
        titulo: t.title,
        detalhe: t.subtitle,
        tom: tomDaTask(t, hojeKey),
        data: formatDateOnlyBR(t.dueDate ?? t.scheduledFor),
        valor: t.valor ?? null,
        href: t.href ?? href,
        pagarFaturaId: t.type === "PAGAR_FATURA" ? t.sourceEntityId : undefined,
        ordem: (t.dueDate ?? t.scheduledFor).getTime(),
      })),
    );
    const temValor = doTipo.some((t) => t.valor != null);
    return {
      key,
      ...META_FILA_AGENDA[key],
      total: doTipo.length,
      atrasados: itens.filter((i) => i.tom === "atrasado").length,
      hoje: itens.filter((i) => i.tom === "hoje").length,
      valor: temValor ? doTipo.reduce((s, t) => s + (t.valor ?? 0), 0) : null,
      base: `desta semana + atrasos das últimas ${SEMANAS_ATRAS} semanas`,
      aviso: null,
      href,
      rotuloData: "Vencimento",
      itens: semOrdem(itens),
    };
  }

  filas.push(filaDaAgenda("PAGAR_FATURA", "/admin/agenda"));
  filas.push(filaDaAgenda("INFORMAR_LEITURA", "/admin/agenda"));

  // ─── Aceite de transferência de créditos ──────────────────────────────
  {
    const href = "/admin/gestao-creditos/rateios?aba=transferencias";
    const linhas = transferenciasEnviadas.map((t) => {
      const envio = toDateOnly(t.enviadoEm) ?? dayInBrasil(t.createdAt);
      const dias = Math.max(0, diffDaysOnly(envio, hoje));
      return { t, envio, dias, semData: !t.enviadoEm };
    });
    const itens = ordenarItens(
      linhas.map(({ t, envio, dias, semData }) => ({
        id: t.id,
        titulo: t.plant?.name ?? `UC ${formatCodigoUc(t.ucOrigemCodigo) ?? t.ucOrigemCodigo}`,
        detalhe: semData
          ? `Sem data de envio · ${plural(t._count.items, "UC de destino", "UCs de destino")}`
          : `Enviada há ${plural(dias, "dia", "dias")} · prazo da RGE: ${PRAZO_ANALISE_RGE_DIAS} dias`,
        tom: (dias > PRAZO_ANALISE_RGE_DIAS ? "atrasado" : "normal") as TomItem,
        data: semData ? null : formatDateOnlyBR(envio),
        valor: null,
        href,
        ordem: -dias,
      })),
    );
    const semData = linhas.filter((l) => l.semData).length;
    filas.push({
      key: "ACEITE_TRANSFERENCIA",
      titulo: "Aceite de transferência de créditos",
      instrucao:
        "Pedido enviado à RGE por email: conferir se foi aceito e registrar a data do aceite.",
      total: linhas.length,
      atrasados: itens.filter((i) => i.tom === "atrasado").length,
      hoje: 0,
      valor: null,
      base: "todas as transferências com status Enviada",
      aviso: semData > 0 ? `${semData} sem data de envio registrada` : null,
      href,
      rotuloData: "Enviada em",
      itens: semOrdem(itens),
    });
  }

  // ─── Aceite de novos rateios ──────────────────────────────────────────
  {
    const href = "/admin/gestao-creditos/rateios?aba=protocolos";
    const linhas = rateiosPendentes.map((r) => {
      const dias = Math.max(0, diffDaysOnly(dayInBrasil(r.criadoEm), hoje));
      const conferir = precisaConferenciaManual(
        r.protocoloSituacao as SituacaoProtocolo | null,
        r.status,
      );
      return { r, dias, conferir };
    });
    const itens = ordenarItens(
      linhas.map(({ r, dias, conferir }) => ({
        id: r.id,
        titulo: r.plant.name,
        detalhe: conferir
          ? `RGE já validou — conferir a fatura e aceitar · ${plural(r._count.items, "UC", "UCs")}`
          : `${r.protocolo ? `Pedido ${r.protocolo}` : "Sem protocolo"} · ${dias === 0 ? "aberto hoje" : `aberto há ${plural(dias, "dia", "dias")}`}`,
        // "Para hoje" aqui é: a concessionária já respondeu, só falta a nossa parte.
        tom: (conferir ? "hoje" : "normal") as TomItem,
        data: formatDateOnlyBR(dayInBrasil(r.criadoEm)),
        valor: null,
        href: `${href}&plantId=${r.plantId}`,
        ordem: -dias,
      })),
    );
    const semProtocolo = linhas.filter((l) => !l.r.protocolo).length;
    filas.push({
      key: "ACEITE_RATEIO",
      titulo: "Aceite de novos rateios",
      instrucao:
        "Rateio registrado na distribuidora aguardando aceite: quando ela validar, conferir e aceitar aqui.",
      total: linhas.length,
      atrasados: 0,
      hoje: itens.filter((i) => i.tom === "hoje").length,
      valor: null,
      base: "todos os rateios Pendente de aceite, de usinas ativas",
      aviso: semProtocolo > 0 ? `${semProtocolo} sem número de protocolo` : null,
      href,
      rotuloData: "Aberto em",
      itens: semOrdem(itens),
    });
  }

  // ─── Cobranças disponíveis para realizar ──────────────────────────────
  {
    // Trava dura: UC que nunca compensou não pode ser faturada. Ela sai da
    // fila (não é trabalho possível) e entra no aviso.
    const compensaram = await ucsQueJaCompensaram(
      Array.from(new Set(cobrancasPendentes.map((c) => c.consumerUnitId))),
    );
    const mesAtual = hoje.getUTCFullYear() * 12 + hoje.getUTCMonth();
    const idadeEmMeses = (c: { ano: number; mes: number }) => mesAtual - (c.ano * 12 + c.mes - 1);
    const recentes = cobrancasPendentes.filter((c) => idadeEmMeses(c) < MESES_COBRANCA_NA_FILA);
    const legadas = cobrancasPendentes.filter((c) => idadeEmMeses(c) >= MESES_COBRANCA_NA_FILA);
    const liberadas = recentes.filter((c) => compensaram.has(c.consumerUnitId));
    const travadas = recentes.length - liberadas.length;
    const validadas = liberadas.filter((c) => c.demonstrativoValidadoEm).length;

    // Uma linha por UC, da competência mais antiga para a mais nova; o link
    // abre o MÊS, que é como a tela de Faturamento trabalha.
    const itens: FilaItem[] = liberadas
      .slice()
      .sort(
        (a, b) =>
          a.ano * 12 + a.mes - (b.ano * 12 + b.mes) ||
          (b.valorCobranca ?? 0) - (a.valorCobranca ?? 0),
      )
      .map((c) => {
        const mes = `${String(c.mes).padStart(2, "0")}/${c.ano}`;
        return {
          id: c.id,
          titulo: c.consumerUnit.nome,
          detalhe: c.demonstrativoValidadoEm
            ? "Demonstrativo validado — pronta para emitir"
            : "Falta validar o demonstrativo",
          // Competência de 2+ meses atrás ainda sem cobrar já é atraso nosso.
          tom: (idadeEmMeses(c) >= 2 ? "atrasado" : c.demonstrativoValidadoEm ? "hoje" : "normal") as TomItem,
          data: mes,
          valor: c.valorCobranca ?? null,
          href: `/admin/faturamento/unidades-consumidoras/${c.ano}-${String(c.mes).padStart(2, "0")}`,
        };
      });
    filas.push({
      key: "EMITIR_COBRANCA",
      titulo: "Cobranças disponíveis para realizar",
      instrucao:
        "Valor já calculado e ainda não cobrado: validar o demonstrativo e emitir a cobrança ao cliente.",
      total: liberadas.length,
      atrasados: itens.filter((i) => i.tom === "atrasado").length,
      hoje: itens.filter((i) => i.tom === "hoje").length,
      valor: liberadas.reduce((s, c) => s + (c.valorCobranca ?? 0), 0),
      base: `últimas ${MESES_COBRANCA_NA_FILA} competências · ${validadas} de ${liberadas.length} com demonstrativo validado`,
      aviso:
        [
          travadas > 0
            ? `${travadas} fora da fila: UC em implantação, ainda sem compensação`
            : null,
          legadas.length > 0
            ? `${legadas.length} de competências anteriores nunca emitidas (${brl(
                legadas.reduce((s, c) => s + (c.valorCobranca ?? 0), 0),
              )}) — fora da fila`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      href: "/admin/faturamento/unidades-consumidoras",
      rotuloData: "Competência",
      itens,
    });
  }

  // ─── Clientes inadimplentes ───────────────────────────────────────────
  {
    // Agrupa por CLIENTE (Consumer); UC sem cliente vinculado vale por si.
    const porCliente = new Map<
      string,
      { nome: string; ucId: string; qtd: number; valor: number; diasMax: number; vencimento: Date | null }
    >();
    for (const c of cobrancasEmAtraso) {
      const k = c.consumerUnit.consumerId ?? `uc:${c.consumerUnitId}`;
      const venc = toDateOnly(c.dataVencimento);
      const dias = venc ? Math.max(0, diffDaysOnly(venc, hoje)) : 0;
      const g = porCliente.get(k) ?? {
        nome: c.consumerUnit.consumer?.name ?? c.consumerUnit.nome,
        ucId: c.consumerUnitId,
        qtd: 0,
        valor: 0,
        diasMax: 0,
        vencimento: null,
      };
      if (venc && (!g.vencimento || venc < g.vencimento)) g.vencimento = venc;
      g.qtd += 1;
      g.valor += c.valorCobranca ?? 0;
      g.diasMax = Math.max(g.diasMax, dias);
      porCliente.set(k, g);
    }
    const clientes = Array.from(porCliente.entries()).sort((a, b) => b[1].valor - a[1].valor);
    const faixa = (min: number, max: number) =>
      clientes.filter(([, g]) => g.diasMax >= min && g.diasMax <= max).length;
    const acima30 = faixa(31, Infinity);
    filas.push({
      key: "INADIMPLENTES",
      titulo: "Clientes inadimplentes",
      instrucao:
        "Cobrança emitida, vencida e não paga: entrar em contato com o cliente, do maior valor para o menor.",
      total: clientes.length,
      atrasados: acima30,
      hoje: 0,
      valor: cobrancasEmAtraso.reduce((s, c) => s + (c.valorCobranca ?? 0), 0),
      base: `${plural(cobrancasEmAtraso.length, "cobrança vencida", "cobranças vencidas")} · até 15 dias: ${faixa(0, 15)} · 16 a 30: ${faixa(16, 30)} · mais de 30: ${acima30}`,
      aviso: null,
      href: "/admin/faturamento/unidades-consumidoras",
      rotuloData: "Vencida desde",
      itens: clientes.map(([k, g]) => ({
        id: k,
        titulo: g.nome,
        detalhe: `${plural(g.qtd, "cobrança", "cobranças")} · até ${plural(g.diasMax, "dia", "dias")} de atraso`,
        tom: (g.diasMax > 30 ? "atrasado" : "normal") as TomItem,
        data: g.vencimento ? formatDateOnlyBR(g.vencimento) : null,
        valor: g.valor,
        href: `/admin/unidades-consumidoras/${g.ucId}/editar`,
      })),
    });
  }

  filas.push(filaDaAgenda("EMITIR_RELATORIO", "/admin/agenda"));
  filas.push(filaDaAgenda("PAGAR_INVESTIDOR", "/admin/agenda"));
  filas.push(filaDaAgenda("CONFERIR_PAGAMENTO", "/admin/agenda"));

  // ─── Resumo do topo: só as tarefas com data (as da Agenda) ────────────
  const atrasadas = abertas.filter((t) => t.status === "OVERDUE").length;
  const paraHoje = abertas.filter(
    (t) => t.status === "PENDING" && dateOnlyKey(t.scheduledFor) === hojeKey,
  ).length;
  const restoDaSemana = daSemana.filter(
    (t) => t.status === "PENDING" && t.scheduledFor > hoje,
  ).length;

  return {
    hoje: hojeKey,
    semanaInicio: dateOnlyKey(semanaInicio),
    semanaFim: dateOnlyKey(semanaFim),
    resumo: {
      atrasadas,
      paraHoje,
      restoDaSemana,
      feitasNaSemana: daSemana.filter((t) => t.status === "DONE").length,
      totalDaSemana: daSemana.length,
      aPagarNaSemana: daSemana
        .filter((t) => t.type === "PAGAR_FATURA" && t.status !== "DONE")
        .reduce((s, t) => s + (t.valor ?? 0), 0),
    },
    filas,
    novidades,
  };
}

/** O que ENTROU no sistema hoje e nos últimos dias — cada linha é um carimbo de data real. */
async function contarNovidades(inicioHoje: Date, inicioJanela: Date): Promise<Novidade[]> {
  const par = async (
    titulo: string,
    href: string,
    contar: (desde: Date) => Promise<number>,
  ): Promise<Novidade> => {
    const [hoje, semana] = await Promise.all([contar(inicioHoje), contar(inicioJanela)]);
    return { titulo, hoje, semana, href };
  };

  return Promise.all([
    par("Faturas de energia que chegaram", "/admin/faturas-energia", (desde) =>
      prisma.consumerBill.count({ where: { createdAt: { gte: desde } } }),
    ),
    par("Contas de energia pagas por nós", "/admin/faturas-energia/gestao-financeira", (desde) =>
      prisma.consumerBill.count({ where: { pagoEm: { gte: desde } } }),
    ),
    par("Cobranças emitidas aos clientes", "/admin/faturamento/unidades-consumidoras", (desde) =>
      prisma.consumerUnitBilling.count({
        where: { status: { notIn: ["PENDENTE", "CANCELADO"] }, demonstrativoGeradoEm: { gte: desde } },
      }),
    ),
    par("Pagamentos recebidos de clientes", "/admin/faturamento/unidades-consumidoras", (desde) =>
      prisma.consumerUnitBilling.count({ where: { pagoEm: { gte: desde } } }),
    ),
    par("Rateios novos registrados", "/admin/gestao-creditos/rateios?aba=protocolos", (desde) =>
      prisma.rateioVersion.count({ where: { criadoEm: { gte: desde } } }),
    ),
    par("Rateios aceitos", "/admin/gestao-creditos/rateios?aba=vigentes", (desde) =>
      prisma.rateioVersion.count({ where: { aceitoEm: { gte: desde } } }),
    ),
    par("Transferências de crédito aceitas", "/admin/gestao-creditos/rateios?aba=transferencias", (desde) =>
      prisma.creditTransfer.count({ where: { aceitoEm: { gte: desde } } }),
    ),
  ]);
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "13/10" a "19/10/2026" — rótulo da semana no cabeçalho. */
export function rotuloSemana(inicio: Date, fim: Date): string {
  return `${formatDateOnlyBR(inicio).slice(0, 5)} a ${formatDateOnlyBR(fim)}`;
}
