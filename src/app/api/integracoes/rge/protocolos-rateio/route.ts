/**
 * Integração com o robô de pedidos da RGE/CPFL (`protocolos/` — caminho LOGADO).
 *
 * O robô PUXA o trabalho e DEVOLVE o resultado; o Gestor nunca fica esperando o
 * Selenium. É de propósito: uma varredura leva ~69 s por UC e a CPFL chega a pôr
 * fila de acesso na frente do login. Consulta síncrona dentro do request é
 * exatamente o desenho que derruba a rota quando o portal trava.
 *
 *   GET  → a lista de protocolos a consultar, já com a credencial do portal
 *   POST → o que a RGE respondeu, por protocolo
 *
 * ## Autenticação
 * Header `X-API-Key: $RGE_PROTOCOLOS_API_KEY`. Chave PRÓPRIA, separada da
 * `ROBO_API_KEY` e do `CRON_SECRET`, porque o GET devolve **senha de portal de
 * cliente em texto claro** — mesmo contrato dos robôs de fatura, que recebem a
 * senha na criação do job e não a persistem. Sem a variável configurada a rota
 * responde 503: não existe modo aberto.
 *
 * ⚠️ A senha nunca entra em log aqui, nem em mensagem de erro.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { normalizeConcessionaria } from "@/lib/concessionarias";
import { grafiasDoCodigoUc } from "@/lib/robo-faturas";
import {
  ACEITE_ROBO_RGE,
  SituacaoProtocolo,
  aceiteAutomaticoPermitido,
  normalizarProtocolo,
  periodosDaBusca,
  protocoloConsultavel,
  situacaoDoStatusRge,
} from "@/lib/rge-protocolo";

export const dynamic = "force-dynamic";

function autorizado(
  req: NextRequest,
): { ok: true } | { ok: false; resposta: NextResponse } {
  const chave = process.env.RGE_PROTOCOLOS_API_KEY;
  if (!chave) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { error: "Integração não configurada (defina RGE_PROTOCOLOS_API_KEY)." },
        { status: 503 },
      ),
    };
  }
  if (req.headers.get("x-api-key") !== chave) {
    return {
      ok: false,
      resposta: NextResponse.json({ error: "Não autorizado" }, { status: 401 }),
    };
  }
  return { ok: true };
}

/**
 * GET — o que consultar agora.
 *
 * Alvo: todo rateio PENDENTE_ACEITE com protocolo utilizável. Rateio VIGENTE não
 * entra (já foi aceito) e REJEITADO/SUBSTITUIDO também não — a pergunta "a RGE
 * validou?" só faz sentido enquanto se espera resposta.
 *
 * A rota é de LEITURA PURA: os casos que o Gestor já sabe que não dão (sem
 * credencial, protocolo lixo, usina de outra concessionária) voltam em listas
 * separadas para o robô devolver no POST, em vez de virarem escrita silenciosa
 * aqui.
 */
export async function GET(req: NextRequest) {
  const auth = autorizado(req);
  if (!auth.ok) return auth.resposta;

  const versoes = await prisma.rateioVersion.findMany({
    where: { status: "PENDENTE_ACEITE", protocolo: { not: null } },
    select: {
      id: true,
      protocolo: true,
      criadoEm: true,
      plantId: true,
      plant: {
        select: {
          id: true,
          name: true,
          unidadeConsumidora: true,
          unidadeConsumidoraAntiga: true,
          numeroUsina: true,
          cpfCnpj: true,
          concessionaria: true,
          distribuidora: true,
          cpflCredential: {
            select: {
              emailCpfl: true,
              senhaCpfl: true,
              instalacao: true,
              active: true,
            },
          },
        },
      },
    },
    orderBy: { criadoEm: "asc" },
  });

  const itens: unknown[] = [];
  const invalidos: unknown[] = [];
  const semCredencial: unknown[] = [];
  const foraDaRge: unknown[] = [];

  for (const v of versoes) {
    const base = { versionId: v.id, usina: v.plant.name, protocolo: v.protocolo };

    if (!protocoloConsultavel(v.protocolo)) {
      invalidos.push({
        ...base,
        motivo: "Protocolo não tem cara de nº de pedido da CPFL",
      });
      continue;
    }

    // O robô só sabe falar com o portal da CPFL/RGE. Usina de cooperativa entra
    // na lista de fora — calada seria pior: pareceria "nunca consultado".
    const conc = normalizeConcessionaria(
      v.plant.concessionaria ?? v.plant.distribuidora ?? null,
    );
    if (conc !== "RGE/CPFL") {
      foraDaRge.push({ ...base, motivo: `Concessionária ${conc ?? "não informada"}` });
      continue;
    }

    const cred = v.plant.cpflCredential;
    if (!cred?.active || !cred.emailCpfl || !cred.senhaCpfl) {
      semCredencial.push({ ...base, motivo: "Usina sem login da RGE cadastrado" });
      continue;
    }

    let senha: string;
    try {
      senha = decrypt(cred.senhaCpfl);
    } catch {
      // Sem detalhe do erro de propósito: mensagem de cripto costuma vazar
      // pedaço do valor.
      semCredencial.push({ ...base, motivo: "Não consegui abrir a senha guardada" });
      continue;
    }

    // Todas as grafias conhecidas da UC geradora. O robô casa a UC por igualdade
    // exata de string e usa identidades diferentes conforme a origem (a UC ATIVA
    // vem pontuada da tela; as da lista, corridas).
    const codigos = [
      v.plant.unidadeConsumidora,
      v.plant.unidadeConsumidoraAntiga,
      v.plant.numeroUsina,
      cred.instalacao,
    ].filter((c): c is string => !!c && c.trim().length > 0);
    const ucGrafias = [...new Set(codigos.flatMap(grafiasDoCodigoUc))];

    if (ucGrafias.length === 0) {
      invalidos.push({
        ...base,
        motivo: "Usina sem código de UC para procurar no portal",
      });
      continue;
    }

    itens.push({
      versionId: v.id,
      plantId: v.plantId,
      usina: v.plant.name,
      // O que o robô digita no campo rotulado "Protocolo" é o nº do PEDIDO.
      pedido: normalizarProtocolo(v.protocolo!),
      ucGrafias,
      documentoTitular: (v.plant.cpfCnpj ?? "").replace(/\D/g, "") || null,
      periodos: periodosDaBusca(v.criadoEm),
      credencial: { nome: v.plant.name, email: cred.emailCpfl, senha },
    });
  }

  return NextResponse.json({
    geradoEm: new Date().toISOString(),
    itens,
    invalidos,
    semCredencial,
    foraDaRge,
  });
}

/** Situações que o robô pode declarar sozinho — as que não têm texto a ler. */
const SITUACOES_DO_ROBO = new Set<SituacaoProtocolo>([
  "NAO_ENCONTRADO",
  "SEM_CREDENCIAL",
  "PROTOCOLO_INVALIDO",
  "FORA_DA_RGE",
  "ERRO",
]);

/**
 * POST — o que a RGE respondeu.
 *
 * Body: `{ resultados: [{ versionId, situacao?, statusRge?, erro?, detalhe? }] }`
 *
 * `statusRge` é o texto literal do cartão; quando ele vem, é ELE que decide a
 * situação — o robô transcreve, quem interpreta é o Gestor. Assim um robô
 * desatualizado nunca define regra de negócio. `situacao` só é aceita direto do
 * robô nos casos em que não há texto nenhum a ler.
 *
 * Aceite automático: `VALIDADO` num rateio ainda PENDENTE_ACEITE promove a
 * versão a VIGENTE e marca a anterior como SUBSTITUIDO, na mesma transação,
 * registrando `aceitoPor = "ROBO_RGE"` e gravando a linha de histórico que
 * mostra o que a tela da RGE dizia na hora.
 */
export async function POST(req: NextRequest) {
  const auth = autorizado(req);
  if (!auth.ok) return auth.resposta;

  const body = (await req.json().catch(() => null)) as {
    resultados?: Array<{
      versionId?: string;
      situacao?: string;
      statusRge?: string | null;
      erro?: string | null;
      detalhe?: unknown;
    }>;
  } | null;

  if (!body || !Array.isArray(body.resultados)) {
    return NextResponse.json(
      { error: "Envie { resultados: [{ versionId, ... }] }" },
      { status: 400 },
    );
  }

  const aplicados: Array<{ versionId: string; situacao: string; aceitou: boolean }> =
    [];
  const ignorados: Array<{ versionId: string; motivo: string }> = [];

  for (const r of body.resultados) {
    const versionId = typeof r.versionId === "string" ? r.versionId : "";
    if (!versionId) {
      ignorados.push({ versionId: "", motivo: "sem versionId" });
      continue;
    }

    const version = await prisma.rateioVersion.findUnique({
      where: { id: versionId },
      select: { id: true, plantId: true, status: true, protocolo: true },
    });
    if (!version) {
      ignorados.push({ versionId, motivo: "rateio não encontrado" });
      continue;
    }

    const statusRge = typeof r.statusRge === "string" ? r.statusRge.trim() : "";
    let situacao: SituacaoProtocolo;
    if (statusRge) {
      situacao = situacaoDoStatusRge(statusRge);
    } else if (r.situacao && SITUACOES_DO_ROBO.has(r.situacao as SituacaoProtocolo)) {
      situacao = r.situacao as SituacaoProtocolo;
    } else {
      situacao = r.erro ? "ERRO" : "DESCONHECIDO";
    }

    const agora = new Date();
    // "Trouxe resposta" é diferente de "tentou": ERRO não carimba consultadoEm,
    // senão a tela mostraria o erro de hoje com a data do último acerto.
    const houveResposta = situacao !== "ERRO";

    const aceitar =
      aceiteAutomaticoPermitido(situacao) && version.status === "PENDENTE_ACEITE";

    const erro =
      typeof r.erro === "string" && r.erro.trim() ? r.erro.trim().slice(0, 500) : null;
    const detalhe =
      r.detalhe && typeof r.detalhe === "object"
        ? (r.detalhe as Record<string, unknown>)
        : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.rateioVersion.update({
        where: { id: versionId },
        data: {
          protocoloSituacao: situacao,
          protocoloStatusRge: statusRge || null,
          protocoloTentativaEm: agora,
          ...(houveResposta && { protocoloConsultadoEm: agora }),
          protocoloErro: erro,
        },
      });

      if (aceitar) {
        await tx.rateioVersion.updateMany({
          where: { plantId: version.plantId, status: "VIGENTE" },
          data: { status: "SUBSTITUIDO", substituidoEm: agora },
        });
        await tx.rateioVersion.update({
          where: { id: versionId },
          data: { status: "VIGENTE", aceitoEm: agora, aceitoPor: ACEITE_ROBO_RGE },
        });
      }

      await tx.rateioProtocoloConsulta.create({
        data: {
          versionId,
          protocolo: version.protocolo ?? "",
          situacao,
          statusRge: statusRge || null,
          erro,
          detalhe: detalhe as never,
          aceitouRateio: aceitar,
        },
      });
    });

    if (aceitar) {
      console.log(
        `[rge-protocolos] rateio ${versionId} (usina ${version.plantId}) ACEITO automaticamente — RGE disse "${statusRge}"`,
      );
    }
    aplicados.push({ versionId, situacao, aceitou: aceitar });
  }

  return NextResponse.json({ ok: true, aplicados, ignorados });
}
