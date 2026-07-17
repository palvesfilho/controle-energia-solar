/**
 * POST /api/consumer-units/[id]/bills/backfill/status
 *
 * Callback server-to-server do robô RGE. Quando o backfill ASSÍNCRONO (disparado
 * por ../backfill) termina, o robô faz POST aqui com o resultado final. Esta rota
 * só atualiza o CpflCredential.statusSync (a tela de status já lê esse campo).
 *
 * Os ConsumerBill em si são criados durante o download, via /api/faturas-energia/ingest
 * (um POST por PDF). Aqui é apenas o sinal de "terminou" (SUCCESS/ERROR).
 *
 * Auth: Authorization: Bearer $CRON_SECRET — o robô NÃO tem sessão Clerk, então
 * esta rota precisa estar em isPublicApi (proxy.ts) e validar o Bearer ela mesma.
 *
 * Body: { ok: boolean, instalacoes?, baixados?, enviados?, falhas?, erro? }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    ok?: boolean;
    erro?: string;
  };

  const credential = await prisma.cpflCredential.findUnique({
    where: { consumerUnitId: id },
    select: { id: true },
  });
  if (!credential) {
    return NextResponse.json(
      { error: "Credencial não encontrada para esta unidade" },
      { status: 404 },
    );
  }

  if (body.ok === true) {
    await prisma.cpflCredential.update({
      where: { consumerUnitId: id },
      data: { statusSync: "SUCCESS", ultimaSync: new Date(), erroSync: null },
    });
  } else {
    const msg = String(body.erro || "Robô reportou falha no backfill").slice(0, 500);
    await prisma.cpflCredential.update({
      where: { consumerUnitId: id },
      data: { statusSync: "ERROR", erroSync: msg },
    });
  }

  return NextResponse.json({ received: true });
}
