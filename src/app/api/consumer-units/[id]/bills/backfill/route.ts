/**
 * POST /api/consumer-units/[id]/bills/backfill
 *
 * Dispara o robô RGE (serviço Python) para baixar faturas de meses ANTERIORES
 * desta UC do portal CPFL/RGE. O mês vigente continua vindo do Infosimples;
 * este é o backfill histórico.
 *
 * Fluxo:
 *   1. lê a CpflCredential da UC e descriptografa a senha;
 *   2. chama o serviço Python (ROBO_RGE_URL) em POST /baixar, passando login +
 *      o filtro `instalacoes` (só a instalação desta UC) + ingest_url apontando
 *      pra ESTA instância do gestor + o CRON_SECRET;
 *   3. o serviço baixa os PDFs e faz POST de volta em /api/faturas-energia/ingest,
 *      que cria os ConsumerBill de forma idempotente (não sobrescreve).
 *
 * Esta rota é acionada pelo usuário (sessão), não é server-to-server.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { decrypt } from "@/lib/crypto";

export const runtime = "nodejs";
// A rota só DISPARA o robô (modo assíncrono) e volta na hora; o download em si
// leva minutos, mas roda no serviço Python e reporta o fim via callback
// (../backfill/status). Por isso não precisamos mais segurar a requisição.
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roboUrl = process.env.ROBO_RGE_URL;
  const roboSecret = process.env.ROBO_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  if (!roboUrl || !roboSecret) {
    return NextResponse.json(
      { error: "Serviço do robô não configurado (defina ROBO_RGE_URL e ROBO_SECRET)" },
      { status: 500 },
    );
  }
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET não configurado (necessário pra ingestão)" },
      { status: 500 },
    );
  }

  const credential = await prisma.cpflCredential.findUnique({
    where: { consumerUnitId: id },
  });
  if (!credential) {
    return NextResponse.json(
      { error: "Credenciais CPFL/RGE não cadastradas para esta unidade" },
      { status: 400 },
    );
  }
  if (!credential.active) {
    return NextResponse.json({ error: "Credenciais desativadas" }, { status: 400 });
  }

  // ingest_url = esta MESMA instância (local no teste, prod em produção).
  const ingestUrl = `${req.nextUrl.origin}/api/faturas-energia/ingest`;

  await prisma.cpflCredential.update({
    where: { consumerUnitId: id },
    data: { statusSync: "PENDING", erroSync: null },
  });

  // Callback: o robô faz POST aqui quando termina (Bearer CRON_SECRET) → seta
  // statusSync SUCCESS/ERROR. Fica PENDING enquanto baixa.
  const statusCallbackUrl = `${req.nextUrl.origin}/api/consumer-units/${id}/bills/backfill/status`;

  try {
    const senha = decrypt(credential.senhaCpfl);

    // Dispara o robô em modo ASSÍNCRONO: status_callback_url faz o /baixar
    // retornar 202 na hora e baixar em background. Assim a rota não segura a
    // conexão por ~9 min (o que estourava e marcava ERROR falso em contas grandes).
    const resp = await fetch(`${roboUrl.replace(/\/$/, "")}/baixar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-robo-secret": roboSecret,
      },
      body: JSON.stringify({
        email: credential.emailCpfl,
        senha,
        ingest_url: ingestUrl,
        cron_secret: cronSecret,
        instalacoes: [credential.instalacao],
        status_callback_url: statusCallbackUrl,
      }),
    });

    const result = await resp.json().catch(() => ({}));

    // Aqui só validamos que o robô ACEITOU o job. O resultado real (SUCCESS/ERROR)
    // chega depois pelo callback.
    if (!resp.ok || result?.ok === false) {
      const msg =
        (result && (result.detail || result.error)) ||
        `Robô retornou HTTP ${resp.status}`;
      await prisma.cpflCredential.update({
        where: { consumerUnitId: id },
        data: { statusSync: "ERROR", erroSync: String(msg).slice(0, 500) },
      });
      return NextResponse.json({ success: false, error: msg }, { status: 502 });
    }

    // Job aceito — segue baixando em background; statusSync continua PENDING até
    // o callback. A tela de status já reflete isso.
    return NextResponse.json({
      success: true,
      status: "iniciado",
      instalacao: credential.instalacao,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao chamar o robô RGE";
    await prisma.cpflCredential.update({
      where: { consumerUnitId: id },
      data: { statusSync: "ERROR", erroSync: msg.slice(0, 500) },
    });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
