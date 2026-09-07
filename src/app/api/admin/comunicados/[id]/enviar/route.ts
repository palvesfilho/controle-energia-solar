/**
 * POST /api/admin/comunicados/[id]/enviar — o disparo.
 *
 * 🔒 **Exige confirmação explícita no corpo** (`confirmar: true`). Um POST sem
 * isso é recusado. Não é cerimônia: esta rota manda mensagem para dezenas de
 * clientes reais, e um clique duplo ou um atalho de teclado não podem ser o
 * bastante para isso acontecer.
 *
 * A idempotência de verdade não está aqui, e sim no índice único de
 * `ComunicadoEnvio` — ver `comunicados-envio.ts`. É ela que torna seguro
 * CHAMAR ESTA ROTA DE NOVO num comunicado que ficou pela metade: quem já
 * recebeu tem linha gravada e é pulado, e só os que faltam são alcançados.
 *
 * 🪤 **Um disparo pode morrer no meio.** Com o WhatsApp espaçado, 75 pessoas
 * levam uns dez minutos, e o limite de execução é de cinco. Quando isso
 * acontece o comunicado fica em `ENVIANDO` — nem rascunho, nem terminado — e
 * sem uma forma de continuar as pessoas que faltam simplesmente não recebem, em
 * silêncio. Por isso `ENVIANDO` é aceito aqui; só `ENVIADO` é recusado.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { dispararComunicado, modoComunicado } from "@/lib/comunicados-envio";
import { emailUtilizavel } from "@/lib/comunicados-publico";
import { autorizado } from "../../route";

// O disparo com WhatsApp espaçado leva minutos; o limite padrão mataria no meio
// — e morrer no meio de um envio em massa é o pior momento possível.
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    confirmar?: boolean;
    testePara?: string;
  };

  const testePara = body.testePara?.trim();
  if (testePara) {
    // 🔑 O teste não pede confirmação digitada: ele vai para o endereço de quem
    // está operando, não para a carteira. Exigir a mesma cerimônia do envio
    // real ensinaria a digitar ENVIAR no automático — e aí a cerimônia do
    // disparo de verdade não protegeria mais nada.
    if (!emailUtilizavel(testePara)) {
      return NextResponse.json(
        { error: "Informe um endereço de email válido para o teste." },
        { status: 400 },
      );
    }
  } else if (body.confirmar !== true) {
    return NextResponse.json({ error: "O disparo precisa de confirmação explícita." }, { status: 400 });
  }

  try {
    const r = await dispararComunicado(id, { testePara });
    console.log(
      `[comunicado] ${id} ${testePara ? `TESTE para ${testePara}` : "disparado"} por ` +
        `${session.user.name ?? session.user.email ?? "admin"} em modo ${modoComunicado()}`,
    );
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no disparo" },
      { status: 400 },
    );
  }
}
