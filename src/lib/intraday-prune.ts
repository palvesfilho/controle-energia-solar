/**
 * Poda de `inverter_samples` — mantém só a janela recente da curva intradiária.
 *
 * Coletando de 15 em 15 min, a frota produz da ordem de 110 mil linhas por dia
 * (1.819 usinas × ~1,2 inversores × ~50 slots com sol) — cerca de 3,3 milhões
 * por mês. Sem poda, a tabela cresce sem teto no Postgres do Railway.
 *
 * O que se perde: nada de histórico de geração. O total diário de cada usina
 * vive em `MonitoringLog`, que não é tocado aqui — some apenas o DETALHE
 * intradiário (a forma da curva) de dias antigos.
 */
import { prisma } from "@/lib/prisma";

/** Dias de curva intradiária mantidos. Meio ano cobre qualquer consulta do portal. */
export const DIAS_RETENCAO_PADRAO = 180;
/** Apaga em blocos: um DELETE de milhões de linhas segura a tabela inteira. */
const BLOCO = 20_000;

export interface ResumoPoda {
  corte: Date;
  linhasTotal: number;
  linhasAlvo: number;
  linhasApagadas: number;
  aplicado: boolean;
  duracaoMs: number;
}

export async function podarAmostras(
  opts: { dias?: number; aplicar?: boolean } = {},
): Promise<ResumoPoda> {
  const t0 = Date.now();
  const dias = Math.max(30, opts.dias ?? DIAS_RETENCAO_PADRAO);
  const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const [linhasTotal, linhasAlvo] = await Promise.all([
    prisma.inverterSample.count(),
    prisma.inverterSample.count({ where: { timeStamp: { lt: corte } } }),
  ]);

  if (!opts.aplicar || linhasAlvo === 0) {
    return {
      corte,
      linhasTotal,
      linhasAlvo,
      linhasApagadas: 0,
      aplicado: false,
      duracaoMs: Date.now() - t0,
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
  }

  return {
    corte,
    linhasTotal,
    linhasAlvo,
    linhasApagadas,
    aplicado: true,
    duracaoMs: Date.now() - t0,
  };
}
