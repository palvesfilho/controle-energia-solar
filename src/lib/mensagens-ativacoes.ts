/**
 * Motor das ATIVAÇÕES — a divisão 2 do módulo Mensagens.
 *
 * Roda de tempos em tempos, pergunta a cada regra ligada quem entrou na
 * condição dela, e manda a mensagem para quem passa por três filtros:
 *
 *   1. o evento é POSTERIOR ao momento em que a regra foi ligada
 *      → acender a regra não dispara para quem já estava na condição;
 *   2. o cliente não recebeu ESTA regra dentro do cooldown
 *      → usina muda por três semanas não vira três semanas de aviso;
 *   3. o cliente está ativo e existe.
 *
 * ⚠️ Aqui a mensagem sai SEM ninguém aprovar cada envio — é o que diferencia a
 * divisão 2 da 1. A aprovação acontece uma vez só, quando alguém liga a regra.
 * Por isso toda `Ativacao` nasce desligada e os três filtros acima não são
 * detalhe de implementação: são o que separa "avisar o cliente" de "perseguir
 * o cliente".
 */
import { prisma } from "@/lib/prisma";
import { enviarPushProprietario } from "@/lib/push-notificacoes";
import { GATILHOS, type TipoGatilho } from "@/lib/mensagens-gatilhos";

export interface ResultadoAtivacao {
  ativacaoId: string;
  nome: string;
  /** Quem estava na condição nesta rodada, antes dos filtros. */
  candidatos: number;
  /** Descartados por já terem recebido dentro do cooldown. */
  emCooldown: number;
  /** Descartados por serem anteriores a ligar a regra. */
  anterioresAoLigar: number;
  enviados: number;
  aparelhos: number;
  erro?: string;
}

/** Igual ao disparo de campanha: não abre uma conexão por cliente de uma vez. */
const LOTE = 6;

async function emLotes<T>(itens: T[], tamanho: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < itens.length; i += tamanho) {
    await Promise.all(itens.slice(i, i + tamanho).map(fn));
  }
}

/**
 * Avalia as regras e dispara o que passar pelos filtros.
 *
 * `simular: true` faz tudo menos enviar e gravar — é o que a tela usa para
 * mostrar "esta regra pegaria 3 clientes hoje" antes de alguém ligá-la.
 */
export async function avaliarAtivacoes(opts?: {
  somenteId?: string;
  simular?: boolean;
}): Promise<ResultadoAtivacao[]> {
  const simular = opts?.simular ?? false;

  const regras = await prisma.ativacao.findMany({
    where: opts?.somenteId
      ? { id: opts.somenteId }
      : // Sem id explícito, só as ligadas. A rodada do cron nunca acorda uma
        // regra que alguém deixou desligada de propósito.
        { ativa: true },
  });

  const resultados: ResultadoAtivacao[] = [];

  for (const regra of regras) {
    const base: ResultadoAtivacao = {
      ativacaoId: regra.id,
      nome: regra.nome,
      candidatos: 0,
      emCooldown: 0,
      anterioresAoLigar: 0,
      enviados: 0,
      aparelhos: 0,
    };

    const def = GATILHOS[regra.gatilho as TipoGatilho];
    if (!def) {
      resultados.push({ ...base, erro: `Gatilho desconhecido: ${regra.gatilho}` });
      continue;
    }

    try {
      const candidatos = await def.avaliar(
        (regra.params ?? {}) as Record<string, unknown>,
      );
      base.candidatos = candidatos.length;

      // Filtro 1 — o corte que impede a enxurrada ao acender a regra.
      // Numa simulação não se aplica: a tela quer mostrar quem a regra
      // alcançaria, e uma regra nunca ligada não tem `ativadaEm`.
      const marco = regra.ativadaEm;
      const novos = simular
        ? candidatos
        : candidatos.filter((c) => {
            if (marco && c.eventoEm < marco) {
              base.anterioresAoLigar += 1;
              return false;
            }
            return true;
          });

      // Filtro 2 — cooldown por cliente nesta regra.
      const limite = new Date();
      limite.setDate(limite.getDate() - regra.cooldownDias);
      const recentes = await prisma.campanhaEnvio.findMany({
        where: {
          ativacaoId: regra.id,
          proprietarioId: { in: novos.map((c) => c.proprietarioId) },
          createdAt: { gte: limite },
        },
        select: { proprietarioId: true },
      });
      const bloqueados = new Set(recentes.map((r) => r.proprietarioId));
      const alvos = novos.filter((c) => {
        if (bloqueados.has(c.proprietarioId)) {
          base.emCooldown += 1;
          return false;
        }
        return true;
      });

      if (simular) {
        resultados.push({ ...base, enviados: alvos.length });
        continue;
      }

      const somentePortal = regra.canal === "SO_PORTAL";

      await emLotes(alvos, LOTE, async (alvo) => {
        // Uma linha por envio, na mesma tabela das campanhas: para o cliente é
        // a mesma caixa de avisos, e para o relatório é o mesmo tipo de fato.
        const envio = await prisma.campanhaEnvio.create({
          data: {
            ativacaoId: regra.id,
            proprietarioId: alvo.proprietarioId,
            pushStatus: somentePortal ? "SO_PORTAL" : "PENDENTE",
          },
          select: { id: true },
        });
        base.enviados += 1;

        if (somentePortal) return;

        try {
          const r = await enviarPushProprietario(alvo.proprietarioId, {
            titulo: regra.titulo,
            mensagem: regra.mensagem,
            url: `/portal-cliente?aviso=${envio.id}`,
            // `tag` por regra: se a mesma ativação alcançar o cliente de novo,
            // substitui no celular em vez de empilhar duas iguais.
            tag: `ativacao-${regra.id}`,
          });
          base.aparelhos += r.enviados;
          await prisma.campanhaEnvio.update({
            where: { id: envio.id },
            data: {
              aparelhos: r.enviados,
              pushStatus:
                r.enviados > 0 ? "ENVIADO" : r.falhas.length > 0 ? "FALHA" : "SEM_APARELHO",
              erro: r.falhas[0] ?? null,
            },
          });
        } catch (err) {
          await prisma.campanhaEnvio.update({
            where: { id: envio.id },
            data: {
              pushStatus: "FALHA",
              erro: err instanceof Error ? err.message : String(err),
            },
          });
        }
      });

      await prisma.ativacao.update({
        where: { id: regra.id },
        data: {
          ultimaAvaliacaoEm: new Date(),
          totalDisparos: { increment: base.enviados },
        },
      });

      resultados.push(base);
    } catch (err) {
      resultados.push({
        ...base,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return resultados;
}

/**
 * Liga ou desliga uma regra.
 *
 * 🔑 Ligar carimba `ativadaEm` com AGORA, e é esse carimbo que faz a regra
 * ignorar tudo que já estava acontecendo. Sem ele, acender "avisar quando a
 * usina ficar muda" mandaria aviso de uma vez para toda usina muda da base —
 * inclusive as que estão assim há meses e cujo dono já foi avisado por telefone.
 */
export async function ligarAtivacao(id: string, ativa: boolean) {
  return prisma.ativacao.update({
    where: { id },
    data: { ativa, ...(ativa ? { ativadaEm: new Date() } : {}) },
  });
}
