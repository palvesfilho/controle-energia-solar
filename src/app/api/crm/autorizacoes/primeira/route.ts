import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { crmConfigurado } from "@/lib/crm-supabase";
import { arquivarAviso, estadoPrimeiraAutorizacao } from "@/lib/crm-primeira-autorizacao";

/**
 * O vigia da primeira adesão assinada com Autorização de Acesso.
 * Ver `@/lib/crm-primeira-autorizacao` para o porquê.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!crmConfigurado()) return NextResponse.json({ chegou: false, total: 0, dispensados: 0 });

  try {
    return NextResponse.json(await estadoPrimeiraAutorizacao());
  } catch (err) {
    // CRM fora do ar não pode derrubar a fila: o aviso some, o resto fica.
    console.error("[GET /api/crm/autorizacoes/primeira] erro:", err);
    return NextResponse.json({ chegou: false, total: 0, dispensados: 0 });
  }
}

/**
 * `{ envelopeId }` arquiva o aviso DAQUELE envelope. Por envelope, e não um
 * "já vi" global: arquivar um teste não pode calar o aviso da adesão real.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { envelopeId?: string };
  if (!corpo.envelopeId) {
    return NextResponse.json({ error: "envelopeId é obrigatório" }, { status: 400 });
  }
  await arquivarAviso(corpo.envelopeId);
  return NextResponse.json({ ok: true });
}
