import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { computeAnaliseCreditos } from "@/lib/analise-creditos";
import {
  gerarFingerprint,
  syncAcoesComPersistidas,
} from "@/lib/acoes-persistencia";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "gestaoCreditos")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const plantId = searchParams.get("plantId") ?? undefined;
  const investorId = searchParams.get("investorId") ?? undefined;
  const mesRaw = searchParams.get("mes");
  const anoRaw = searchParams.get("ano");
  const mes = mesRaw ? Number(mesRaw) : undefined;
  const ano = anoRaw ? Number(anoRaw) : undefined;
  // Persistência só vale pra portfólio inteiro — ações filtradas por
  // usina/investidor não devem alterar status global. Quando há filtro
  // ativo, retornamos só o compute on-the-fly.
  const semFiltroEscopo = !plantId && !investorId;
  if (
    (mes !== undefined && (!Number.isInteger(mes) || mes < 1 || mes > 12)) ||
    (ano !== undefined && (!Number.isInteger(ano) || ano < 2000 || ano > 2100))
  ) {
    return NextResponse.json(
      { error: "mes/ano inválidos" },
      { status: 400 },
    );
  }

  try {
    const payload = await computeAnaliseCreditos({
      plantId,
      investorId,
      mes,
      ano,
    });

    if (semFiltroEscopo) {
      const acoesComFp = payload.acoes.map((a) => ({
        ...a,
        fingerprint: gerarFingerprint(a, payload.filtros.mes, payload.filtros.ano),
      }));
      const persistidas = await syncAcoesComPersistidas(
        acoesComFp,
        payload.filtros.mes,
        payload.filtros.ano,
      );
      return NextResponse.json({ ...payload, acoes: persistidas });
    }

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/gestao-creditos/analise]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
