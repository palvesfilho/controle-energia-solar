/**
 * GET/POST /api/cron/fechamento-investidor
 *
 * Endpoint para ser chamado por agendador externo (Vercel Cron, cron-job.org,
 * GitHub Actions, etc.) todo dia 15 de cada mês.
 *
 * Por padrão fecha o mês CALENDÁRIO atual. Aceita override via query string:
 *   ?ano=2026&mes=4
 *
 * Autenticação: header `Authorization: Bearer <CRON_SECRET>` OU query `?token=<CRON_SECRET>`.
 * Aceita GET porque a maioria dos serviços de cron HTTP só faz GET (ex.: Vercel Cron).
 */
import { NextRequest, NextResponse } from "next/server";
import { generateSettlementsForClosing } from "@/lib/investor-settlements";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Em dev sem CRON_SECRET configurado: bloqueia explicitamente.
    return false;
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("token") === secret) return true;
  return false;
}

async function run(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized — configure CRON_SECRET e envie no header/token" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const now = new Date();
  const ano = Number(url.searchParams.get("ano") ?? now.getFullYear());
  const mes = Number(url.searchParams.get("mes") ?? now.getMonth() + 1);

  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
    return NextResponse.json({ error: `Ano inválido: ${ano}` }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: `Mês inválido: ${mes}` }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const result = await generateSettlementsForClosing(ano, mes);
    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[cron fechamento-investidor] ano=${ano} mes=${mes} processados=${result.results.length} pulados=${result.skippedInvestors.length} em ${elapsedMs}ms`,
    );
    return NextResponse.json({ ok: true, elapsedMs, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[cron fechamento-investidor] erro:`, e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
