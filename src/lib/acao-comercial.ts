/**
 * Ação comercial — traduz o diagnóstico do relatório em oportunidades de venda.
 *
 * O relatório do cliente já responde "a usina atende meu consumo? sobra crédito?
 * preciso de vistoria?" com texto determinístico (`avaliarSituacaoUsina` /
 * `avaliarSituacaoRateio` em `brasil-solar-relatorio.ts`). Aqui a MESMA saída é
 * lida sob a ótica comercial: cada item de diagnóstico vira, quando cabe, uma
 * oferta com evidência, número e próximo passo.
 *
 * Regras que valem aqui igual valem no relatório:
 *  - Determinístico: mesma entrada → mesma lista. Nenhuma IA, nenhum texto solto.
 *  - Lacuna de geração SEMPRE em kWh, NUNCA em kWp — dimensionar é trabalho do
 *    projeto (orientação, sombreamento, modelo de módulo). Ver
 *    `SituacaoUsina.deficitMensalKwh`.
 *  - Nada de número inventado: todo valor exibido sai do histórico de faturas.
 *
 * O texto daqui é INTERNO (equipe comercial) — diferente do relatório, pode
 * falar em proposta, ampliação e contrato.
 */

import { prisma } from "@/lib/prisma";
import {
  getProprietarioRelatorio,
  getProprietarioRelatorioAgregado,
  listarRelatoriosProprietario,
  type RelatorioMonthRow,
  type RelatorioAgregadoMonthRow,
  type SituacaoUsina,
  type SituacaoRateio,
} from "@/lib/brasil-solar-relatorio";
import { formatCodigoUc } from "@/lib/uc-codigo";

export type AcaoComercialTipo =
  | "AMPLIACAO"
  | "RATEIO_EXCEDENTE"
  | "REVISAO_RATEIO"
  | "REGULARIZAR_RATEIO"
  | "VISTORIA"
  | "LIMPEZA"
  | "MONITORAMENTO"
  | "PLANO_MONITORAMENTO"
  | "RELACIONAMENTO";

/** ALTA = há dinheiro na mesa hoje · MEDIA = oferta consultiva · BAIXA = relacionamento */
export type AcaoComercialPrioridade = "ALTA" | "MEDIA" | "BAIXA";

export interface AcaoComercialNumero {
  label: string;
  valor: string;
}

export interface OportunidadeComercial {
  tipo: AcaoComercialTipo;
  prioridade: AcaoComercialPrioridade;
  /** A oferta, em uma linha */
  titulo: string;
  /** O fato do diagnóstico que sustenta a oferta — é o que se mostra ao cliente */
  evidencia: string;
  /** Próximo passo concreto do comercial */
  acao: string;
  /** Números de apoio, já formatados em pt-BR */
  numeros: AcaoComercialNumero[];
  /** De onde veio: UC (código + nome) ou "Grupo (rateio)" */
  origem: string;
}

export interface AcaoComercialData {
  proprietario: {
    id: string;
    nome: string;
    cidade: string | null;
    uf: string | null;
    email: string | null;
    telefone: string | null;
  };
  /** AGREGADO quando há beneficiárias (o diagnóstico é do rateio, não de 1 UC) */
  escopo: "UC" | "AGREGADO";
  /** Meses de fatura usados no diagnóstico (janela das médias) */
  mesesConsiderados: number | null;
  oportunidades: OportunidadeComercial[];
  /** UCs varridas — as sem diagnóstico aparecem com o motivo */
  ucsAnalisadas: {
    ucId: string;
    codigoUc: string;
    nome: string;
    diagnosticada: boolean;
    motivo: string | null;
  }[];
}

// -----------------------------------------------------------------------------
// Formatação (pt-BR) — o texto é lido por gente, não por máquina
// -----------------------------------------------------------------------------

/**
 * Espelham as faixas do diagnóstico (`brasil-solar-relatorio.ts`): saldo acima
 * de 3 meses de consumo = excedente ocioso; desvio de 10 pontos percentuais
 * entre rateio e participação de consumo = rateio desbalanceado. Se as faixas
 * mudarem lá, mudam aqui — são as MESMAS regras vistas pelo lado comercial.
 */
const SALDO_MESES_EXCEDENTE = 3;
const RATEIO_DESVIO_PP = 10;

const fmtKwh = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} kWh`;
const fmtPct = (v: number) => `${v.toFixed(0)}%`;
const fmt1 = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/**
 * Média do que a UC (ou o grupo) ainda paga à concessionária nos meses da
 * janela. É o "dinheiro na mesa" de uma ampliação: o que o solar ainda não
 * cobre. Sai direto de `ConsumerBill` — não é estimativa.
 */
function faturadoMedio(
  meses: (RelatorioMonthRow | RelatorioAgregadoMonthRow)[],
  janela: number,
): number | null {
  const valores = meses
    .slice(-janela)
    .map((m) => m.faturadoRs)
    .filter((v): v is number => v != null);
  return media(valores);
}

const ORDEM_PRIORIDADE: Record<AcaoComercialPrioridade, number> = {
  ALTA: 0,
  MEDIA: 1,
  BAIXA: 2,
};

/** Ordena por urgência mantendo a ordem de geração dentro de cada faixa. */
function ordenar(ops: OportunidadeComercial[]): OportunidadeComercial[] {
  return ops
    .map((op, i) => ({ op, i }))
    .sort(
      (a, b) =>
        ORDEM_PRIORIDADE[a.op.prioridade] - ORDEM_PRIORIDADE[b.op.prioridade] ||
        a.i - b.i,
    )
    .map((x) => x.op);
}

// -----------------------------------------------------------------------------
// Diagnóstico por UC → oportunidades
// -----------------------------------------------------------------------------

/**
 * Cada item de `SituacaoUsina` tem um destino comercial conhecido:
 *  DIMENSIONAMENTO déficit → ampliação · CREDITOS sobrando → 2ª UC/rateio
 *  DESEMPENHO/MONITORAMENTO → serviço técnico · tudo OK → relacionamento.
 */
function oportunidadesDaUsina(
  situacao: SituacaoUsina,
  origem: string,
  faturadoMedioRs: number | null,
): OportunidadeComercial[] {
  const ops: OportunidadeComercial[] = [];
  const dinheiroNaMesa: AcaoComercialNumero[] =
    faturadoMedioRs != null && faturadoMedioRs > 0
      ? [{ label: "Ainda paga à concessionária", valor: `${fmtBRL(faturadoMedioRs)}/mês` }]
      : [];

  for (const item of situacao.itens) {
    if (item.tema === "DIMENSIONAMENTO" && item.nivel !== "OK") {
      const forte = item.nivel === "ACAO";
      // Base fina não vira oferta de ampliação: vira tarefa de completar a
      // medição. Propor obra em cima de meses sem leitura é vender contra um
      // número que pode mudar sozinho na próxima abertura do relatório — foi
      // exatamente o que aconteceu com o SANDRO (cobertura oscilando entre
      // rodadas por causa do `10012` da Growatt). Ver `SituacaoUsina.baseIncompleta`.
      const incompleta = situacao.baseIncompleta;
      ops.push({
        tipo: incompleta ? "MONITORAMENTO" : "AMPLIACAO",
        prioridade: incompleta ? "MEDIA" : forte ? "ALTA" : "MEDIA",
        titulo: incompleta
          ? "Completar a medição antes de falar em ampliação"
          : forte
            ? "Propor ampliação da usina"
            : "Avaliar ampliação — usina levemente abaixo do consumo",
        evidencia: item.texto,
        acao: incompleta
          ? `O diagnóstico se apoia em ${situacao.mesesPareados} de ${situacao.mesesConsiderados} meses — nos demais faltou leitura de geração ou de consumo. Antes de dimensionar qualquer ampliação, recuperar o histórico (verificar datalogger/comunicação da usina e faturas em falta). A lacuna de cobertura pode ser da medição, não da usina.`
          : "Levar o caso à engenharia para dimensionar a ampliação (a lacuna está em kWh/mês; a potência a instalar depende de orientação, inclinação e sombreamento) e apresentar proposta ao cliente.",
        numeros: [
          ...(situacao.deficitMensalKwh != null
            ? [{ label: "Falta gerar", valor: `${fmtKwh(situacao.deficitMensalKwh)}/mês` }]
            : []),
          ...(situacao.coberturaPct != null
            ? [{ label: "Cobertura atual", valor: fmtPct(situacao.coberturaPct) }]
            : []),
          ...dinheiroNaMesa,
        ],
        origem,
      });
    }

    // Os dois itens de CREDITOS em ATENCAO se distinguem pelo saldo, não pelo
    // título — casar por texto quebraria numa reescrita do relatório.
    const excedente =
      item.tema === "CREDITOS" &&
      item.nivel === "ATENCAO" &&
      (situacao.saldoEmMesesDeConsumo ?? 0) > SALDO_MESES_EXCEDENTE;
    const semReserva =
      item.tema === "CREDITOS" && item.nivel === "ATENCAO" && !excedente;

    if (excedente) {
      ops.push({
        tipo: "RATEIO_EXCEDENTE",
        prioridade: "ALTA",
        titulo: "Destinar o excedente a outra unidade (rateio)",
        evidencia: item.texto,
        acao:
          "Perguntar ao cliente se há outra UC no mesmo CPF/CNPJ (casa, sítio, ponto comercial) para entrar como beneficiária e cadastrar o rateio na concessionária. Alternativa: migrar consumo para elétrico (climatização, aquecimento de água, carro elétrico). Crédito parado expira.",
        numeros: [
          ...(situacao.saldoCreditosKwh != null
            ? [{ label: "Créditos parados", valor: fmtKwh(situacao.saldoCreditosKwh) }]
            : []),
          ...(situacao.saldoEmMesesDeConsumo != null
            ? [
                {
                  label: "Equivale a",
                  valor: `${fmt1(situacao.saldoEmMesesDeConsumo)} meses de consumo`,
                },
              ]
            : []),
        ],
        origem,
      });
    }

    if (semReserva) {
      ops.push({
        tipo: "AMPLIACAO",
        prioridade: "MEDIA",
        titulo: "Sem reserva para o inverno — abrir conversa de ampliação",
        evidencia: item.texto,
        acao:
          "Antecipar ao cliente que as faturas de outono/inverno virão mais altas e usar isso para abrir a conversa de ampliação antes da estação.",
        numeros: [
          ...(situacao.saldoCreditosKwh != null
            ? [{ label: "Saldo de créditos", valor: fmtKwh(situacao.saldoCreditosKwh) }]
            : []),
          ...dinheiroNaMesa,
        ],
        origem,
      });
    }

    if (item.tema === "DESEMPENHO" && item.nivel === "ACAO") {
      ops.push({
        tipo: "VISTORIA",
        prioridade: "ALTA",
        titulo: "Vender vistoria técnica (geração abaixo do previsto)",
        evidencia: item.texto,
        acao:
          "Agendar vistoria: limpeza dos módulos, checagem de sombreamento novo e verificação do inversor. Cliente perdendo geração é a venda mais fácil — e a mais urgente.",
        numeros: [
          ...(situacao.desempenhoMedioPct != null
            ? [{ label: "Desempenho médio", valor: fmtPct(situacao.desempenhoMedioPct) }]
            : []),
          ...(situacao.variacaoAnoAnteriorPct != null
            ? [
                {
                  label: "Vs. ano anterior",
                  valor: `${situacao.variacaoAnoAnteriorPct >= 0 ? "+" : ""}${fmtPct(situacao.variacaoAnoAnteriorPct)}`,
                },
              ]
            : []),
        ],
        origem,
      });
    }

    if (item.tema === "DESEMPENHO" && item.nivel === "ATENCAO") {
      ops.push({
        tipo: "LIMPEZA",
        prioridade: "MEDIA",
        titulo: "Ofertar limpeza dos módulos",
        evidencia: item.texto,
        acao:
          "Oferecer limpeza preventiva — serviço de ticket baixo, fecha rápido e recupera boa parte da diferença de geração.",
        numeros:
          situacao.desempenhoMedioPct != null
            ? [{ label: "Desempenho médio", valor: fmtPct(situacao.desempenhoMedioPct) }]
            : [],
        origem,
      });
    }

    if (item.tema === "MONITORAMENTO" && item.nivel === "ACAO") {
      ops.push({
        tipo: "MONITORAMENTO",
        prioridade: "ALTA",
        titulo: "Regularizar a comunicação do inversor",
        evidencia: item.texto,
        acao:
          "Acionar o técnico para restabelecer a conexão do inversor. Enquanto o monitoramento falha, o relatório do cliente sai com geração subestimada — risco de desgaste na relação.",
        numeros: [],
        origem,
      });
    }
  }

  // Nenhum problema apontado = cliente satisfeito com números na mão. É o
  // momento de pedir indicação, não de vender conserto.
  if (ops.length === 0) {
    ops.push({
      tipo: "RELACIONAMENTO",
      prioridade: "BAIXA",
      titulo: "Cliente saudável — pedir indicação",
      evidencia: situacao.resumo,
      acao:
        "Sem pendência técnica nem lacuna de geração: usar o relatório como prova de resultado para pedir indicação e reforçar a renovação do plano de monitoramento.",
      numeros: [
        ...(situacao.coberturaPct != null
          ? [{ label: "Cobertura", valor: fmtPct(situacao.coberturaPct) }]
          : []),
        ...(situacao.desempenhoMedioPct != null
          ? [{ label: "Desempenho", valor: fmtPct(situacao.desempenhoMedioPct) }]
          : []),
      ],
      origem,
    });
  }

  return ops;
}

// -----------------------------------------------------------------------------
// Diagnóstico do rateio (proprietário com beneficiárias) → oportunidades
// -----------------------------------------------------------------------------

function oportunidadesDoRateio(
  situacao: SituacaoRateio,
  faturadoMedioRs: number | null,
): OportunidadeComercial[] {
  const ops: OportunidadeComercial[] = [];
  const origem = "Grupo (rateio)";

  for (const item of situacao.itens) {
    if (item.tema === "USINA" && item.nivel === "ACAO") {
      ops.push({
        tipo: "REGULARIZAR_RATEIO",
        prioridade: "ALTA",
        titulo: "Regularizar o rateio junto à concessionária",
        evidencia: item.texto,
        acao:
          "A energia gerada não está chegando às unidades. Abrir protocolo na concessionária e comunicar o cliente antes que ele perceba pela fatura.",
        numeros: [
          ...(situacao.geracaoMediaKwh != null
            ? [{ label: "Geração média", valor: `${fmtKwh(situacao.geracaoMediaKwh)}/mês` }]
            : []),
          ...(situacao.injetadaMediaKwh != null
            ? [{ label: "Injetada média", valor: `${fmtKwh(situacao.injetadaMediaKwh)}/mês` }]
            : []),
        ],
        origem,
      });
    }

    if (item.tema === "ATENDIMENTO" && item.nivel === "ACAO") {
      ops.push({
        tipo: "AMPLIACAO",
        prioridade: "ALTA",
        titulo: "Propor ampliação — os créditos não cobrem o grupo",
        evidencia: item.texto,
        acao:
          "Levar a lacuna do grupo (em kWh/mês) à engenharia e apresentar proposta de ampliação. A potência a instalar é decisão de projeto.",
        numeros: [
          ...(situacao.deficitMensalKwh != null
            ? [{ label: "Falta compensar", valor: `${fmtKwh(situacao.deficitMensalKwh)}/mês` }]
            : []),
          ...(situacao.coberturaPct != null
            ? [{ label: "Cobertura do grupo", valor: fmtPct(situacao.coberturaPct) }]
            : []),
          ...(faturadoMedioRs != null && faturadoMedioRs > 0
            ? [
                {
                  label: "Grupo ainda paga",
                  valor: `${fmtBRL(faturadoMedioRs)}/mês`,
                },
              ]
            : []),
        ],
        origem,
      });
    }

    if (item.tema === "DISTRIBUICAO" && item.nivel !== "OK") {
      // Sobra crédito numa UC e falta em outra: dá pra apontar quais.
      const sobrando = situacao.ucs.filter(
        (u) =>
          u.participacaoConsumoPct != null &&
          u.percentual - u.participacaoConsumoPct >= RATEIO_DESVIO_PP,
      );
      const faltando = situacao.ucs.filter(
        (u) =>
          u.participacaoConsumoPct != null &&
          u.participacaoConsumoPct - u.percentual >= RATEIO_DESVIO_PP,
      );
      ops.push({
        tipo: "REVISAO_RATEIO",
        prioridade: item.nivel === "ACAO" ? "ALTA" : "MEDIA",
        titulo: "Revisar os percentuais de rateio",
        evidencia: item.texto,
        acao:
          "Recalcular os percentuais pela participação real de consumo e protocolar a alteração na concessionária. Serviço de gestão — sem obra, resultado imediato na fatura.",
        numeros: [
          ...sobrando.map((u) => ({
            label: `Sobra em ${formatCodigoUc(u.codigoUc)}`,
            valor: `rateio ${fmtPct(u.percentual)} × consumo ${fmtPct(u.participacaoConsumoPct!)}`,
          })),
          ...faltando.map((u) => ({
            label: `Falta em ${formatCodigoUc(u.codigoUc)}`,
            valor: `rateio ${fmtPct(u.percentual)} × consumo ${fmtPct(u.participacaoConsumoPct!)}`,
          })),
        ],
        origem,
      });
    }
  }

  // Excedente ocioso no grupo: alguma UC com muito crédito parado.
  const comExcedente = situacao.ucs.filter(
    (u) =>
      u.saldoEmMesesDeConsumo != null &&
      u.saldoEmMesesDeConsumo > SALDO_MESES_EXCEDENTE,
  );
  if (comExcedente.length > 0) {
    ops.push({
      tipo: "RATEIO_EXCEDENTE",
      prioridade: "MEDIA",
      titulo: "Crédito parado em unidade do grupo",
      evidencia: `${comExcedente.length === 1 ? "Uma unidade acumulou" : `${comExcedente.length} unidades acumularam`} crédito acima do próprio consumo. Crédito não utilizado expira em 60 meses.`,
      acao:
        "Redirecionar o excedente: incluir nova beneficiária no rateio ou rebalancear os percentuais entre as UCs existentes.",
      numeros: comExcedente.map((u) => ({
        label: formatCodigoUc(u.codigoUc),
        valor: `${fmtKwh(u.saldoCreditosKwh ?? 0)} · ${fmt1(u.saldoEmMesesDeConsumo!)} meses`,
      })),
      origem,
    });
  }

  if (ops.length === 0) {
    ops.push({
      tipo: "RELACIONAMENTO",
      prioridade: "BAIXA",
      titulo: "Grupo equilibrado — pedir indicação",
      evidencia: situacao.resumo,
      acao:
        "Rateio atendendo todas as unidades: usar o relatório consolidado como prova de resultado para pedir indicação e reforçar a renovação do plano de monitoramento.",
      numeros:
        situacao.coberturaPct != null
          ? [{ label: "Cobertura do grupo", valor: fmtPct(situacao.coberturaPct) }]
          : [],
      origem,
    });
  }

  return ops;
}

// -----------------------------------------------------------------------------
// Plano de monitoramento (independe do diagnóstico de geração)
// -----------------------------------------------------------------------------

/**
 * Usina ativa sem plano de monitoramento vigente = receita recorrente na mesa.
 * Espelha o `deriveStatus` do modal de planos: vigente é o registro com
 * dataInicio <= hoje <= dataFim; sem registro = sem plano.
 */
async function oportunidadePlanoMonitoramento(
  proprietarioId: string,
): Promise<OportunidadeComercial | null> {
  const usinas = await prisma.brasilSolarClient.findMany({
    where: { proprietarioId, active: true },
    select: {
      nome: true,
      monitoringPlans: { select: { dataInicio: true, dataFim: true } },
    },
  });
  if (usinas.length === 0) return null;

  const agora = new Date();
  const semPlano = usinas.filter(
    (u) =>
      !u.monitoringPlans.some(
        (p) => p.dataInicio <= agora && agora <= p.dataFim,
      ),
  );
  if (semPlano.length === 0) return null;

  const nunca = semPlano.filter((u) => u.monitoringPlans.length === 0);
  return {
    tipo: "PLANO_MONITORAMENTO",
    prioridade: "MEDIA",
    titulo:
      nunca.length === semPlano.length
        ? "Vender plano de monitoramento"
        : "Renovar plano de monitoramento vencido",
    evidencia: `${semPlano.length} de ${usinas.length} usina(s) do cliente está(ão) sem plano de monitoramento vigente${nunca.length > 0 && nunca.length < semPlano.length ? ` — ${nunca.length} nunca teve(tiveram) plano` : ""}.`,
    acao:
      "Ofertar o plano usando o relatório mensal como entregável: é o mesmo material que já sustenta as demais ações desta lista.",
    numeros: semPlano.map((u) => ({
      label: u.nome,
      valor: u.monitoringPlans.length === 0 ? "nunca contratou" : "vencido",
    })),
    origem: "Contratos",
  };
}

// -----------------------------------------------------------------------------
// Entrada pública
// -----------------------------------------------------------------------------

export async function getAcoesComerciaisProprietario(
  proprietarioId: string,
): Promise<AcaoComercialData | { error: string; status: number }> {
  const proprietario = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    select: {
      id: true,
      nome: true,
      cidade: true,
      uf: true,
      email: true,
      telefone: true,
    },
  });
  if (!proprietario) return { error: "Proprietário não encontrado", status: 404 };

  const lista = await listarRelatoriosProprietario(proprietarioId);
  if ("error" in lista) return lista;

  const planoOp = await oportunidadePlanoMonitoramento(proprietarioId);
  const base: Omit<AcaoComercialData, "oportunidades" | "escopo" | "mesesConsiderados"> = {
    proprietario,
    ucsAnalisadas: [],
  };

  // --- Proprietário com beneficiárias: o diagnóstico é do rateio -------------
  if (lista.temBeneficiarias) {
    const agregado = await getProprietarioRelatorioAgregado(proprietarioId);
    if ("error" in agregado) return agregado;

    const ucsAnalisadas = lista.ucs.map((uc) => ({
      ucId: uc.ucId,
      codigoUc: uc.codigoUc,
      nome: uc.nome,
      diagnosticada: agregado.situacao != null,
      motivo:
        agregado.situacao == null
          ? "Sem consumo faturado no período — nada a diagnosticar"
          : null,
    }));

    if (!agregado.situacao) {
      return {
        ...base,
        escopo: "AGREGADO",
        mesesConsiderados: null,
        ucsAnalisadas,
        oportunidades: ordenar(planoOp ? [planoOp] : []),
      };
    }

    const ops = oportunidadesDoRateio(
      agregado.situacao,
      faturadoMedio(agregado.meses, agregado.situacao.mesesConsiderados),
    );
    if (planoOp) ops.push(planoOp);
    return {
      ...base,
      escopo: "AGREGADO",
      mesesConsiderados: agregado.situacao.mesesConsiderados,
      ucsAnalisadas,
      oportunidades: ordenar(ops),
    };
  }

  // --- Sem beneficiárias: uma análise por UC --------------------------------
  const ops: OportunidadeComercial[] = [];
  const ucsAnalisadas: AcaoComercialData["ucsAnalisadas"] = [];
  let mesesConsiderados: number | null = null;

  for (const uc of lista.ucs) {
    const rel = await getProprietarioRelatorio(proprietarioId, uc.ucId);
    if ("error" in rel) {
      ucsAnalisadas.push({
        ucId: uc.ucId,
        codigoUc: uc.codigoUc,
        nome: uc.nome,
        diagnosticada: false,
        motivo: rel.error,
      });
      continue;
    }
    if (!rel.situacao) {
      ucsAnalisadas.push({
        ucId: uc.ucId,
        codigoUc: uc.codigoUc,
        nome: uc.nome,
        diagnosticada: false,
        motivo:
          "Sem geração medida no período (usina sem monitoramento vinculado ou faturas faltando)",
      });
      continue;
    }
    ucsAnalisadas.push({
      ucId: uc.ucId,
      codigoUc: uc.codigoUc,
      nome: uc.nome,
      diagnosticada: true,
      motivo: null,
    });
    mesesConsiderados = Math.max(
      mesesConsiderados ?? 0,
      rel.situacao.mesesConsiderados,
    );
    ops.push(
      ...oportunidadesDaUsina(
        rel.situacao,
        `${formatCodigoUc(uc.codigoUc)} · ${uc.nome}`,
        faturadoMedio(rel.meses, rel.situacao.mesesConsiderados),
      ),
    );
  }

  if (planoOp) ops.push(planoOp);

  return {
    ...base,
    escopo: "UC",
    mesesConsiderados,
    ucsAnalisadas,
    oportunidades: ordenar(ops),
  };
}
