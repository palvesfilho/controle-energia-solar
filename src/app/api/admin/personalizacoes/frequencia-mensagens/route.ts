/**
 * GET/PUT /api/admin/personalizacoes/frequencia-mensagens
 *
 * A trava de frequência das campanhas: com que insistência a empresa pode
 * falar com a mesma pessoa. Guardada em `AppSetting`.
 *
 * Protegida por `persFrequenciaMensagens`, que NÃO inclui o pós-venda — quem é
 * limitado pela trava não deveria ser quem a afrouxa.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import {
  APP_SETTING_KEYS,
  APP_SETTING_DEFAULTS,
  getFrequenciaMensagens,
  setNumberSetting,
} from "@/lib/app-settings";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "persFrequenciaMensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const regra = await getFrequenciaMensagens();

  // Quantas pessoas a trava estaria segurando agora. Sem esse número a tela é
  // só três campos abstratos, e ninguém sabe se o valor escolhido é apertado
  // ou frouxo para a base real.
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - regra.periodoDias);
  const [clientesAtivos, agrupado] = await Promise.all([
    prisma.brasilSolarProprietario.count({ where: { active: true } }),
    prisma.campanhaEnvio.groupBy({
      by: ["proprietarioId"],
      where: { createdAt: { gte: inicio } },
      _count: true,
    }),
  ]);
  const noLimite =
    regra.maxPorPeriodo > 0
      ? agrupado.filter((g) => g._count >= regra.maxPorPeriodo).length
      : 0;

  return NextResponse.json({
    ...regra,
    defaults: {
      maxPorPeriodo: APP_SETTING_DEFAULTS[APP_SETTING_KEYS.mensagensMaxPorPeriodo],
      periodoDias: APP_SETTING_DEFAULTS[APP_SETTING_KEYS.mensagensPeriodoDias],
      intervaloMinimoDias:
        APP_SETTING_DEFAULTS[APP_SETTING_KEYS.mensagensIntervaloMinimoDias],
    },
    situacao: {
      clientesAtivos,
      receberamNoPeriodo: agrupado.length,
      noLimite,
    },
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "persFrequenciaMensagens")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const max = Number(body.maxPorPeriodo);
  const periodo = Number(body.periodoDias);
  const intervalo = Number(body.intervaloMinimoDias);

  // 0 é aceito no máximo — é a forma explícita de DESLIGAR a trava. Já o
  // período precisa ser ao menos 1 dia: período 0 tornaria a contagem sempre
  // vazia e desligaria a trava sem ninguém ter pedido.
  if (!Number.isInteger(max) || max < 0 || max > 100) {
    return NextResponse.json(
      { error: "Máximo por período deve ser um inteiro de 0 a 100 (0 desliga a trava)." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(periodo) || periodo < 1 || periodo > 365) {
    return NextResponse.json(
      { error: "Período deve ser um inteiro de 1 a 365 dias." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(intervalo) || intervalo < 0 || intervalo > 365) {
    return NextResponse.json(
      { error: "Intervalo mínimo deve ser um inteiro de 0 a 365 dias." },
      { status: 400 },
    );
  }
  if (intervalo > periodo) {
    return NextResponse.json(
      {
        error:
          "O intervalo mínimo não pode ser maior que o período — a combinação deixaria a trava impossível de satisfazer.",
      },
      { status: 400 },
    );
  }

  await Promise.all([
    setNumberSetting(APP_SETTING_KEYS.mensagensMaxPorPeriodo, max),
    setNumberSetting(APP_SETTING_KEYS.mensagensPeriodoDias, periodo),
    setNumberSetting(APP_SETTING_KEYS.mensagensIntervaloMinimoDias, intervalo),
  ]);

  return NextResponse.json({ ok: true });
}
