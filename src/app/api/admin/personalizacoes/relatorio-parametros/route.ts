/**
 * GET/PUT /api/admin/personalizacoes/relatorio-parametros
 *
 * Lê e escreve os parâmetros do cálculo de payback (model AppSetting):
 * - reajusteTarifaAnual (0 a 1, ex.: 0.07 = 7%/ano)
 * - depreciacaoModuloAnual (0 a 1, ex.: 0.005 = 0,5%/ano)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import {
  APP_SETTING_KEYS,
  APP_SETTING_DEFAULTS,
  getRelatorioParametros,
  setNumberSetting,
} from "@/lib/app-settings";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const params = await getRelatorioParametros();
  return NextResponse.json({
    reajusteTarifaAnual: params.reajusteTarifaAnual,
    depreciacaoModuloAnual: params.depreciacaoModuloAnual,
    defaults: {
      reajusteTarifaAnual: APP_SETTING_DEFAULTS[APP_SETTING_KEYS.reajusteTarifaAnual],
      depreciacaoModuloAnual: APP_SETTING_DEFAULTS[APP_SETTING_KEYS.depreciacaoModuloAnual],
    },
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const reajuste = Number(body.reajusteTarifaAnual);
  const depreciacao = Number(body.depreciacaoModuloAnual);

  if (!Number.isFinite(reajuste) || reajuste < 0 || reajuste > 1) {
    return NextResponse.json(
      { error: "reajusteTarifaAnual deve ser número entre 0 e 1 (ex.: 0.07 = 7%)" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(depreciacao) || depreciacao < 0 || depreciacao > 1) {
    return NextResponse.json(
      { error: "depreciacaoModuloAnual deve ser número entre 0 e 1 (ex.: 0.005 = 0,5%)" },
      { status: 400 },
    );
  }

  await Promise.all([
    setNumberSetting(APP_SETTING_KEYS.reajusteTarifaAnual, reajuste),
    setNumberSetting(APP_SETTING_KEYS.depreciacaoModuloAnual, depreciacao),
  ]);

  return NextResponse.json({
    ok: true,
    reajusteTarifaAnual: reajuste,
    depreciacaoModuloAnual: depreciacao,
  });
}
