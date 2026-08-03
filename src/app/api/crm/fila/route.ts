import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";

/**
 * Fila de vendas ganhas vindas do CRM que ainda precisam de cadastro aqui
 * (UC, usina, plano de monitoramento) e as caixas de exceção.
 *
 * ?situacao=PENDENTE|ASSINADA_SEM_VENDA|NAO_CLASSIFICADO|CONCLUIDA|IGNORADA
 * Sem o parâmetro, devolve tudo que exige atenção humana.
 */
const EXIGEM_ATENCAO = ["PENDENTE", "ASSINADA_SEM_VENDA", "NAO_CLASSIFICADO"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const situacao = req.nextUrl.searchParams.get("situacao");

  try {
    const linhas = await prisma.crmVendaImportada.findMany({
      where: situacao
        ? { situacao: situacao.toUpperCase() }
        : { situacao: { in: EXIGEM_ATENCAO } },
      orderBy: [{ situacao: "asc" }, { fechadoEm: "desc" }],
    });
    return NextResponse.json(linhas);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/crm/fila] erro:", err);
    return NextResponse.json(
      {
        error: msg,
        hint: "Se mencionar 'crmVendaImportada' ou 'Unknown arg', rode `npx prisma generate` com o dev server parado.",
      },
      { status: 500 },
    );
  }
}
