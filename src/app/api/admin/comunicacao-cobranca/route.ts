/**
 * Diagnóstico e teste dos canais de aviso de cobrança.
 *
 * GET  → estado da configuração (modo, email, WhatsApp), sem enviar nada.
 * POST → manda UMA mensagem de teste para o destino informado no corpo.
 *
 * 🔑 **Por que isto é uma rota e não só um script.** O script
 * `scripts/testar-envio.ts` roda na máquina do operador, e em 06/09/2026
 * descobrimos que aquela máquina tem o Avast interceptando SMTP: o Node recebe
 * um certificado emitido por "Avast Web/Mail Shield Untrusted Root" e a conexão
 * morre antes de chegar ao Google. O teste precisava rodar de dentro do
 * ambiente que de fato envia — o contêiner — e é isto aqui.
 *
 * ⚠️ **O POST ENVIA DE VERDADE** e não respeita `NOTIFICACAO_COBRANCA_MODO`.
 * É um gesto manual de admin, com destino digitado à mão na tela. Sem destino
 * no corpo, recusa.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import {
  emailConfigurado,
  enviarEmail,
  provedorEmail,
  remetentePadrao,
  verificarConexaoEmail,
} from "@/lib/email-transport";
import {
  enviarTextoWhatsapp,
  statusInstancia,
  uazapiConfigurado,
} from "@/lib/whatsapp-uazapi";
import {
  formatarTelefone,
  normalizarTelefoneBR,
  travaContatoAtiva,
} from "@/lib/uc-trava-contato";
import { modoNotificacao } from "@/lib/notificar-cobranca";
import { emailSuporte, nomeRemetente } from "@/lib/identidade-remetente";

function autorizado(role: string | undefined): boolean {
  return canAccessSection(role ?? "", "persComunicacaoCobranca");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfgEmail = emailConfigurado();
  const cfgZap = uazapiConfigurado();

  // O `verify()` do SMTP faz handshake e LOGIN de verdade — é o que separa
  // "a variável está preenchida" de "a credencial funciona".
  const loginEmail = cfgEmail.ok
    ? await verificarConexaoEmail()
    : { ok: false, detalhe: cfgEmail.motivo ?? "não configurado" };

  let zap: { ok: boolean; detalhe: string; numero?: string } = {
    ok: false,
    detalhe: cfgZap.motivo ?? "não configurado",
  };
  if (cfgZap.ok) {
    try {
      const st = await statusInstancia();
      zap = {
        ok: st.conectado,
        detalhe: st.conectado
          ? `instância pareada (status "${st.statusBruto}")`
          : `instância NÃO conectada (status "${st.statusBruto}") — a mensagem não sai`,
        numero: st.numero,
      };
    } catch (err) {
      zap = { ok: false, detalhe: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({
    modo: modoNotificacao(),
    travaContato: travaContatoAtiva(),
    identidade: { nome: nomeRemetente(), suporte: emailSuporte() },
    email: {
      configurado: cfgEmail.ok,
      provedor: provedorEmail(),
      remetente: remetentePadrao(),
      ok: loginEmail.ok,
      detalhe: loginEmail.detalhe,
    },
    whatsapp: { configurado: cfgZap.ok, ...zap },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    fone?: string;
  };
  const email = body.email?.trim();
  const fone = body.fone?.trim();
  if (!email && !fone) {
    return NextResponse.json(
      { error: "Informe um email e/ou um telefone de destino." },
      { status: 400 },
    );
  }

  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const resultado: Record<string, unknown> = {};

  if (email) {
    try {
      const r = await enviarEmail({
        to: email,
        subject: `Teste de envio — ${nomeRemetente()}`,
        html:
          `<p>Este é um <strong>teste de configuração</strong> do envio de email do sistema de cobrança.</p>` +
          `<p>Se você está lendo isto, o SMTP está funcionando.</p>` +
          `<p style="color:#6b7280;font-size:12px">Disparado em ${quando} por ${session.user.name ?? session.user.email ?? "admin"}.</p>`,
        text:
          `Teste de configuração do envio de email do sistema de cobrança.\n` +
          `Se você está lendo isto, o SMTP está funcionando.\n\nDisparado em ${quando}.`,
      });
      resultado.email = { ok: true, destino: r.destinatarios.join("; "), id: r.id };
    } catch (err) {
      resultado.email = {
        ok: false,
        destino: email,
        erro: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (fone) {
    // MESMA normalização da cobrança: um número recusado aqui seria recusado lá.
    const n = normalizarTelefoneBR(fone);
    if (!n.e164) {
      resultado.whatsapp = {
        ok: false,
        destino: fone,
        erro: `número recusado: ${n.motivo}`,
      };
    } else {
      try {
        const r = await enviarTextoWhatsapp(
          n.e164,
          `Teste de configuração do WhatsApp do sistema de cobrança.\n\n` +
            `Se você recebeu esta mensagem, a integração está funcionando.\n\n` +
            `Disparado em ${quando}.\n\n${nomeRemetente()}`,
        );
        resultado.whatsapp = { ok: true, destino: formatarTelefone(n.e164), id: r.id };
      } catch (err) {
        resultado.whatsapp = {
          ok: false,
          destino: formatarTelefone(n.e164),
          erro: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  return NextResponse.json(resultado);
}
