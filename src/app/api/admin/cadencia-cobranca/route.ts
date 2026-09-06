/**
 * GET/PUT /api/admin/cadencia-cobranca — a régua de lembretes de cobrança.
 *
 * Quem pode mexer é o `FULL_ADMIN_TRIO` (seção `persCadenciaCobrancas`): mudar
 * a cadência decide quando o celular de todo cliente com fatura em aberto toca.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import {
  descreverCadencia,
  getCadenciaCobranca,
  setCadenciaCobranca,
  type CadenciaCobranca,
} from "@/lib/app-settings";
import { modoNotificacao } from "@/lib/notificar-cobranca";

function autorizado(role: string | undefined): boolean {
  return canAccessSection(role ?? "", "persCadenciaCobrancas");
}

/** Aceita "3", "1,5,10", "1, 5 , 10". Descarta o que não for dia plausível. */
function parseDias(v: unknown): number[] {
  const bruto = typeof v === "string" ? v : Array.isArray(v) ? v.join(",") : "";
  const dias = bruto
    .split(",")
    .map((p) => Number(String(p).trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 365);
  return [...new Set(dias)].sort((a, b) => a - b);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cadencia = await getCadenciaCobranca();
  return NextResponse.json({
    ...cadencia,
    descricao: descreverCadencia(cadencia),
    // A tela precisa disto para não prometer envio que não vai acontecer: com
    // o disparo em `simulacao`, a cadência mais bem configurada do mundo não
    // manda nada.
    modoNotificacao: modoNotificacao(),
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const cadencia: CadenciaCobranca = {
    ativos: body.ativos === true,
    antesDias: parseDias(body.antesDias),
    atrasoDias: parseDias(body.atrasoDias),
    canais: {
      email: (body.canais as { email?: boolean })?.email !== false,
      whatsapp: (body.canais as { whatsapp?: boolean })?.whatsapp !== false,
    },
  };

  // Ligado sem dia nenhum ou sem canal nenhum é uma configuração que não faz
  // nada e PARECE que faz. Recusar aqui é melhor do que descobrir semanas
  // depois que nenhum cliente foi lembrado.
  if (cadencia.ativos) {
    if (cadencia.antesDias.length === 0 && cadencia.atrasoDias.length === 0) {
      return NextResponse.json(
        { error: "Informe ao menos um dia — antes do vencimento ou de atraso." },
        { status: 400 },
      );
    }
    if (!cadencia.canais.email && !cadencia.canais.whatsapp) {
      return NextResponse.json(
        { error: "Escolha ao menos um canal (email ou WhatsApp)." },
        { status: 400 },
      );
    }
  }

  await setCadenciaCobranca(cadencia);
  console.log(
    `[cadencia-cobranca] alterada por ${session.user.name ?? session.user.email ?? "admin"}: ${descreverCadencia(cadencia)}`,
  );
  return NextResponse.json({ ...cadencia, descricao: descreverCadencia(cadencia) });
}
