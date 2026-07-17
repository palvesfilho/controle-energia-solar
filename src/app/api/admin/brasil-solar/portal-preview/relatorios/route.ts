import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { listarRelatoriosProprietario } from "@/lib/brasil-solar-relatorio";

export const runtime = "nodejs";

/**
 * GET /api/admin/brasil-solar/portal-preview/relatorios?proprietarioId=
 *
 * Versão admin (pós-venda) da listagem de relatórios do portal. Espelha
 * `/api/portal-cliente/relatorios`, mas resolve o proprietário por `id` na
 * query em vez do `clerkUserId` do logado — é a "Visão do cliente", só leitura.
 * Protegida pela section `brasilSolar` (ADMIN/GESTOR/FINANCEIRO/POS_VENDA).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const proprietarioId = new URL(req.url).searchParams.get("proprietarioId");
  if (!proprietarioId) {
    return NextResponse.json({ error: "proprietarioId obrigatório" }, { status: 400 });
  }

  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    select: { id: true, nome: true, acesso: { select: { status: true } } },
  });
  if (!prop) {
    return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
  }

  const result = await listarRelatoriosProprietario(prop.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const modo = result.temBeneficiarias ? "AGREGADO" : "POR_UC";

  // Meses do relatório consolidado = união dos meses das beneficiárias
  // (mais recente primeiro), igual ao endpoint do cliente.
  let mesesAgregado: { ano: number; mes: number }[] = [];
  if (modo === "AGREGADO") {
    const seen = new Set<string>();
    const uniao: { ano: number; mes: number }[] = [];
    for (const uc of result.ucs) {
      if (uc.papel !== "BENEFICIARIA") continue;
      for (const m of uc.meses) {
        const key = `${m.ano}-${m.mes}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniao.push(m);
      }
    }
    uniao.sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes));
    mesesAgregado = uniao;
  }

  return NextResponse.json({
    proprietario: { nome: prop.nome },
    acessoAtivo: prop.acesso?.status === "ATIVO",
    modo,
    mesesAgregado,
    ucs: result.ucs.map((uc) => ({
      ucId: uc.ucId,
      codigoUc: uc.codigoUc,
      nome: uc.nome,
      distribuidora: uc.distribuidora,
      papel: uc.papel,
      percentual: uc.percentual,
      ultimaFatura: uc.ultimaFatura,
      meses: uc.meses,
    })),
  });
}
