import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  getThresholds,
  TIPOS_ALERTA,
  SEVERIDADES,
  type TipoAlerta,
  type Severidade,
  type ThresholdConfig,
} from "@/lib/alertas-usinas";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const thresholds = await getThresholds();
    return NextResponse.json(thresholds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/personalizacoes/alertas-usinas]", err);
    return NextResponse.json(
      {
        error: msg,
        hint:
          "Se mencionar 'alertaThreshold' ou 'Unknown arg', pare o dev server e rode `npx prisma generate`.",
      },
      { status: 500 }
    );
  }
}

type PutBody = Partial<Record<TipoAlerta, Partial<ThresholdConfig>>>;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toSeveridade(v: unknown): Severidade | null {
  if (typeof v !== "string") return null;
  return (SEVERIDADES as string[]).includes(v) ? (v as Severidade) : null;
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    for (const tipo of TIPOS_ALERTA) {
      const patch = body[tipo];
      if (!patch) continue;

      const data = {
        enabled: typeof patch.enabled === "boolean" ? patch.enabled : undefined,
        thresholdCritico: "thresholdCritico" in patch ? toNum(patch.thresholdCritico) : undefined,
        thresholdMedio: "thresholdMedio" in patch ? toNum(patch.thresholdMedio) : undefined,
        thresholdBaixo: "thresholdBaixo" in patch ? toNum(patch.thresholdBaixo) : undefined,
        severidadeDefault:
          "severidadeDefault" in patch ? toSeveridade(patch.severidadeDefault) : undefined,
      };

      await prisma.alertaThreshold.upsert({
        where: { tipo },
        update: data,
        create: {
          tipo,
          enabled: data.enabled ?? true,
          thresholdCritico: data.thresholdCritico ?? null,
          thresholdMedio: data.thresholdMedio ?? null,
          thresholdBaixo: data.thresholdBaixo ?? null,
          severidadeDefault: data.severidadeDefault ?? null,
        },
      });
    }

    const thresholds = await getThresholds();
    return NextResponse.json(thresholds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/admin/personalizacoes/alertas-usinas]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
