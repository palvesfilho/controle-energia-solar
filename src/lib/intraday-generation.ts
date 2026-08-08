/**
 * Fecha a geração do dia a partir das amostras intradiárias já gravadas.
 *
 * Antes, a geração diária (`MonitoringLog`) só era atualizada por sync manual
 * ou pelo botão "Atualizar todas" — uma chamada por usina, em cima das APIs de
 * energia diária. Como o coletor de 15 min já traz a curva, a geração do dia
 * sai de graça do que está no banco: nenhuma chamada externa a mais.
 *
 * Como cada plataforma vira kWh do dia:
 *
 *   SUNGROW / HUAWEI  →  contador acumulado do dia (`p1Wh`). Vale o MAIOR valor
 *                        do dia — é contador, não medida instantânea.
 *   SOLAREDGE / FRONIUS → integral da potência: Σ(W × 0,25 h). Cada slot de 15
 *                        min carrega a potência média daquele quarto de hora,
 *                        então a soma é a energia do dia.
 *
 * Quando as duas fontes existem, o contador vence: ele vem do inversor e não
 * acumula erro de amostragem.
 */
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { esperadaDoDiaDaUsina } from "@/lib/geracao-esperada";
import { SLOT_MINUTOS, type PlataformaIntradia } from "@/lib/intraday-collector";

/** Fração de hora que um slot representa — converte W em Wh. */
const HORAS_POR_SLOT = SLOT_MINUTOS / 60;

/**
 * `MonitoringLog.data` é meio-dia UTC, sempre. Gravar em outra hora cria linha
 * duplicada pro mesmo dia (a unique é [clientId, data]) e infla a geração —
 * já aconteceu com registros em 15:00Z convivendo com 12:00Z.
 */
export function dataDoLog(dia: Date): Date {
  return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 12, 0, 0));
}

/** Meia-noite UTC do dia de um instante. */
function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface ResumoGeracao {
  usinasAtualizadas: number;
  logsGravados: number;
  duracaoMs: number;
}

export interface OpcoesGeracao {
  /** Dia a fechar (UTC). Default: hoje. */
  dia?: Date;
  clientIds?: string[];
  plataformas?: PlataformaIntradia[];
  /**
   * Amostras já em memória. Quando vêm por aqui, nada é lido de
   * `inverter_samples` — é o que permite ao backfill recalcular meses passados
   * sem antes gravar milhões de linhas de curva que ninguém vai olhar.
   */
  amostras?: AmostraParaGeracao[];
}

interface AgregadoUsina {
  /** Maior contador acumulado do dia, em Wh (Sungrow/Huawei). */
  contadorWh: number;
  /** Soma das potências médias dos slots, em W (SolarEdge/Fronius). */
  somaPotenciaW: number;
  /** Maior potência instantânea vista no dia, em W. */
  picoW: number;
  ultimaAmostra: Date;
}

/** Amostra crua, no mínimo que o cálculo precisa. */
export interface AmostraParaGeracao {
  clientId: string;
  psKey: string;
  timeStamp: Date;
  p1Wh: number | null;
  pAcW: number | null;
}

export interface GeracaoCalculada {
  kwh: number;
  picoKw: number;
  ultima: Date;
  /**
   * "contador" = acumulado do próprio inversor; "integral" = área da curva;
   * "oficial" = número diário que a plataforma reporta (SolarEdge).
   */
  metodo: "contador" | "integral" | "oficial";
}

/**
 * Converte amostras intradiárias em kWh do dia por usina.
 *
 * Função pura de propósito: é a MESMA conta usada pela gravação e pelos
 * diagnósticos. Duas implementações da mesma regra é como um erro passa
 * despercebido — uma corrige, a outra continua errada, e nada acusa.
 */
export function calcularGeracaoDoDia(
  amostras: AmostraParaGeracao[],
): Map<string, GeracaoCalculada> {
  // Agrega por usina E por dispositivo: uma usina com 2 inversores soma os
  // contadores dos dois, mas o contador de cada um é o máximo do dia dele.
  const porDispositivo = new Map<string, AgregadoUsina>();
  for (const a of amostras) {
    const chave = `${a.clientId}|${a.psKey}`;
    const cur =
      porDispositivo.get(chave) ??
      { contadorWh: 0, somaPotenciaW: 0, picoW: 0, ultimaAmostra: a.timeStamp };
    if (a.p1Wh != null && a.p1Wh > cur.contadorWh) cur.contadorWh = a.p1Wh;
    if (a.pAcW != null) {
      cur.somaPotenciaW += a.pAcW;
      if (a.pAcW > cur.picoW) cur.picoW = a.pAcW;
    }
    if (a.timeStamp > cur.ultimaAmostra) cur.ultimaAmostra = a.timeStamp;
    porDispositivo.set(chave, cur);
  }

  const porUsina = new Map<string, GeracaoCalculada>();
  for (const [chave, ag] of porDispositivo) {
    const clientId = chave.split("|")[0];
    // Contador vence integral: vem do inversor, não acumula erro de amostragem.
    const usaContador = ag.contadorWh > 0;
    const kwh = usaContador ? ag.contadorWh / 1000 : (ag.somaPotenciaW * HORAS_POR_SLOT) / 1000;
    const cur =
      porUsina.get(clientId) ??
      { kwh: 0, picoKw: 0, ultima: ag.ultimaAmostra, metodo: usaContador ? "contador" : "integral" };
    cur.kwh += kwh;
    cur.picoKw += ag.picoW / 1000;
    if (ag.ultimaAmostra > cur.ultima) cur.ultima = ag.ultimaAmostra;
    // Basta um dispositivo sem contador pra que o total dependa da integral.
    if (!usaContador) cur.metodo = "integral";
    porUsina.set(clientId, cur);
  }

  for (const g of porUsina.values()) {
    g.kwh = Math.round(g.kwh * 100) / 100;
    g.picoKw = Math.round(g.picoKw * 100) / 100;
  }
  return porUsina;
}

interface UsinaParaGeracao {
  id: string;
  plataformaMonitoramento: string | null;
  monitoramentoPlantId: string | null;
}

/**
 * Substitui o kWh calculado pela integral pelo valor oficial da SolarEdge.
 *
 * Falha em silêncio de propósito: se a API não responder, o valor da integral
 * (2% menor, porém correto em ordem de grandeza) segue valendo — melhor um
 * número levemente conservador do que nenhum número no gráfico do cliente.
 */
async function corrigirComEnergiaOficialSolarEdge(
  usinas: UsinaParaGeracao[],
  porUsina: Map<string, GeracaoCalculada>,
  dia: Date,
): Promise<void> {
  const sites = usinas.filter(
    (u) => u.plataformaMonitoramento === "SOLAREDGE" && u.monitoramentoPlantId && porUsina.has(u.id),
  );
  if (sites.length === 0) return;

  try {
    const { getDailyEnergyBulk } = await import("@/lib/solaredge");
    const oficial = await getDailyEnergyBulk(
      sites.map((u) => u.monitoramentoPlantId!),
      dia,
    );
    for (const u of sites) {
      const kwh = oficial.get(u.monitoramentoPlantId!);
      const calc = porUsina.get(u.id);
      if (kwh == null || !calc) continue;
      calc.kwh = Math.round(kwh * 100) / 100;
      calc.metodo = "oficial";
    }
  } catch {
    // Sem energia oficial, fica a integral. Ver comentário acima.
  }
}

/**
 * Recalcula `MonitoringLog.geracaoDiaria` do dia para as usinas que têm
 * amostra intradiária, e atualiza os campos desnormalizados da usina.
 */
export async function atualizarGeracaoDoDia(
  opts: OpcoesGeracao = {},
): Promise<ResumoGeracao> {
  const t0 = Date.now();
  const agora = opts.dia ?? new Date();
  const inicioDia = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  const fimDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);

  const amostras =
    opts.amostras ??
    (await prisma.inverterSample.findMany({
      where: {
        timeStamp: { gte: inicioDia, lt: fimDia },
        ...(opts.clientIds ? { clientId: { in: opts.clientIds } } : {}),
      },
      select: { clientId: true, psKey: true, timeStamp: true, p1Wh: true, pAcW: true },
    }));
  if (amostras.length === 0) return { usinasAtualizadas: 0, logsGravados: 0, duracaoMs: Date.now() - t0 };

  const porUsina = calcularGeracaoDoDia(amostras);

  const usinas = await prisma.brasilSolarClient.findMany({
    where: {
      id: { in: [...porUsina.keys()] },
      ...(opts.plataformas ? { plataformaMonitoramento: { in: opts.plataformas } } : {}),
    },
    select: {
      id: true,
      geracaoMediaEsperada: true,
      geracaoAnualEsperada: true,
      geracaoContrato: true,
      potenciaInstalada: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
    },
  });

  // SolarEdge: troca a integral pelo número oficial do medidor. A curva de 15
  // min dela subestima o dia em ~2% de forma sistemática, e o endpoint de
  // energia é em lote — 3 chamadas pras 241 usinas.
  await corrigirComEnergiaOficialSolarEdge(usinas, porUsina, inicioDia);

  const data = dataDoLog(inicioDia);
  const ehHoje = inicioDia.getTime() === diaUtc(new Date()).getTime();
  let logsGravados = 0;

  // Valor já registrado, pra não rebaixar um dado bom com uma rodada capenga.
  const existentes = new Map(
    (
      await prisma.monitoringLog.findMany({
        where: { clientId: { in: usinas.map((u) => u.id) }, data },
        select: { clientId: true, geracaoDiaria: true, origem: true },
      })
    ).map((l) => [l.clientId, l]),
  );

  const aGravar: Array<{
    id: string;
    kwh: number;
    picoKw: number;
    esperada: number | null;
    ultima: Date;
  }> = [];

  for (const usina of usinas) {
    const ag = porUsina.get(usina.id);
    if (!ag || ag.kwh <= 0) continue;

    const anterior = existentes.get(usina.id);

    // Dentro do dia corrente a geração só cresce. Se o que calculamos agora é
    // MENOR do que o já registrado, a rodada perdeu slots (falha de API,
    // datalogger atrasado) — e escrever mesmo assim faria o gráfico do cliente
    // encolher sozinho. Num dia passado (varredura de fechamento) o recálculo
    // é justamente pra corrigir, então vale.
    if (ehHoje && anterior && anterior.origem === "API" && ag.kwh < anterior.geracaoDiaria) continue;

    aGravar.push({
      id: usina.id,
      kwh: ag.kwh,
      picoKw: ag.picoKw,
      esperada: esperadaDoDiaDaUsina(usina, data),
      ultima: ag.ultima,
    });
  }

  logsGravados = await gravarEmLote(aGravar, data);

  return { usinasAtualizadas: usinas.length, logsGravados, duracaoMs: Date.now() - t0 };
}

/** Tamanho do bloco de gravação — mantém a query longe do teto de parâmetros. */
const BLOCO_GRAVACAO = 300;

/**
 * Grava geração e status em SQL de lote.
 *
 * Um `upsert` + um `update` por usina custam duas idas ao banco cada: medido
 * em 109s para 193 usinas, o que na frota de 1.819 estouraria a janela de 15
 * minutos e faria a rodada seguinte pegar a anterior ainda rodando. Em lote,
 * são duas queries por bloco de 300.
 */
async function gravarEmLote(
  linhas: Array<{ id: string; kwh: number; picoKw: number; esperada: number | null; ultima: Date }>,
  data: Date,
): Promise<number> {
  if (linhas.length === 0) return 0;

  const agora = Date.now();
  let gravados = 0;

  for (let i = 0; i < linhas.length; i += BLOCO_GRAVACAO) {
    const bloco = linhas.slice(i, i + BLOCO_GRAVACAO);

    const logs = bloco.map(
      (l) => Prisma.sql`(
        ${randomUUID()}, ${l.id}, ${data}, ${l.kwh}::double precision,
        ${l.picoKw}::double precision, ${l.esperada}::double precision, 'API', NOW()
      )`,
    );
    // `geracao_esperada` só no INSERT: recalcular no UPDATE sobrescreveria um
    // valor que outra rotina pode ter ajustado à mão.
    gravados += await prisma.$executeRaw`
      INSERT INTO monitoring_logs
        (id, client_id, data, geracao_diaria, pico_maximo, geracao_esperada, origem, created_at)
      VALUES ${Prisma.join(logs)}
      ON CONFLICT (client_id, data) DO UPDATE SET
        origem = 'API',
        geracao_diaria = EXCLUDED.geracao_diaria,
        pico_maximo = EXCLUDED.pico_maximo
    `;

    const status = bloco.map(
      (l) => Prisma.sql`(
        ${l.id}, ${l.kwh}::double precision, ${l.ultima}::timestamptz,
        ${agora - l.ultima.getTime() < 30 * 60 * 1000 ? "ONLINE" : "OFFLINE"}
      )`,
    );
    await prisma.$executeRaw`
      UPDATE brasil_solar_clients AS c SET
        ultima_geracao = v.kwh,
        ultima_leitura = v.ultima,
        status_monitoramento = v.status
      FROM (VALUES ${Prisma.join(status)}) AS v(id, kwh, ultima, status)
      WHERE c.id = v.id
    `;
  }

  return gravados;
}
