/**
 * Email de resumo mensal da Análise de Créditos.
 *
 * Disparado pelo script `scripts/run-analise-mensal.ts` quando um mês
 * fecha (completude=100%). Skip silencioso se RESEND_API_KEY ausente —
 * o snapshot ainda é gravado, só não notifica.
 *
 * Variáveis de ambiente:
 *   RESEND_API_KEY   — obrigatório pra enviar
 *   RESEND_FROM      — opcional, default: "Análise Créditos <onboarding@resend.dev>"
 *   RESEND_REPLY_TO  — opcional
 *   ANALISE_EMAIL_DESTINATARIOS  — CSV de emails (gestão recebe aqui)
 */
import type { AnaliseCreditosResult } from "@/lib/analise-creditos";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function formatKwh(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh`;
}
function formatBrl(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
function formatPct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(0)}%`;
}
function deltaArrow(deltaPct: number | null, invert = false): string {
  if (deltaPct == null) return "";
  const isUp = deltaPct > 0;
  const goodUp = !invert;
  const goodDir = (isUp && goodUp) || (!isUp && !goodUp);
  const color = Math.abs(deltaPct) < 0.02 ? "#6b7280" : goodDir ? "#059669" : "#dc2626";
  const arrow = isUp ? "▲" : deltaPct < 0 ? "▼" : "•";
  const sign = isUp ? "+" : "";
  return `<span style="color:${color};font-size:12px;">${arrow} ${sign}${(deltaPct * 100).toFixed(0)}%</span>`;
}

export function renderHtmlResumo(payload: AnaliseCreditosResult): string {
  const { cards, totaisPorSeveridade, totaisPorPrazo, saudePorUsina, acoes, filtros } = payload;
  const mesLabel = `${MESES[filtros.mes - 1]}/${filtros.ano}`;
  const acoesCriticas = acoes
    .filter((a) => a.severidade === "critico")
    .slice(0, 5);
  const topUsinasRuins = saudePorUsina
    .filter((s) => s.status === "critico")
    .slice(0, 5);

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Análise de Créditos — ${mesLabel}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:680px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 2px 12px rgba(0,0,0,.05)">
    <div style="height:6px;background:linear-gradient(90deg,#1B5E54 0%,#3BAE99 50%,#EA6E2C 100%);border-radius:3px;margin-bottom:20px"></div>
    <h1 style="font-size:20px;font-weight:700;color:#1B5E54;margin:0 0 4px">
      Análise de Créditos — ${mesLabel}
    </h1>
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px">
      Mês fechado. Resumo do portfólio + ações prioritárias.
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      <tr>
        <td style="width:50%;padding:8px;background:#f9fafb;border-radius:6px;vertical-align:top">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Créditos disponíveis</div>
          <div style="font-size:20px;font-weight:700;color:#111827;margin-top:4px">${formatKwh(cards.creditosDisponiveis.kwh)}</div>
          <div style="font-size:12px;color:#6b7280">≈ ${formatBrl(cards.creditosDisponiveis.reais)}</div>
          <div style="margin-top:4px">${deltaArrow(cards.creditosDisponiveis.trend.deltaPct)}</div>
        </td>
        <td style="width:8px"></td>
        <td style="width:50%;padding:8px;background:#fef3c7;border-radius:6px;vertical-align:top">
          <div style="font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:.5px">A vencer ≤30 dias</div>
          <div style="font-size:20px;font-weight:700;color:#111827;margin-top:4px">${formatKwh(cards.vencendo30d.kwh)}</div>
          <div style="font-size:12px;color:#92400e">≈ ${formatBrl(cards.vencendo30d.reais)}</div>
          <div style="margin-top:4px">${deltaArrow(cards.vencendo30d.trend.deltaPct, true)}</div>
        </td>
      </tr>
      <tr><td style="height:8px"></td></tr>
      <tr>
        <td style="padding:8px;background:#f9fafb;border-radius:6px;vertical-align:top">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Eficiência 90d</div>
          <div style="font-size:20px;font-weight:700;color:#111827;margin-top:4px">${formatPct(cards.eficienciaMedia.pct)}</div>
          <div style="font-size:12px;color:#6b7280">${cards.eficienciaMedia.usinasMonitoradas} usinas monitoradas</div>
        </td>
        <td></td>
        <td style="padding:8px;background:#f9fafb;border-radius:6px;vertical-align:top">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Ações abertas</div>
          <div style="font-size:20px;font-weight:700;color:#111827;margin-top:4px">${acoes.length}</div>
          <div style="font-size:12px;color:#6b7280">
            <span style="color:#dc2626">●</span> ${totaisPorSeveridade.critico} críticas ·
            <span style="color:#d97706">●</span> ${totaisPorSeveridade.atencao} atenção
          </div>
        </td>
      </tr>
    </table>

    ${acoesCriticas.length > 0 ? `
    <h2 style="font-size:14px;font-weight:700;color:#1B5E54;margin:24px 0 10px">Ações críticas (top ${acoesCriticas.length})</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      ${acoesCriticas
        .map(
          (a) => `
        <tr>
          <td style="padding:8px;border-left:3px solid #dc2626;background:#fef2f2;border-radius:4px">
            <div style="font-size:13px;font-weight:600;color:#7f1d1d">${a.titulo}</div>
            <div style="font-size:12px;color:#991b1b;margin-top:2px">${a.descricao}</div>
          </td>
        </tr>
        <tr><td style="height:6px"></td></tr>`,
        )
        .join("")}
    </table>` : ""}

    ${topUsinasRuins.length > 0 ? `
    <h2 style="font-size:14px;font-weight:700;color:#1B5E54;margin:24px 0 10px">Usinas em estado crítico</h2>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:6px 8px;text-align:left">Usina</th>
          <th style="padding:6px 8px;text-align:right">Saldo</th>
          <th style="padding:6px 8px;text-align:right">Vencendo</th>
          <th style="padding:6px 8px;text-align:right">PR</th>
        </tr>
      </thead>
      <tbody>
        ${topUsinasRuins
          .map(
            (s) => `
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:6px 8px;font-weight:600">${s.plantName}</td>
            <td style="padding:6px 8px;text-align:right">${formatKwh(s.saldoKwh)}</td>
            <td style="padding:6px 8px;text-align:right;color:${s.vencendoKwh >= 500 ? "#dc2626" : "#111827"}">${formatKwh(s.vencendoKwh)}</td>
            <td style="padding:6px 8px;text-align:right;color:${s.prPct != null && s.prPct < 0.7 ? "#dc2626" : "#111827"}">${formatPct(s.prPct)}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>` : ""}

    <p style="font-size:12px;color:#6b7280;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">
      Tudo isso no detalhe em <a href="/admin/gestao-creditos/analise" style="color:#1B5E54">/admin/gestao-creditos/analise</a> ·
      Próximos prazos: ${totaisPorPrazo.d30} ações em até 30 dias.
    </p>
  </div>
</body>
</html>`;
}

export async function enviarEmailResumo(args: {
  payload: AnaliseCreditosResult;
  destinatarios: string[];
}): Promise<{ enviado: boolean; motivo?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { enviado: false, motivo: "RESEND_API_KEY ausente" };
  }
  if (args.destinatarios.length === 0) {
    return { enviado: false, motivo: "destinatários vazios" };
  }

  // Import dinâmico pra não puxar `resend` em paths que nunca enviam.
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const from =
    process.env.RESEND_FROM || "Análise Créditos <onboarding@resend.dev>";
  const replyTo = process.env.RESEND_REPLY_TO;
  const mesLabel = `${MESES[args.payload.filtros.mes - 1]}/${args.payload.filtros.ano}`;

  await resend.emails.send({
    from,
    to: args.destinatarios,
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject: `Análise de Créditos — ${mesLabel}`,
    html: renderHtmlResumo(args.payload),
  });
  return { enviado: true };
}
