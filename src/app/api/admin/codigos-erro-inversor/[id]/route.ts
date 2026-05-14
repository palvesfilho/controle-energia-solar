import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
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

function validar(body: unknown):
  | {
      fabricante: Fabricante;
      codigo: string;
      titulo: string;
      descricao: string | null;
      severidadeSugerida: Severidade | null;
      acoes: AcaoInput[];
    }
  | { error: string } {
  if (!body || typeof body !== "object") return { error: "payload inválido" };
  const b = body as Record<string, unknown>;

  if (typeof b.fabricante !== "string" || !(FABRICANTES as readonly string[]).includes(b.fabricante))
    return { error: "fabricante inválido" };

  if (typeof b.codigo !== "string" || b.codigo.trim().length === 0)
    return { error: "código obrigatório" };
  if (typeof b.titulo !== "string" || b.titulo.trim().length === 0)
    return { error: "título obrigatório" };

  let severidadeSugerida: Severidade | null = null;
  if (b.severidadeSugerida !== null && b.severidadeSugerida !== undefined) {
    if (
      typeof b.severidadeSugerida !== "string" ||
      !(SEVERIDADES as readonly string[]).includes(b.severidadeSugerida)
    ) {
      return { error: "severidadeSugerida inválida" };
    }
    severidadeSugerida = b.severidadeSugerida as Severidade;
  }

  if (!Array.isArray(b.acoes)) return { error: "acoes deve ser um array" };
  const acoes: AcaoInput[] = [];
  for (const raw of b.acoes) {
    if (!raw || typeof raw !== "object") return { error: "ação inválida" };
    const a = raw as Record<string, unknown>;
    if (typeof a.ordem !== "number") return { error: "ordem inválida" };
    if (typeof a.descricao !== "string" || a.descricao.trim().length === 0)
      return { error: "descrição da ação obrigatória" };
    let acaoRequerida: AcaoRequerida | null = null;
    if (a.acaoRequerida !== null && a.acaoRequerida !== undefined) {
      if (
        typeof a.acaoRequerida !== "string" ||
        !(ACOES_REQUERIDAS as readonly string[]).includes(a.acaoRequerida)
      ) {
        return { error: "acaoRequerida da ação inválida" };
      }
      acaoRequerida = a.acaoRequerida as AcaoRequerida;
    }
    acoes.push({
      ordem: a.ordem,
      descricao: a.descricao.trim(),
      acaoRequerida,
    });
  }

  return {
    fabricante: b.fabricante as Fabricante,
    codigo: b.codigo.trim(),
    titulo: b.titulo.trim(),
    descricao: typeof b.descricao === "string" ? b.descricao.trim() : null,
    severidadeSugerida,
    acoes,
  };
}

// GET /api/admin/codigos-erro-inversor/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const codigo = await prisma.inverterErrorCode.findUnique({
    where: { id },
    include: { acoes: { orderBy: { ordem: "asc" } } },
  });
  if (!codigo) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(codigo);
}

// PUT /api/admin/codigos-erro-inversor/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = validar(body);
  if ("error" in result) return NextResponse.json(result, { status: 400 });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.inverterErrorCode.update({
        where: { id },
        data: {
          fabricante: result.fabricante,
          codigo: result.codigo,
          titulo: result.titulo,
          descricao: result.descricao,
          severidadeSugerida: result.severidadeSugerida,
        },
      });
      await tx.inverterErrorAction.deleteMany({ where: { errorCodeId: id } });
      if (result.acoes.length > 0) {
        await tx.inverterErrorAction.createMany({
          data: result.acoes.map((a) => ({
            errorCodeId: id,
            ordem: a.ordem,
            descricao: a.descricao,
            acaoRequerida: a.acaoRequerida,
          })),
        });
      }
      return tx.inverterErrorCode.findUnique({
        where: { id },
        include: { acoes: { orderBy: { ordem: "asc" } } },
      });
    });
    return NextResponse.json(updated);
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

// DELETE /api/admin/codigos-erro-inversor/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await prisma.inverterErrorCode.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
