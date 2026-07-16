import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { AsaasError } from "@/lib/asaas";
import {
  buildPagamentoUrl,
  cancelarAcesso,
  criarConviteAcesso,
  type AcessoModalidade,
} from "@/lib/brasil-solar-acesso";
import { getAcessoValoresTabela } from "@/lib/app-settings";

// GET /api/brasil-solar/proprietarios/[id]/convite
// Retorna o estado atual do acesso pago do proprietário (pra badge/UI).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const [acessoRaw, valoresTabela] = await Promise.all([
    prisma.brasilSolarAcesso.findUnique({
      where: { proprietarioId: id },
      select: {
        id: true,
        modalidade: true,
        valor: true,
        status: true,
        checkoutUrl: true,
        conviteToken: true,
        vigenteDesde: true,
        vigenteAte: true,
        conviteEnviadoEm: true,
        pagoEm: true,
        ativadoEm: true,
      },
    }),
    getAcessoValoresTabela(),
  ]);

  // Expõe o link da tela de pagamento BRANDED (derivado do conviteToken) em vez
  // de vazar o token cru. O modal prefere este; cai pro checkoutUrl (Asaas).
  // conviteToken vira undefined → o JSON.stringify da resposta o omite.
  const acesso = acessoRaw
    ? {
        ...acessoRaw,
        conviteToken: undefined,
        pagamentoUrl: acessoRaw.conviteToken
          ? buildPagamentoUrl(acessoRaw.conviteToken)
          : null,
      }
    : null;

  return NextResponse.json({ acesso, valoresTabela });
}

// POST /api/brasil-solar/proprietarios/[id]/convite
// Cria (ou recria, se ainda não ativo) o acesso pago e a cobrança no Asaas.
// Body: { modalidade: "MENSAL" | "ANUAL", valor: number }
// NÃO envia e-mail — retorna o link de checkout para o admin repassar.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const modalidade = body?.modalidade as AcessoModalidade | undefined;
  const valor = Number(body?.valor);

  if (modalidade !== "MENSAL" && modalidade !== "ANUAL") {
    return NextResponse.json(
      { error: "Modalidade inválida (MENSAL ou ANUAL)." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json(
      { error: "Informe um valor maior que zero." },
      { status: 400 },
    );
  }

  try {
    const result = await criarConviteAcesso({
      proprietarioId: id,
      modalidade,
      valor,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    // Erros de regra (sem CPF, já ativo, etc.) e erros do Asaas viram 400/502.
    if (e instanceof AsaasError) {
      console.error("[convite] Asaas falhou:", e.status, e.body);
      return NextResponse.json(
        { error: `Falha ao criar cobrança no Asaas: ${e.message}` },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : "Erro ao criar convite.";
    console.error("[convite] erro:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/brasil-solar/proprietarios/[id]/convite
// Cancela a cobrança/acesso: encerra a assinatura ou apaga a cobrança única no
// Asaas e marca o acesso como CANCELADO. Serve pra pendente e pra ativo.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const result = await cancelarAcesso(id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AsaasError) {
      console.error("[convite] Asaas falhou ao cancelar:", e.status, e.body);
      return NextResponse.json(
        { error: `Falha ao cancelar no Asaas: ${e.message}` },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : "Erro ao cancelar.";
    console.error("[convite] erro ao cancelar:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
