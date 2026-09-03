import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { importarPlantasGrowatt } from "@/lib/growatt-import";

/**
 * POST /api/brasil-solar/sync-growatt — plantas da conta Growatt OSS →
 * BrasilSolarClient. É o 6º portal do botão "Importar Plantas".
 *
 * A regra toda mora em `@/lib/growatt-import` porque a mesma importação também
 * roda por script (`scripts/importar-plantas-growatt.ts`), sem sessão logada.
 * Aqui fica só a autenticação e o formato da resposta.
 */
// A coleta inicial das usinas NOVAS é sequencial (a Growatt recusa requisição
// idêntica repetida) e leva ~10 chamadas por usina.
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const meses = Number.isFinite(body?.meses) ? Math.max(1, Math.min(12, Number(body.meses))) : 2;

  try {
    const resultado = await importarPlantasGrowatt(meses);
    return NextResponse.json({ message: "Sincronizacao Growatt concluida", ...resultado });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
