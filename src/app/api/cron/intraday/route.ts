/**
 * GET/POST /api/cron/intraday
 *
 * Rodada de coleta intradiária de 15 min sobre as 4 plataformas, seguida do
 * recálculo da geração do dia. Mesma lógica de `scripts/collect-intraday-15min.ts`
 * — a rota existe pra quem prefere disparar por HTTP (agendador externo,
 * verificação manual) em vez de um serviço de cron no Railway.
 *
 * Autenticação: `Authorization: Bearer <CRON_SECRET>` OU `?token=<CRON_SECRET>`.
 *
 * Parâmetros:
 *   ?minutos=45          janela pra trás (default 45 = 3 slots)
 *   ?plataformas=SUNGROW,FRONIUS
 *   ?fechamento=1        varre o dia solar inteiro e fecha o total
 *   ?dia=YYYY-MM-DD      só com fechamento=1; default hoje
 *   ?forcar=1            coleta mesmo fora da janela solar
 */
import { NextRequest, NextResponse } from "next/server";
import {
  coletarIntradia,
  PLATAFORMAS_INTRADIA,
  type PlataformaIntradia,
} from "@/lib/intraday-collector";
import { atualizarGeracaoDoDia } from "@/lib/intraday-generation";

// A varredura da frota Fronius leva ~163s; o fechamento do dia, mais.
export const maxDuration = 600;
export const runtime = "nodejs";

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("token") === secret;
}

async function run(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Não autorizado — configure CRON_SECRET" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const fechamento = params.get("fechamento") === "1";
  const plataformas = (params.get("plataformas")?.split(",").map((p) => p.trim().toUpperCase()) ??
    PLATAFORMAS_INTRADIA) as PlataformaIntradia[];

  const agora = (() => {
    if (!fechamento) return undefined;
    const diaParam = params.get("dia");
    const base = diaParam && /^\d{4}-\d{2}-\d{2}$/.test(diaParam)
      ? new Date(`${diaParam}T00:00:00Z`)
      : new Date();
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 23, 0, 0));
  })();

  const coleta = await coletarIntradia({
    plataformas,
    minutos: fechamento ? 15 * 60 : Number(params.get("minutos") ?? 45),
    agora,
    ignorarJanelaSolar: fechamento || params.get("forcar") === "1",
  });

  if (coleta.puladoPorJanelaSolar) {
    return NextResponse.json({ pulado: "fora da janela solar (5h–20h BRT)" });
  }

  const geracao = await atualizarGeracaoDoDia({ plataformas, dia: agora });

  return NextResponse.json({
    janela: { inicio: coleta.janelaInicio, fim: coleta.janelaFim },
    fechamento,
    slotsGravados: coleta.slotsGravados,
    duracaoMs: coleta.duracaoMs,
    plataformas: coleta.plataformas.map((p) => ({
      plataforma: p.plataforma,
      usinas: p.usinas,
      usinasComDado: p.usinasComDado,
      chamadas: p.chamadas,
      slotsGravados: p.slotsGravados,
      duracaoMs: p.duracaoMs,
      // Só os primeiros: uma frota de 1.274 usinas com problema geraria uma
      // resposta grande demais pra ser útil.
      erros: p.erros.slice(0, 10),
      errosTotal: p.erros.length,
    })),
    geracao,
  });
}

export const GET = run;
export const POST = run;
