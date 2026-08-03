import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { crmConfigurado } from "@/lib/crm-supabase";
import { sincronizarCrm } from "@/lib/crm-sync";

/**
 * Disparo manual do sync, pra quando não se quer esperar o cron da hora cheia.
 * O cron (`railway.cron-crm-sync.json`) continua sendo o caminho normal.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!crmConfigurado()) {
    return NextResponse.json(
      {
        error: "Integração com o CRM não configurada.",
        hint: "Faltam CRM_SUPABASE_URL e CRM_SUPABASE_SERVICE_KEY nas variáveis de ambiente.",
      },
      { status: 503 },
    );
  }

  try {
    const resultado = await sincronizarCrm();
    return NextResponse.json(resultado);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/crm/sync] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
