import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { crmConfigurado } from "@/lib/crm-supabase";
import { sincronizarCrm } from "@/lib/crm-sync";
import { HORARIOS_BRT, slotDevido } from "@/lib/crm-sync-scheduler";

/**
 * Disparo manual do sync, pra quando não se quer esperar o próximo horário.
 * O caminho normal é o agendador de `src/lib/crm-sync-scheduler.ts`, que roda
 * sozinho às 13h e às 19h (BRT).
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

/**
 * Estado do agendamento, para a tela dizer quando foi a última rodada
 * automática. Sem isto o operador clica no botão "por via das dúvidas".
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const marcas = await prisma.appSetting.findMany({
    where: { key: { in: ["crm.sync.ultimoSlot", "crm.sync.tentativaEm"] } },
  });
  const ultimoSlot = marcas.find((m) => m.key === "crm.sync.ultimoSlot") ?? null;

  return NextResponse.json({
    horarios: HORARIOS_BRT,
    /** Horário agendado que já foi concluído, ex.: "2026-08-22T13". */
    ultimoSlot: ultimoSlot?.value ?? null,
    /** Quando essa rodada terminou (UTC; a tela converte). */
    ultimoSlotEm: ultimoSlot?.updatedAt ?? null,
    /** Horário devido agora — se for diferente do último, ainda não rodou. */
    slotDevido: slotDevido(),
    configurado: crmConfigurado(),
  });
}
