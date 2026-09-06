/**
 * POST /api/admin/comunicados/publico — quem seria alcançado, e como fica.
 *
 * Faz duas coisas de uma vez porque a tela precisa das duas juntas: o CONTADOR
 * do recorte e a PRÉVIA renderizada.
 *
 * 🔑 **A prévia usa uma pessoa REAL do recorte**, não um cliente fictício. É o
 * que revela o "Olá," sem nome numa empresa, o `{{unidades}}` vazio em quem não
 * tem unidade e o nome todo em maiúsculas berrando no meio da frase — coisas
 * que um exemplo bem-comportado nunca mostraria.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import {
  cidadesDoPublico,
  contarAlcance,
  descreverPublico,
  resolverPublico,
  usinasDoPublico,
  PUBLICOS,
  type FiltroComunicado,
  type PublicoComunicado,
} from "@/lib/comunicados-publico";
import {
  htmlComunicado,
  renderParaDestinatario,
  textoWhatsappComunicado,
  variaveisDoPublico,
  variaveisDesconhecidas,
  TIPOS,
  DESENHOS,
  type TipoComunicado,
  type DesenhoComunicado,
} from "@/lib/comunicados-textos";
import { autorizado } from "../route";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    publico?: PublicoComunicado;
    filtro?: FiltroComunicado;
    assunto?: string;
    corpoEmail?: string;
    corpoWhatsapp?: string;
    tipo?: string;
    desenho?: string;
    destaqueRotulo?: string;
    destaqueValor?: string;
    destaqueNota?: string;
    botaoTexto?: string;
    botaoUrl?: string;
    botaoNota?: string;
  };

  const publico = PUBLICOS.includes(body.publico as PublicoComunicado)
    ? (body.publico as PublicoComunicado)
    : "CLIENTE_DESCONTO";
  const filtro = body.filtro ?? {};

  const lista = await resolverPublico(publico, filtro);

  const resposta: Record<string, unknown> = {
    alcance: contarAlcance(lista),
    resumo: descreverPublico(publico, filtro),
    cidades: await cidadesDoPublico(publico),
    // Só o público dos descontistas recebe crédito de usina; o investidor é
    // dono de uma, então o filtro não faz sentido para ele.
    usinas: publico === "CLIENTE_DESCONTO" ? await usinasDoPublico() : [],
    variaveis: variaveisDoPublico(publico),
    // Os primeiros nomes, para o operador reconhecer que o recorte é o que ele
    // imaginou — antes de mandar para todo mundo.
    amostra: lista.slice(0, 8).map((d) => ({
      nome: d.nome,
      email: d.emails[0] ?? null,
      telefone: d.telefone,
      unidades: d.unidades.length,
    })),
  };

  const alvo = lista[0];
  if (alvo && (body.assunto || body.corpoEmail || body.corpoWhatsapp)) {
    const problemas = [body.assunto, body.corpoEmail, body.corpoWhatsapp]
      .filter((t): t is string => !!t)
      .flatMap((t) => variaveisDesconhecidas(t, publico));

    if (problemas.length > 0) {
      resposta.erroTexto = `Variável que não existe: ${[...new Set(problemas)]
        .map((p) => `{{${p}}}`)
        .join(", ")}`;
    } else {
      const assunto = renderParaDestinatario(body.assunto ?? "", alvo);
      const corpoEmail = renderParaDestinatario(body.corpoEmail ?? "", alvo);
      resposta.previa = {
        para: alvo.nome,
        assunto,
        html: htmlComunicado(
          assunto,
          corpoEmail,
          tipoDaPrevia(body.tipo),
          desenhoDaPrevia(body.desenho),
          {
            // 🔑 Os extras vêm do formulário, não do banco: a prévia tem de
            // mostrar o que está na tela AGORA, inclusive o que ainda não foi
            // salvo. Uma prévia que lê o gravado mostraria a versão anterior.
            destaqueRotulo: body.destaqueRotulo,
            destaqueValor: body.destaqueValor,
            destaqueNota: body.destaqueNota,
            botaoTexto: body.botaoTexto,
            // Link inválido não vai para a prévia: melhor o botão sumir e a
            // pessoa notar, do que ele parecer bom e a rota recusar ao salvar.
            botaoUrl: /^https?:\/\//i.test(String(body.botaoUrl ?? "")) ? body.botaoUrl : null,
            botaoNota: body.botaoNota,
          },
        ),
        whatsapp: body.corpoWhatsapp
          ? textoWhatsappComunicado(renderParaDestinatario(body.corpoWhatsapp, alvo))
          : null,
      };
    }
  }

  return NextResponse.json(resposta);
}

/** Mesma rede da criação: tipo estranho vira INFORMATIVO. */
function tipoDaPrevia(v: unknown): TipoComunicado {
  const t = String(v ?? "").toUpperCase();
  return (TIPOS as readonly string[]).includes(t) ? (t as TipoComunicado) : "INFORMATIVO";
}

/** Mesma rede: desenho estranho vira PADRAO. */
function desenhoDaPrevia(v: unknown): DesenhoComunicado {
  const d = String(v ?? "").toUpperCase();
  return (DESENHOS as readonly string[]).includes(d) ? (d as DesenhoComunicado) : "PADRAO";
}
