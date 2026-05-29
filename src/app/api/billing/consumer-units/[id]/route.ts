import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/file-storage";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id },
    include: {
      consumerUnit: {
        select: {
          id: true,
          nome: true,
          codigoUc: true,
          cpfCnpj: true,
          distribuidora: true,
          consumer: { select: { id: true, name: true, emailsRecebimento: true } },
        },
      },
    },
  });
  if (!billing) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });
  }
  return NextResponse.json(billing);
}

/**
 * PUT /api/billing/consumer-units/[id]
 *  - Atualiza valores e datas via JSON
 *  - Aceita também multipart/form-data para upload da fatura de energia (campo "file")
 */
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const billing = await prisma.consumerUnitBilling.findUnique({ where: { id } });
  if (!billing) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Arquivo necessário" }, { status: 400 });
    }
    await deleteUploadedFile(billing.faturaUrl);
    const saved = await saveUploadedFile(file, `billing/consumer-units/${id}`);
    const updated = await prisma.consumerUnitBilling.update({
      where: { id },
      data: { faturaUrl: saved.relativePath, faturaAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  const body = await req.json();

  // Campos que afetam o conteúdo do demonstrativo — qualquer mudança desses
  // reseta a validação (operador precisa revalidar antes de "Realizar
  // Cobrança"). Status e preferências de notificação não resetam.
  const camposQueResetamValidacao = [
    "valorFatura",
    "valorCompensado",
    "valorEconomia",
    "valorCobranca",
    "dataVencimento",
    "observacoes",
  ];
  const tocouCampoValidacao = camposQueResetamValidacao.some(
    (k) => body[k] !== undefined,
  );

  const updated = await prisma.consumerUnitBilling.update({
    where: { id },
    data: {
      ...(body.valorFatura !== undefined && {
        valorFatura: body.valorFatura === null || body.valorFatura === "" ? null : Number(body.valorFatura),
      }),
      ...(body.valorCompensado !== undefined && {
        valorCompensado:
          body.valorCompensado === null || body.valorCompensado === "" ? null : Number(body.valorCompensado),
      }),
      ...(body.valorEconomia !== undefined && {
        valorEconomia:
          body.valorEconomia === null || body.valorEconomia === "" ? null : Number(body.valorEconomia),
      }),
      ...(body.valorCobranca !== undefined && {
        valorCobranca:
          body.valorCobranca === null || body.valorCobranca === "" ? null : Number(body.valorCobranca),
      }),
      ...(body.dataVencimento !== undefined && {
        dataVencimento: body.dataVencimento ? new Date(body.dataVencimento) : null,
      }),
      ...(body.observacoes !== undefined && { observacoes: body.observacoes || null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.notificarEmail !== undefined && { notificarEmail: !!body.notificarEmail }),
      ...(body.notificarWhatsapp !== undefined && { notificarWhatsapp: !!body.notificarWhatsapp }),
      // Reset validation se qualquer campo do demonstrativo mudou — mas só
      // antes da cobrança ser emitida; depois fica congelado.
      ...(tocouCampoValidacao && !billing.asaasChargeId && {
        demonstrativoValidadoEm: null,
        demonstrativoValidadoPor: null,
      }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const billing = await prisma.consumerUnitBilling.findUnique({ where: { id } });
  if (billing) await deleteUploadedFile(billing.faturaUrl);
  await prisma.consumerUnitBilling.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
