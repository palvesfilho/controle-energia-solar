/**
 * POST /api/consumer-units/[id]/bills/backfill
 *
 * Dispara o download das faturas de meses ANTERIORES de UMA unidade consumidora,
 * pelo serviço de robôs. É o que o botão "Sincronizar faturas antigas" chama.
 *
 * Esta rota é a PONTE: o navegador nunca fala com o robô. Ela valida a sessão,
 * busca a credencial do portal no nosso banco, decifra a senha e repassa ao robô
 * junto com os códigos daquela UC. Assim a ROBO_API_KEY nunca chega ao navegador e
 * a senha do cliente não fica guardada no serviço do robô.
 *
 * Responde na hora com o `jobId` — o download roda em segundo plano e leva de
 * minutos a horas (a CPFL põe fila de acesso). Quem acompanha é o GET .../status,
 * que também é quem IMPORTA os PDFs quando o job termina.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { decrypt } from "@/lib/crypto";
import { baixarFaturasDaUc, RoboIndisponivelError } from "@/lib/robo-faturas";

export const runtime = "nodejs";

/**
 * Quantas faturas por UC buscar quando o pedido não diz. A tela sempre manda
 * `meses` (calculado do mês de início que o operador escolheu); este padrão só
 * vale para uma chamada direta à API.
 */
const MESES_PADRAO = 12;
/**
 * Teto por chamada. O robô varre a tabela do portal fatura a fatura, então um
 * pedido muito fundo vira uma sessão longuíssima — e o portal derruba sessão
 * parada. 60 meses (5 anos) cobre qualquer histórico real de contrato.
 */
const MESES_MAX = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Quantos meses buscar, contados de trás para frente a partir do mês atual —
  // é o mês de início que o operador escolheu na tela, já convertido.
  const corpo = await req.json().catch(() => ({}));
  const pedido = Number(corpo?.meses);
  const meses = Number.isFinite(pedido) && pedido > 0
    ? Math.min(Math.floor(pedido), MESES_MAX)
    : MESES_PADRAO;

  const unit = await prisma.consumerUnit.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      codigoUcAntigo: true,
      cpflCredential: {
        select: { emailCpfl: true, senhaCpfl: true, instalacao: true, active: true },
      },
    },
  });

  if (!unit) {
    return NextResponse.json(
      { error: "Unidade consumidora não encontrada." },
      { status: 404 },
    );
  }

  const cred = unit.cpflCredential;
  if (!cred || !cred.active) {
    return NextResponse.json(
      { error: "Esta UC não tem credencial do portal cadastrada (ou está inativa)." },
      { status: 400 },
    );
  }

  let senha: string;
  try {
    senha = decrypt(cred.senhaCpfl);
  } catch {
    // Credencial ilegível é problema de configuração, não do robô: dizer isso
    // evita uma caçada ao fantasma do lado do serviço Python.
    return NextResponse.json(
      { error: "Não consegui decifrar a senha do portal desta UC. Recadastre-a." },
      { status: 500 },
    );
  }

  try {
    const { jobId } = await baixarFaturasDaUc({
      credencial: { nome: unit.nome, email: cred.emailCpfl, senha },
      // Os três identificadores: o portal pode listar a UC por qualquer um deles
      // (a RGE trocou os códigos em jul/2026). O robô entra só no que casar.
      codigosUc: [unit.codigoUc, unit.codigoUcAntigo, cred.instalacao].filter(
        (c): c is string => !!c,
      ),
      // O robô conta as faturas MAIS RECENTES da UC, então "N meses atrás" vira
      // "as N primeiras da tabela". Faturas já baixadas contam para o limite mas
      // não são rebaixadas — é isso que faz repetir o botão sair barato.
      limiteFaturas: meses,
    });

    return NextResponse.json({
      jobId,
      consumerUnitId: unit.id,
      meses,
    });
  } catch (err) {
    if (err instanceof RoboIndisponivelError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[backfill] falha ao disparar o robô:", err);
    return NextResponse.json(
      { error: "Falha ao disparar o robô de faturas." },
      { status: 500 },
    );
  }
}
