import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  ACOES_REQUERIDAS,
  type AcaoRequerida,
  SEVERIDADES,
  type Severidade,
} from "@/lib/alertas-usinas";

const FABRICANTES = ["FRONIUS", "SOLAREDGE", "SUNGROW", "HUAWEI"] as const;
type Fabricante = (typeof FABRICANTES)[number];

interface AcaoInput {
  ordem: number;
  descricao: string;
  acaoRequerida: AcaoRequerida | null;
}

interface CodigoInput {
  fabricante: Fabricante;
  codigo: string;
  titulo: string;
  descricao: string | null;
  severidadeSugerida: Severidade | null;
  acoes: AcaoInput[];
}

function validarFabricante(v: unknown): Fabricante | null {
  return typeof v === "string" && (FABRICANTES as readonly string[]).includes(v)
    ? (v as Fabricante)
    : null;
}

function validarSeveridade(v: unknown): Severidade | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  return (SEVERIDADES as readonly string[]).includes(v)
    ? (v as Severidade)
    : undefined;
}

function validarAcaoRequerida(v: unknown): AcaoRequerida | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  return (ACOES_REQUERIDAS as readonly string[]).includes(v)
    ? (v as AcaoRequerida)
    : undefined;
}

function validarPayload(body: unknown): CodigoInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "payload inválido" };
  const b = body as Record<string, unknown>;

  const fabricante = validarFabricante(b.fabricante);
  if (!fabricante) return { error: "fabricante inválido" };

  if (typeof b.codigo !== "string" || b.codigo.trim().length === 0)
    return { error: "código obrigatório" };
  if (typeof b.titulo !== "string" || b.titulo.trim().length === 0)
    return { error: "título obrigatório" };

  const sev = validarSeveridade(b.severidadeSugerida);
  if (sev === undefined) return { error: "severidadeSugerida inválida" };

  if (!Array.isArray(b.acoes)) return { error: "acoes deve ser um array" };

  const acoes: AcaoInput[] = [];
  for (const raw of b.acoes) {
    if (!raw || typeof raw !== "object") return { error: "ação inválida" };
    const a = raw as Record<string, unknown>;
    if (typeof a.ordem !== "number") return { error: "ordem da ação inválida" };
    if (typeof a.descricao !== "string" || a.descricao.trim().length === 0)
      return { error: "descrição da ação obrigatória" };
    const acao = validarAcaoRequerida(a.acaoRequerida);
    if (acao === undefined) return { error: "acaoRequerida da ação inválida" };
    acoes.push({
      ordem: a.ordem,
      descricao: a.descricao.trim(),
      acaoRequerida: acao,
    });
  }

  return {
    fabricante,
    codigo: b.codigo.trim(),
    titulo: b.titulo.trim(),
    descricao: typeof b.descricao === "string" ? b.descricao.trim() : null,
    severidadeSugerida: sev,
    acoes,
  };
}

// GET /api/admin/codigos-erro-inversor?fabricante=FRONIUS
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "persCodigosErroView")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const fabricanteParam = req.nextUrl.searchParams.get("fabricante");
  const where = fabricanteParam ? { fabricante: fabricanteParam } : undefined;

  const codigos = await prisma.inverterErrorCode.findMany({
    where,
    orderBy: [{ fabricante: "asc" }, { codigo: "asc" }],
    include: {
      acoes: { orderBy: { ordem: "asc" } },
    },
  });

  return NextResponse.json({ codigos });
}

// POST /api/admin/codigos-erro-inversor
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "persCodigosErroEdit")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const result = validarPayload(body);
  if ("error" in result) return NextResponse.json(result, { status: 400 });

  try {
    const created = await prisma.inverterErrorCode.create({
      data: {
        fabricante: result.fabricante,
        codigo: result.codigo,
        titulo: result.titulo,
        descricao: result.descricao,
        severidadeSugerida: result.severidadeSugerida,
        acoes: {
          create: result.acoes.map((a) => ({
            ordem: a.ordem,
            descricao: a.descricao,
            acaoRequerida: a.acaoRequerida,
          })),
        },
      },
      include: { acoes: { orderBy: { ordem: "asc" } } },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Já existe um código com esse fabricante e código." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
