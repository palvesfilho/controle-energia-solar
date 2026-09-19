import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { concessionariaDaUsina } from "@/lib/concessionarias";
import {
  normalizarProtocolo,
  precisaConferenciaManual,
  protocoloConsultavel,
  type SituacaoProtocolo,
} from "@/lib/rge-protocolo";

/**
 * GET /api/rateios/protocolos — todo protocolo de rateio que ainda está EM
 * ABERTO na concessionária, de todas as usinas.
 *
 * ## O que conta como "em aberto"
 *
 * Rateio com `status = PENDENTE_ACEITE` — pedido registrado na concessionária e
 * que ainda não virou o rateio vigente daqui. É EXATAMENTE o mesmo recorte que
 * a rota do robô (`/api/integracoes/rge/protocolos-rateio`) usa para decidir o
 * que ir consultar; reusar o critério em vez de inventar um segundo evita que a
 * tela e o robô passem a discordar sobre o que está pendente.
 *
 * O que NÃO entra: VIGENTE (a concessionária já aplicou e o rateio já vale) e
 * REJEITADO (acabou). Os dois são casos fechados.
 *
 * ## PROTOCOLO aqui é o número do PEDIDO
 *
 * O campo se chama `protocolo`, mas o que o operador copia do portal é o número
 * do PEDIDO — a chave estável. O protocolo que a CPFL mostra é regenerado a
 * cada consulta e não serve para procurar nada depois. O ensaio inteiro está em
 * `src/lib/rge-protocolo.ts`; aqui só se herda a conclusão, e por isso a busca
 * da tela casa por `protocoloDigitos`.
 *
 * Ordem: primeiro o que exige AÇÃO (a RGE concluiu e alguém precisa conferir a
 * fatura e aceitar), depois o mais antigo — é o que está travado há mais tempo.
 */

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

const DIA_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const pendentes = await prisma.rateioVersion.findMany({
    where: {
      status: "PENDENTE_ACEITE",
      // Usina desativada não gera trabalho: o pedido dela não vai ser aceito.
      plant: { active: true },
    },
    select: {
      id: true,
      status: true,
      protocolo: true,
      protocoloSituacao: true,
      protocoloStatusRge: true,
      protocoloConsultadoEm: true,
      protocoloTentativaEm: true,
      protocoloErro: true,
      criadoEm: true,
      enviadoEm: true,
      vigenteAPartirDe: true,
      observacao: true,
      plant: {
        select: {
          id: true,
          name: true,
          location: true,
          unidadeConsumidora: true,
          unidadeConsumidoraAntiga: true,
          cpfCnpj: true,
          concessionaria: true,
          distribuidora: true,
          cpflCredential: { select: { active: true } },
        },
      },
      items: {
        select: {
          percentual: true,
          consumerUnit: {
            select: {
              id: true,
              nome: true,
              codigoUc: true,
              codigoUcAntigo: true,
              cpfCnpj: true,
              cidade: true,
            },
          },
        },
      },
    },
  });

  const agora = Date.now();

  const todos = pendentes.map((r) => {
    const situacao = (r.protocoloSituacao ?? null) as SituacaoProtocolo | null;
    const ucs = [...r.items]
      .sort((a, b) => b.percentual - a.percentual)
      .map((it) => ({
        id: it.consumerUnit.id,
        nome: it.consumerUnit.nome,
        codigoUc: it.consumerUnit.codigoUc,
        codigoUcAntigo: it.consumerUnit.codigoUcAntigo,
        cpfCnpj: it.consumerUnit.cpfCnpj,
        cidade: it.consumerUnit.cidade,
        percentual: it.percentual,
      }));

    return {
      rateioId: r.id,
      status: r.status,
      protocolo: r.protocolo,
      /** Só dígitos — é assim que se digita no portal, e é como a busca casa. */
      protocoloDigitos: r.protocolo ? normalizarProtocolo(r.protocolo) : null,
      /** O número tem cara de pedido consultável? (8-14 dígitos, não repetido.) */
      consultavel: protocoloConsultavel(r.protocolo),
      plantId: r.plant.id,
      plantNome: r.plant.name,
      plantCidade: r.plant.location,
      plantUc: r.plant.unidadeConsumidora,
      plantUcAntiga: r.plant.unidadeConsumidoraAntiga,
      plantCpfCnpj: r.plant.cpfCnpj,
      concessionaria: concessionariaDaUsina(r.plant),
      temCredencialRge: !!r.plant.cpflCredential?.active,
      situacao,
      statusRge: r.protocoloStatusRge,
      consultadoEm: r.protocoloConsultadoEm,
      tentativaEm: r.protocoloTentativaEm,
      erro: r.protocoloErro,
      criadoEm: r.criadoEm,
      enviadoEm: r.enviadoEm,
      vigenteAPartirDe: r.vigenteAPartirDe,
      observacao: r.observacao,
      /**
       * A RGE concluiu o pedido e o aceite automático está DESLIGADO — alguém
       * precisa conferir a fatura e aceitar. Sem este sinal o pedido aprovado
       * fica parado em "pendente" para sempre.
       */
      precisaConferencia: precisaConferenciaManual(situacao, r.status),
      diasEmAberto: Math.max(
        0,
        Math.floor((agora - new Date(r.criadoEm).getTime()) / DIA_MS),
      ),
      totalUcs: ucs.length,
      somaPercentual: ucs.reduce((acc, u) => acc + u.percentual, 0),
      ucs,
    };
  });

  // Quem exige ação primeiro; depois o mais antigo; empate pelo nome da usina.
  todos.sort(
    (a, b) =>
      Number(b.precisaConferencia) - Number(a.precisaConferencia) ||
      b.diasEmAberto - a.diasEmAberto ||
      collator.compare(a.plantNome, b.plantNome),
  );

  // Pendente SEM protocolo não é "protocolo em aberto" — é cadastro pela
  // metade. Vai separado para não sumir no meio da lista nem inflar a conta.
  const protocolos = todos.filter((r) => !!r.protocolo);
  const semProtocolo = todos.filter((r) => !r.protocolo);

  return NextResponse.json({
    geradoEm: new Date().toISOString(),
    protocolos,
    semProtocolo,
    resumo: {
      emAberto: protocolos.length,
      precisamConferencia: protocolos.filter((r) => r.precisaConferencia).length,
      nuncaConsultados: protocolos.filter((r) => !r.situacao).length,
      semCredencial: protocolos.filter((r) => !r.temCredencialRge).length,
      numeroInvalido: protocolos.filter((r) => !r.consultavel).length,
      semProtocolo: semProtocolo.length,
      ucsEnvolvidas: protocolos.reduce((acc, r) => acc + r.totalUcs, 0),
    },
  });
}
