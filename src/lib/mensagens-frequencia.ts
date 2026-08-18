/**
 * Trava de frequência: quantas mensagens a mesma pessoa pode receber.
 *
 * Existe porque a base é finita e a paciência dela também. Sem trava, três
 * campanhas boas na mesma semana têm o mesmo efeito de uma campanha ruim — o
 * cliente desliga a notificação, e aí nenhuma das próximas alcança ninguém. A
 * trava protege o CANAL, não o cliente de uma mensagem específica.
 *
 * 🔑 O que conta e o que é bloqueado são coisas diferentes:
 *   - CONTA tudo que chegou ao cliente, campanha e ativação, porque o barulho
 *     que ele sente é a soma;
 *   - BLOQUEIA só campanha (divisão 1). Ativação é a resposta a algo que
 *     aconteceu na usina dele — segurar "sua usina parou de comunicar" porque o
 *     cliente já recebeu duas ofertas este mês seria trocar a coisa certa pela
 *     errada. O ritmo das ativações é controlado pelo `cooldownDias` de cada uma.
 *
 * Quem ficou de fora é SEMPRE informado no disparo. Exclusão silenciosa faria o
 * operador achar que a campanha alcançou 21 pessoas quando alcançou 9 — ver
 * [[feedback_correcao_pela_metade_falha_calada]].
 */
import { prisma } from "@/lib/prisma";
import { getFrequenciaMensagens } from "@/lib/app-settings";

export interface ResultadoFrequencia {
  /** Podem receber agora. */
  liberados: string[];
  /** Barrados pela trava, com o motivo em texto para a tela. */
  bloqueados: Array<{ proprietarioId: string; motivo: string }>;
  /** Configuração aplicada, para a tela poder explicar de onde veio o corte. */
  regra: { maxPorPeriodo: number; periodoDias: number; intervaloMinimoDias: number };
}

/**
 * Separa quem pode receber de quem já recebeu demais.
 *
 * Uma consulta só para todo o público — não uma por cliente. Com a base
 * crescendo, N consultas dentro de um disparo transformariam a trava no passo
 * mais lento do envio.
 */
export async function filtrarPorFrequencia(
  proprietarioIds: string[],
): Promise<ResultadoFrequencia> {
  const regra = await getFrequenciaMensagens();

  // Trava desligada de propósito pelo admin: devolve todo mundo sem consultar
  // nada.
  if (regra.maxPorPeriodo <= 0 || proprietarioIds.length === 0) {
    return { liberados: proprietarioIds, bloqueados: [], regra };
  }

  const inicioPeriodo = new Date();
  inicioPeriodo.setDate(inicioPeriodo.getDate() - regra.periodoDias);

  const recentes = await prisma.campanhaEnvio.findMany({
    where: {
      proprietarioId: { in: proprietarioIds },
      createdAt: { gte: inicioPeriodo },
    },
    select: { proprietarioId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const porCliente = new Map<string, Date[]>();
  for (const r of recentes) {
    const lista = porCliente.get(r.proprietarioId);
    if (lista) lista.push(r.createdAt);
    else porCliente.set(r.proprietarioId, [r.createdAt]);
  }

  const agora = Date.now();
  const DIA_MS = 24 * 60 * 60 * 1000;

  const liberados: string[] = [];
  const bloqueados: ResultadoFrequencia["bloqueados"] = [];

  for (const id of proprietarioIds) {
    const datas = porCliente.get(id) ?? [];

    if (datas.length >= regra.maxPorPeriodo) {
      bloqueados.push({
        proprietarioId: id,
        motivo: `já recebeu ${datas.length} mensagem(ns) nos últimos ${regra.periodoDias} dias`,
      });
      continue;
    }

    // `datas` já vem em ordem decrescente: a primeira é a mais recente.
    const ultima = datas[0];
    if (ultima && regra.intervaloMinimoDias > 0) {
      const diasDesde = (agora - ultima.getTime()) / DIA_MS;
      if (diasDesde < regra.intervaloMinimoDias) {
        bloqueados.push({
          proprietarioId: id,
          motivo: `recebeu há ${Math.floor(diasDesde)} dia(s) — o intervalo mínimo é ${regra.intervaloMinimoDias}`,
        });
        continue;
      }
    }

    liberados.push(id);
  }

  return { liberados, bloqueados, regra };
}
