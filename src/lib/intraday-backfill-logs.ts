/**
 * Fecha em `MonitoringLog` os dias que têm curva intradiária e ficaram sem log.
 *
 * POR QUE EXISTE: a poda de `inverter_samples` apaga tudo fora da janela de
 * retenção. O kWh do dia sobrevive em `MonitoringLog` — mas SÓ para quem o
 * fechamento processou, e ele nem sempre processa: em 15–17/08/26 ficaram 508
 * pares (usina, dia) com geração medida e nenhum log, a maioria SUNGROW, cujo
 * dado chega ~130 min atrasado e portanto depois do fechamento do dia. Apagar
 * a curva antes de fechar apagaria a geração desses dias de vez — e calado,
 * porque some do mensal e do anual sem nada acusar.
 *
 * É por isso que `podarAmostras` chama esta função ANTES de apagar: em vez de
 * confiar que o fechamento funcionou, a poda garante o fechamento. Falha nova
 * no coletor vira dia fechado com atraso, não geração perdida.
 *
 * POR QUE NÃO REUSA `atualizarGeracaoDoDia`: aquela rotina serve o dia corrente
 * e tem dois efeitos que num backfill fazem estrago:
 *   1. em dia passado SOBRESCREVE log existente com o valor da curva — aqui só
 *      preenchemos buraco, nunca mexemos no que já está gravado;
 *   2. `marcarComunicacao` faz `ultima_leitura = <data da amostra>` sem
 *      condição, e regredir esse campo para julho dispararia alerta de usina
 *      parada na frota inteira.
 * A CONTA é a mesma (`calcularGeracaoDoDia`) — duas implementações da mesma
 * regra é como uma corrige e a outra continua errada sem nada acusar.
 */
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcularGeracaoDoDia, dataDoLog, type AmostraParaGeracao } from "@/lib/intraday-generation";
import { esperadaDoDiaDaUsina } from "@/lib/geracao-esperada";

const BLOCO_GRAVACAO = 300;

export interface ResumoFechamento {
  diasVerificados: number;
  paresSemLog: number;
  logsGravados: number;
  /** Curva existe mas soma 0 kWh: datalogger mudo. Fica sem log de propósito. */
  paresSemGeracao: number;
  duracaoMs: number;
}

/**
 * @param opts.desde  Só considera dias a partir daqui. A poda passa a própria
 *                    data de corte: fechar o que vai ser apagado basta.
 * @param opts.aplicar Sem isto, só conta — não grava nada.
 */
export async function fecharDiasPendentes(
  opts: { desde?: Date; aplicar?: boolean } = {},
): Promise<ResumoFechamento> {
  const t0 = Date.now();
  const r: ResumoFechamento = {
    diasVerificados: 0, paresSemLog: 0, logsGravados: 0, paresSemGeracao: 0, duracaoMs: 0,
  };

  // O dia corrente fica fora: ainda vai receber amostras, e fechá-lo aqui seria
  // fechar cedo. Quem cuida dele é `atualizarGeracaoDoDia` a cada rodada.
  const dias = await prisma.$queryRaw<Array<{ dia: Date }>>`
    SELECT DISTINCT time_stamp::date AS dia
      FROM inverter_samples
     WHERE time_stamp < date_trunc('day', now())
       ${opts.desde ? Prisma.sql`AND time_stamp >= ${opts.desde}` : Prisma.empty}
     ORDER BY 1
  `;
  r.diasVerificados = dias.length;

  for (const { dia } of dias) {
    const inicio = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate()));
    const fim = new Date(inicio.getTime() + 86400000);
    const data = dataDoLog(inicio);

    const faltantes = await prisma.$queryRaw<Array<{ client_id: string }>>`
      SELECT DISTINCT s.client_id
        FROM inverter_samples s
       WHERE s.time_stamp >= ${inicio} AND s.time_stamp < ${fim}
         AND NOT EXISTS (
           SELECT 1 FROM monitoring_logs m
            WHERE m.client_id = s.client_id AND m.data = ${data}
         )
    `;
    if (faltantes.length === 0) continue;

    const ids = faltantes.map((f) => f.client_id);
    r.paresSemLog += ids.length;

    const amostras = (await prisma.inverterSample.findMany({
      where: { clientId: { in: ids }, timeStamp: { gte: inicio, lt: fim } },
      select: { clientId: true, psKey: true, timeStamp: true, p1Wh: true, pAcW: true },
    })) as AmostraParaGeracao[];

    const porUsina = calcularGeracaoDoDia(amostras);
    const usinas = await prisma.brasilSolarClient.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, geracaoMediaEsperada: true, geracaoAnualEsperada: true,
        geracaoContrato: true, potenciaInstalada: true,
      },
    });
    const porId = new Map(usinas.map((u) => [u.id, u]));

    const linhas: Array<{ id: string; kwh: number; picoKw: number; esperada: number | null }> = [];
    for (const id of ids) {
      const g = porUsina.get(id);
      const u = porId.get(id);
      // kWh <= 0 NÃO vira log. Curva toda zerada é datalogger mudo, não usina
      // que gerou zero — gravar 0 seria inventar medição que não houve, e o
      // zero entraria na média mensal como se fosse dia ruim de sol.
      if (!g || !u || g.kwh <= 0) { r.paresSemGeracao++; continue; }
      linhas.push({ id, kwh: g.kwh, picoKw: g.picoKw, esperada: esperadaDoDiaDaUsina(u, data) });
    }

    if (linhas.length > 0 && opts.aplicar) {
      for (let i = 0; i < linhas.length; i += BLOCO_GRAVACAO) {
        const bloco = linhas.slice(i, i + BLOCO_GRAVACAO);
        const vals = bloco.map(
          (l) => Prisma.sql`(${randomUUID()}, ${l.id}, ${data}, ${l.kwh}::double precision,
                             ${l.picoKw}::double precision, ${l.esperada}::double precision, 'API', NOW())`,
        );
        // DO NOTHING: só preenche buraco. Se alguém gravou no meio-tempo, o
        // dado dele vale mais que este recálculo.
        await prisma.$executeRaw`
          INSERT INTO monitoring_logs
            (id, client_id, data, geracao_diaria, pico_maximo, geracao_esperada, origem, created_at)
          VALUES ${Prisma.join(vals)}
          ON CONFLICT (client_id, data) DO NOTHING
        `;
      }
    }
    r.logsGravados += linhas.length;
  }

  r.duracaoMs = Date.now() - t0;
  return r;
}
