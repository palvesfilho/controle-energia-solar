/**
 * Disparo de uma campanha de MENSAGENS.
 *
 * O caminho completo:
 *   1. resolve o público pelo filtro salvo        (`mensagens-publico.ts`)
 *   2. cria UMA linha `CampanhaEnvio` por cliente — é a caixa de avisos dele
 *   3. para quem tem celular inscrito, chama `enviarPushProprietario`
 *   4. congela os contadores na campanha e marca ENVIADA
 *
 * 🔑 A linha de envio nasce para TODO mundo do público, inclusive quem não tem
 * app. O push é o empurrão; a caixa de avisos é o alcance. Sem isso, campanha
 * só chegaria aos ~poucos clientes que autorizaram notificação, e o pós-venda
 * concluiria que a ferramenta não funciona.
 *
 * ⚠️ Isto toca celular de gente de verdade e não tem desfazer. Quem chama já
 * conferiu a prévia e confirmou na tela. Ver [[feedback_nao_disparar_emails]]:
 * a mesma regra do e-mail vale aqui — nada sai sem "go" explícito.
 */
import { prisma } from "@/lib/prisma";
import { enviarPushProprietario } from "@/lib/push-notificacoes";
import {
  descreverFiltro,
  resolverPublico,
  type FiltroPublico,
} from "@/lib/mensagens-publico";

export interface ResultadoCampanha {
  publico: number;
  comApp: number;
  /** Aparelhos ACEITOS pelo serviço de push — não é "visto pelo cliente". */
  aparelhosEnviados: number;
  inscricoesRemovidas: number;
  falhas: number;
}

/**
 * Quantos clientes são processados ao mesmo tempo.
 *
 * Cada push é uma chamada HTTPS ao FCM/Apple. Sem limite, uma base de 300
 * clientes abriria 300 conexões de uma vez e o Node estoura o pool; com 1 por
 * vez, a rota bate o timeout. 6 é o meio-termo que aguenta base pequena sem
 * precisar de fila.
 */
const LOTE = 6;

async function emLotes<T>(itens: T[], tamanho: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < itens.length; i += tamanho) {
    await Promise.all(itens.slice(i, i + tamanho).map(fn));
  }
}

/**
 * Dispara a campanha. Só aceita RASCUNHO — reenviar uma campanha já enviada
 * duplicaria a notificação no celular de quem já recebeu, e o `@@unique`
 * (campanha, proprietário) não deixaria nem gravar o histórico direito.
 */
export async function dispararCampanha(campanhaId: string): Promise<ResultadoCampanha> {
  const campanha = await prisma.campanha.findUnique({ where: { id: campanhaId } });
  if (!campanha) throw new Error("Campanha não encontrada");
  if (campanha.status !== "RASCUNHO") {
    throw new Error(
      `Esta campanha já está ${campanha.status.toLowerCase()} — não é possível disparar de novo.`,
    );
  }

  const filtro = (campanha.publicoFiltro ?? {}) as FiltroPublico;
  const publico = await resolverPublico(filtro);
  if (publico.length === 0) {
    throw new Error("O público está vazio — ajuste o filtro antes de enviar.");
  }

  // ENVIANDO antes de começar: se a rota morrer no meio, a campanha não fica
  // parecendo rascunho intacto e ninguém dispara por cima do que já saiu.
  await prisma.campanha.update({
    where: { id: campanhaId },
    data: { status: "ENVIANDO" },
  });

  const somentePortal = campanha.canal === "SO_PORTAL";
  const resultado: ResultadoCampanha = {
    publico: publico.length,
    comApp: publico.filter((d) => d.aparelhos > 0).length,
    aparelhosEnviados: 0,
    inscricoesRemovidas: 0,
    falhas: 0,
  };

  try {
    // Caixa de avisos primeiro, push depois: o cliente que tocar na notificação
    // no mesmo segundo precisa encontrar o aviso já lá dentro.
    await prisma.campanhaEnvio.createMany({
      data: publico.map((d) => ({
        campanhaId,
        proprietarioId: d.id,
        aparelhos: d.aparelhos,
        pushStatus: somentePortal ? "SO_PORTAL" : d.aparelhos > 0 ? "PENDENTE" : "SEM_APARELHO",
      })),
      skipDuplicates: true,
    });

    if (!somentePortal) {
      const envios = await prisma.campanhaEnvio.findMany({
        where: { campanhaId, pushStatus: "PENDENTE" },
        select: { id: true, proprietarioId: true },
      });

      await emLotes(envios, LOTE, async (envio) => {
        try {
          const r = await enviarPushProprietario(envio.proprietarioId, {
            titulo: campanha.titulo,
            mensagem: campanha.mensagem,
            // `?aviso=` abre a caixa de avisos já naquele item e registra a
            // leitura — é o único sinal de engajamento que o Web Push permite.
            url: `${campanha.urlDestino || "/portal-cliente"}?aviso=${envio.id}`,
            // `tag` por campanha: se a mesma campanha for reenviada ao mesmo
            // aparelho, substitui em vez de empilhar duas iguais.
            tag: `campanha-${campanhaId}`,
          });

          resultado.aparelhosEnviados += r.enviados;
          resultado.inscricoesRemovidas += r.removidos;
          if (r.falhas.length > 0) resultado.falhas += 1;

          await prisma.campanhaEnvio.update({
            where: { id: envio.id },
            data: {
              pushStatus:
                r.enviados > 0 ? "ENVIADO" : r.falhas.length > 0 ? "FALHA" : "SEM_APARELHO",
              erro: r.falhas[0] ?? null,
            },
          });
        } catch (err) {
          resultado.falhas += 1;
          await prisma.campanhaEnvio.update({
            where: { id: envio.id },
            data: {
              pushStatus: "FALHA",
              erro: err instanceof Error ? err.message : String(err),
            },
          });
        }
      });
    }

    await prisma.campanha.update({
      where: { id: campanhaId },
      data: {
        status: "ENVIADA",
        enviadaEm: new Date(),
        totalPublico: resultado.publico,
        totalComApp: resultado.comApp,
        totalAparelhos: resultado.aparelhosEnviados,
        publicoResumo: descreverFiltro(filtro),
      },
    });

    return resultado;
  } catch (err) {
    // FALHOU e não RASCUNHO: parte das notificações pode ter saído, e voltar
    // para rascunho convidaria a um reenvio que duplica no celular de quem já
    // recebeu. As linhas de `CampanhaEnvio` já criadas mostram até onde foi.
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: { status: "FALHOU" },
    });
    throw err;
  }
}

/**
 * Envio de PROVA para um cliente só, sem gravar campanha nem caixa de avisos.
 * É como o operador vê o texto no aparelho antes de mandar para a base inteira
 * — e, na prática, é o que impede um erro de português alcançar 200 pessoas.
 */
export async function enviarProva(
  proprietarioId: string,
  titulo: string,
  mensagem: string,
): Promise<{ enviados: number; removidos: number; falhas: string[] }> {
  return enviarPushProprietario(proprietarioId, {
    titulo,
    mensagem,
    tag: "campanha-prova",
  });
}
