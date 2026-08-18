/**
 * Poda de `inverter_samples` — mantém só a janela recente da curva intradiária.
 *
 * Coletando de 15 em 15 min, a frota de 1.914 usinas elegíveis gera ~47,8
 * linhas por usina/dia — cerca de 91 mil linhas e 37 MB POR DIA, a 408 bytes
 * por linha (dado + índices, medido em 18/08/26). Sem poda a tabela cresce sem
 * teto: em 18/08/26 ela sozinha era 524 MB dos 730 MB do banco, num volume
 * Railway de 1 GB que estava em 97%.
 *
 * O que se perde: nada de histórico de geração. O kWh diário de cada usina vive
 * em `MonitoringLog` — e é dele que saem o mensal e o anual. Some apenas o
 * DETALHE intradiário (a forma da curva) de dias fora da janela.
 *
 * ⚠️ A curva NÃO é recuperável depois de apagada, em NENHUMA plataforma. O
 * refetch sob demanda do portal (`refreshAmostrasDia`) só aceita hoje e ontem,
 * e o coletor recua no máximo 6 h (`LOOKBACK_MAX_MS`). Aumentar a janela é
 * barato; diminuir é irreversível.
 */
import { prisma } from "@/lib/prisma";
import { fecharDiasPendentes, type ResumoFechamento } from "@/lib/intraday-backfill-logs";

/**
 * Dias de curva intradiária mantidos.
 *
 * 7 e não 3: o portal só exibe hoje e ontem, mas uma semana permite investigar
 * na segunda o que aconteceu no sábado. Custa ~261 MB em regime pleno contra
 * ~112 MB com 3 dias, e o custo diário (insert + delete + WAL) é IDÊNTICO nos
 * dois — a janela muda só o tamanho estacionário.
 */
export const DIAS_RETENCAO_PADRAO = 7;

/**
 * Piso da janela. 2 dias porque o portal do cliente exibe HOJE e ONTEM
 * (`portal-cliente-dashboard.tsx`): abaixo disso o gráfico do cliente fica sem
 * curva. Era 30 — o que fazia qualquer pedido menor virar 30 em silêncio.
 */
const DIAS_MINIMO = 2;

/** Apaga em blocos: um DELETE de milhões de linhas segura a tabela inteira. */
const BLOCO = 20_000;

export interface ResumoPoda {
  corte: Date;
  linhasTotal: number;
  linhasAlvo: number;
  linhasApagadas: number;
  aplicado: boolean;
  fechamento: ResumoFechamento | null;
  duracaoMs: number;
}

export async function podarAmostras(
  opts: { dias?: number; aplicar?: boolean } = {},
): Promise<ResumoPoda> {
  const t0 = Date.now();
  const dias = Math.max(DIAS_MINIMO, opts.dias ?? DIAS_RETENCAO_PADRAO);
  const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  // ANTES de apagar: fecha em MonitoringLog todo dia com curva que ficou sem
  // log. O fechamento diário não é confiável — a SUNGROW entrega o dado ~130
  // min atrasado, depois da varredura, e em 15–17/08/26 isso deixou 508 pares
  // (usina, dia) com geração medida e nenhum log. Sem esta chamada a poda
  // apagaria justamente esses dias, e a perda não apareceria em lugar nenhum.
  const fechamento = await fecharDiasPendentes({ desde: corte, aplicar: opts.aplicar });

  const [linhasTotal, linhasAlvo] = await Promise.all([
    prisma.inverterSample.count(),
    prisma.inverterSample.count({ where: { timeStamp: { lt: corte } } }),
  ]);

  if (!opts.aplicar || linhasAlvo === 0) {
    return {
      corte, linhasTotal, linhasAlvo, linhasApagadas: 0,
      aplicado: false, fechamento, duracaoMs: Date.now() - t0,
    };
  }

  let linhasApagadas = 0;
  for (;;) {
    // DELETE ... WHERE ctid IN (SELECT ... LIMIT n): apaga em blocos sem
    // precisar carregar os ids na aplicação.
    const n = await prisma.$executeRaw`
      DELETE FROM inverter_samples
      WHERE ctid IN (
        SELECT ctid FROM inverter_samples WHERE time_stamp < ${corte} LIMIT ${BLOCO}
      )
    `;
    linhasApagadas += n;
    if (n === 0) break;

    // Checkpoint a cada bloco. Um DELETE em massa gera WAL mais rápido do que
    // o checkpoint automático recicla, e num volume apertado é o WAL — não a
    // tabela — que estoura o disco no meio da limpeza.
    try {
      await prisma.$executeRawUnsafe("CHECKPOINT");
    } catch {
      // Sem permissão de CHECKPOINT (não-superuser): segue sem ele. O
      // checkpoint automático dá conta quando há folga de disco.
    }
  }

  return {
    corte, linhasTotal, linhasAlvo, linhasApagadas,
    aplicado: true, fechamento, duracaoMs: Date.now() - t0,
  };
}
