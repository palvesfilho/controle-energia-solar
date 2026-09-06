/**
 * GET/PUT /api/admin/textos-cobranca — a REDAÇÃO da cobrança e os encargos.
 *
 * Irmã de `/api/admin/cadencia-cobranca`: lá se decide QUANDO falar, aqui O
 * QUE dizer e quanto custa atrasar. Mesma trinca de permissão, pelo mesmo
 * motivo — quem escreve isto escreve em nome da empresa para a carteira toda.
 *
 * 🔒 **A validação é a razão de a rota existir.** O texto vai direto para o
 * cliente: variável inventada viraria `{{fulano}}` escrito no email, e um
 * corpo vazio mandaria uma cobrança muda. As duas coisas são recusadas aqui,
 * com a mensagem dizendo qual campo e qual variável.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import {
  ESTAGIOS,
  ESTAGIO_LABEL,
  TEXTOS_PADRAO,
  VARIAVEIS,
  getEncargosCobranca,
  setEncargosCobranca,
  setTextosDeCobranca,
  textosDeCobranca,
  variaveisDesconhecidas,
  type EstagioCobranca,
  type TextoEstagio,
  type TextosCobranca,
} from "@/lib/cobranca-textos";
import {
  assuntoEmailCobranca,
  assuntoLembrete,
  htmlEmailCobranca,
  htmlLembrete,
  textoLembreteWhatsapp,
  textoWhatsappCobranca,
} from "@/lib/cobranca-mensagens";

function autorizado(role: string | undefined): boolean {
  return canAccessSection(role ?? "", "persTextosCobranca");
}

const CAMPOS: { chave: keyof TextoEstagio; rotulo: string }[] = [
  { chave: "assunto", rotulo: "assunto" },
  { chave: "corpoEmail", rotulo: "texto do email" },
  { chave: "corpoWhatsapp", rotulo: "texto do WhatsApp" },
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [textos, encargos] = await Promise.all([textosDeCobranca(), getEncargosCobranca()]);
  return NextResponse.json({
    textos,
    encargos,
    // O padrão viaja junto para o botão "voltar ao padrão" funcionar sem uma
    // segunda chamada — e para a tela poder mostrar o que mudou.
    padrao: TEXTOS_PADRAO,
    variaveis: VARIAVEIS,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    textos?: Partial<Record<EstagioCobranca, Partial<TextoEstagio>>>;
    encargos?: { multaPercentual?: unknown; jurosMensalPercentual?: unknown; atrasoFirmeDias?: unknown };
  };

  const textos = {} as TextosCobranca;
  for (const estagio of ESTAGIOS) {
    const recebido = body.textos?.[estagio] ?? {};
    const destino = {} as TextoEstagio;
    for (const { chave, rotulo } of CAMPOS) {
      const valor = typeof recebido[chave] === "string" ? (recebido[chave] as string).trim() : "";
      if (!valor) {
        return NextResponse.json(
          { error: `O ${rotulo} de "${ESTAGIO_LABEL[estagio]}" está vazio.` },
          { status: 400 },
        );
      }
      const ruins = variaveisDesconhecidas(valor);
      if (ruins.length > 0) {
        return NextResponse.json(
          {
            error:
              `No ${rotulo} de "${ESTAGIO_LABEL[estagio]}" há variável que não existe: ` +
              `${ruins.map((r) => `{{${r}}}`).join(", ")}.`,
          },
          { status: 400 },
        );
      }
      destino[chave] = valor;
    }
    textos[estagio] = destino;
  }

  const multa = numero(body.encargos?.multaPercentual);
  const juros = numero(body.encargos?.jurosMensalPercentual);
  const firme = numero(body.encargos?.atrasoFirmeDias);

  if (multa < 0 || multa > 100 || juros < 0 || juros > 100) {
    return NextResponse.json(
      { error: "Multa e juros devem ficar entre 0 e 100%." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(firme) || firme < 1 || firme > 365) {
    return NextResponse.json(
      { error: "O dia em que o tom endurece deve ser um número inteiro de 1 a 365." },
      { status: 400 },
    );
  }

  await setTextosDeCobranca(textos);
  await setEncargosCobranca({
    multaPercentual: multa,
    jurosMensalPercentual: juros,
    atrasoFirmeDias: firme,
  });

  console.log(
    `[textos-cobranca] alterados por ${session.user.name ?? session.user.email ?? "admin"} ` +
      `— multa ${multa}%, juros ${juros}%/mês, tom firme a partir do dia ${firme}`,
  );

  const [salvos, encargos] = await Promise.all([textosDeCobranca(), getEncargosCobranca()]);
  return NextResponse.json({ textos: salvos, encargos });
}

/**
 * POST — a PRÉVIA, montada pelo mesmo código que envia de verdade.
 *
 * 🔑 Passa por `htmlLembrete`/`htmlEmailCobranca`, não por um render próprio da
 * tela. Uma prévia que usa outro caminho é uma prévia que um dia mente — e a
 * primeira vez que ela mentir será numa cobrança já enviada.
 *
 * Não grava nada: o texto vem do corpo da requisição, ainda não salvo.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    estagio?: EstagioCobranca;
    texto?: Partial<TextoEstagio>;
    encargos?: { multaPercentual?: unknown; jurosMensalPercentual?: unknown; atrasoFirmeDias?: unknown };
  };

  const estagio: EstagioCobranca = ESTAGIOS.includes(body.estagio as EstagioCobranca)
    ? (body.estagio as EstagioCobranca)
    : "FATURA";

  const texto: TextoEstagio = {
    assunto: String(body.texto?.assunto ?? TEXTOS_PADRAO[estagio].assunto),
    corpoEmail: String(body.texto?.corpoEmail ?? TEXTOS_PADRAO[estagio].corpoEmail),
    corpoWhatsapp: String(body.texto?.corpoWhatsapp ?? TEXTOS_PADRAO[estagio].corpoWhatsapp),
  };

  for (const { chave, rotulo } of CAMPOS) {
    const ruins = variaveisDesconhecidas(texto[chave]);
    if (ruins.length > 0) {
      return NextResponse.json(
        { error: `No ${rotulo}: ${ruins.map((r) => `{{${r}}}`).join(", ")} não existe.` },
        { status: 400 },
      );
    }
  }

  const encargos = {
    multaPercentual: numero(body.encargos?.multaPercentual),
    jurosMensalPercentual: numero(body.encargos?.jurosMensalPercentual),
    atrasoFirmeDias: Math.max(1, Math.round(numero(body.encargos?.atrasoFirmeDias)) || 15),
  };

  // Um cliente fictício, com nome de pessoa para a saudação aparecer. O valor e
  // as datas são redondos de propósito: a prévia é sobre o TEXTO.
  const amostra = {
    clienteNome: "Maria Aparecida da Silva",
    // 12 dígitos: é o formato real das UCs da RGE, e é o que faz
    // `formatCodigoUc` pontuar o código na prévia como o cliente vai ler.
    codigoUc: "155200100190",
    mes: 9,
    ano: 2026,
    valor: 487.32,
    vencimento: new Date(2026, 8, 20),
  };

  if (estagio === "FATURA") {
    const d = {
      ...amostra,
      linkPagamento: "https://gestor.solvesm.eng.br/fatura/exemplo",
    };
    return NextResponse.json({
      assunto: assuntoEmailCobranca(d, texto, encargos),
      html: htmlEmailCobranca(d, texto, encargos),
      whatsapp: textoWhatsappCobranca(d, texto, encargos),
    });
  }

  const textos = { ...TEXTOS_PADRAO, [estagio]: texto } as TextosCobranca;
  const d = {
    ...amostra,
    link: "https://gestor.solvesm.eng.br/fatura/exemplo",
    tipo: (estagio === "ANTES" ? "ANTES" : "ATRASO") as "ANTES" | "ATRASO",
    // O estágio firme só aparece se `diasAtraso` alcançar o corte — então a
    // prévia dele usa exatamente o dia configurado.
    diasAtraso: estagio === "ATRASO_FIRME" ? encargos.atrasoFirmeDias : estagio === "ATRASO" ? 1 : 0,
  };
  return NextResponse.json({
    assunto: assuntoLembrete(d, textos, encargos),
    html: htmlLembrete(d, textos, encargos),
    whatsapp: textoLembreteWhatsapp(d, textos, encargos),
  });
}

function numero(v: unknown): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
