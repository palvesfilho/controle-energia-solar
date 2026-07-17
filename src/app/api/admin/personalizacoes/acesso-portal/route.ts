/**
 * GET/PUT /api/admin/personalizacoes/acesso-portal
 *
 * Lê e escreve os valores de tabela do acesso pago ao portal do cliente
 * Brasil Solar (model AppSetting):
 * - valorMensalTabela (R$ >= 0) — cobrado na modalidade MENSAL / piso do personalizado mensal
 * - valorAnualTabela  (R$ >= 0) — cobrado na modalidade ANUAL / piso do personalizado anual
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import {
  APP_SETTING_KEYS,
  getAcessoValoresTabela,
  setNumberSetting,
} from "@/lib/app-settings";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const valores = await getAcessoValoresTabela();
  return NextResponse.json(valores);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mensal = Number(body.mensal);
  const anual = Number(body.anual);

  if (!Number.isFinite(mensal) || mensal < 0) {
    return NextResponse.json(
      { error: "Valor mensal deve ser um número maior ou igual a zero." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(anual) || anual < 0) {
    return NextResponse.json(
      { error: "Valor anual deve ser um número maior ou igual a zero." },
      { status: 400 },
    );
  }

  await Promise.all([
    setNumberSetting(APP_SETTING_KEYS.acessoValorMensalTabela, mensal),
    setNumberSetting(APP_SETTING_KEYS.acessoValorAnualTabela, anual),
  ]);

  return NextResponse.json({ ok: true, mensal, anual });
}
