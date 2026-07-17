import { NextResponse } from "next/server";
import { resolvePortalProprietario } from "@/lib/portal-cliente-auth";
import { listarRelatoriosProprietario } from "@/lib/brasil-solar-relatorio";

export const runtime = "nodejs";

/**
 * GET /api/portal-cliente/relatorios
 *
 * Versão client-safe da listagem de relatórios: o proprietário é resolvido
 * pelo `clerkUserId` do usuário logado (NUNCA por id na URL), então o cliente
 * só enxerga os próprios relatórios.
 *
 * Resposta:
 *  - `modo`: "AGREGADO" (tem beneficiárias → 1 relatório consolidado) ou
 *    "POR_UC" (uma entrada por UC, tipicamente só a titular).
 *  - `acessoAtivo`: se o download do PDF está liberado (entrega paga).
 *  - `mesesAgregado`: união dos meses das beneficiárias (só no modo AGREGADO).
 */
export async function GET() {
  const prop = await resolvePortalProprietario();
  if (!prop) {
    return NextResponse.json(
      { error: "Conta não vinculada a um proprietário" },
      { status: 404 },
    );
  }

  const result = await listarRelatoriosProprietario(prop.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const modo = result.temBeneficiarias ? "AGREGADO" : "POR_UC";

  // Meses do relatório consolidado = união dos meses das beneficiárias
  // (mais recente primeiro). O relatório agregado só considera períodos com
  // fatura em alguma beneficiária.
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
    acessoAtivo: prop.acessoAtivo,
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
