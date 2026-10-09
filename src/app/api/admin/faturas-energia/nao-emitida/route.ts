import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

/**
 * POST   /api/admin/faturas-energia/nao-emitida → marca "a concessionária não emitiu"
 * DELETE                                        → desfaz
 *
 * Corpo: { ucId, ano, mes, motivo? } — `ucId` é o da linha da Visão Geral:
 * "uc:<id>" para UC de cliente, "plant:<id>" para usina.
 *
 * Recusa marcar mês que TEM fatura: a marcação diz "não existe fatura", e com
 * a fatura no banco ela seria mentira gravada.
 */
function lerAlvo(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const ucId = typeof b.ucId === "string" ? b.ucId : "";
  const ano = Number(b.ano);
  const mes = Number(b.mes);
  const [tipo, id] = ucId.split(":");
  if ((tipo !== "uc" && tipo !== "plant") || !id) return null;
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return null;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  const motivo = typeof b.motivo === "string" ? b.motivo.trim().slice(0, 500) : "";
  return {
    chave: tipo === "uc" ? { consumerUnitId: id } : { plantId: id },
    tipo,
    id,
    ano,
    mes,
    motivo: motivo || null,
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const alvo = lerAlvo(await req.json().catch(() => null));
  if (!alvo) {
    return NextResponse.json({ error: "UC, ano ou mês inválido" }, { status: 400 });
  }

  const existe =
    alvo.tipo === "uc"
      ? await prisma.consumerUnit.findUnique({ where: { id: alvo.id }, select: { id: true } })
      : await prisma.plant.findUnique({ where: { id: alvo.id }, select: { id: true } });
  if (!existe) {
    return NextResponse.json({ error: "UC não encontrada" }, { status: 404 });
  }

  const fatura = await prisma.consumerBill.findFirst({
    where: { ...alvo.chave, anoReferencia: alvo.ano, mesReferencia: alvo.mes },
    select: { id: true },
  });
  if (fatura) {
    return NextResponse.json(
      { error: "Este mês já tem fatura registrada — não dá para marcar como não emitida." },
      { status: 400 },
    );
  }

  const quem =
    session.user.name?.trim() || session.user.email?.trim() || "Operador";

  const anterior = await prisma.faturaNaoEmitida.findFirst({
    where: { ...alvo.chave, anoReferencia: alvo.ano, mesReferencia: alvo.mes },
    select: { id: true },
  });
  const marcacao = anterior
    ? await prisma.faturaNaoEmitida.update({
        where: { id: anterior.id },
        data: { motivo: alvo.motivo, marcadoPor: quem },
      })
    : await prisma.faturaNaoEmitida.create({
        data: {
          ...alvo.chave,
          anoReferencia: alvo.ano,
          mesReferencia: alvo.mes,
          motivo: alvo.motivo,
          marcadoPor: quem,
        },
      });

  return NextResponse.json(marcacao);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const alvo = lerAlvo(await req.json().catch(() => null));
  if (!alvo) {
    return NextResponse.json({ error: "UC, ano ou mês inválido" }, { status: 400 });
  }

  const { count } = await prisma.faturaNaoEmitida.deleteMany({
    where: { ...alvo.chave, anoReferencia: alvo.ano, mesReferencia: alvo.mes },
  });

  return NextResponse.json({ removidas: count });
}
