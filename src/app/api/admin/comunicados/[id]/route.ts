/**
 * GET/PUT/DELETE /api/admin/comunicados/[id] — um comunicado.
 *
 * ⚠️ **Comunicado ENVIADO não se edita nem se apaga.** Ele deixou de ser um
 * rascunho e virou o registro do que dezenas de pessoas receberam; reescrever o
 * texto depois faria o histórico contar uma versão que ninguém leu.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { descreverPublico, type PublicoComunicado } from "@/lib/comunicados-publico";
import { autorizado, canaisDe, tipoDe, validar } from "../route";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const c = await prisma.comunicado.findUnique({
    where: { id },
    include: {
      envios: {
        orderBy: { destinatarioNome: "asc" },
        select: {
          destinatarioNome: true,
          email: true,
          telefone: true,
          emailStatus: true,
          emailErro: true,
          whatsappStatus: true,
          whatsappErro: true,
        },
      },
    },
  });
  if (!c) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(c);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const atual = await prisma.comunicado.findUnique({ where: { id }, select: { status: true } });
  if (!atual) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (atual.status !== "RASCUNHO") {
    return NextResponse.json(
      { error: "Este comunicado já foi disparado e não pode mais ser editado." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const erro = validar(body);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  const publico = body.publico as PublicoComunicado;
  const filtro = (body.publicoFiltro ?? {}) as Record<string, unknown>;

  await prisma.comunicado.update({
    where: { id },
    data: {
      nome: String(body.nome).trim(),
      publico,
      publicoFiltro: filtro as never,
      publicoResumo: descreverPublico(publico, filtro),
      canais: canaisDe(body.canais),
      tipo: tipoDe(body.tipo),
      assunto: String(body.assunto).trim(),
      corpoEmail: String(body.corpoEmail).trim(),
      corpoWhatsapp: String(body.corpoWhatsapp ?? "").trim(),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !autorizado(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const atual = await prisma.comunicado.findUnique({ where: { id }, select: { status: true } });
  if (!atual) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (atual.status !== "RASCUNHO") {
    return NextResponse.json(
      { error: "Comunicado já disparado é o histórico do que foi enviado — não se apaga." },
      { status: 400 },
    );
  }
  await prisma.comunicado.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
