import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole, isFinanceRole, isFullAdmin } from "@/lib/roles";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/file-storage";
import { cascadeUnpaidPayablesToNextMonth } from "@/lib/cascade-unpaid-payables";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

type DocType =
  | "relatorio"
  | "nota_fiscal"
  | "recibo_terra"
  | "recibo_aluguel"
  | "comprovante_pagamento";

const VALID_TYPES: DocType[] = [
  "relatorio",
  "nota_fiscal",
  "recibo_terra",
  "recibo_aluguel",
  "comprovante_pagamento",
];

/**
 * POST /api/billing/plants/[id]/upload
 * Body multipart: file, type
 *
 * type=relatorio | nota_fiscal | recibo_terra | recibo_aluguel  → admin/gestor/financeiro
 * type=comprovante_pagamento → apenas financeiro/admin, e somente após os 3 docs do dono estarem ok
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const type = (form.get("type") as string) as DocType;

  if (!file) return NextResponse.json({ error: "Arquivo necessário" }, { status: 400 });
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Tipo de documento inválido" }, { status: 400 });
  }

  const billing = await prisma.plantBilling.findUnique({ where: { id } });
  if (!billing) {
    return NextResponse.json({ error: "Faturamento não encontrado" }, { status: 404 });
  }

  // Comprovante de pagamento exige role financeiro. Os 3 documentos do dono
  // (NF, Recibo Terra, Recibo Aluguel) sao pre-requisito para FINANCEIRO,
  // mas ADMIN pode subir antes (override pra casos excepcionais).
  if (type === "comprovante_pagamento") {
    if (!isFinanceRole(session.user.role)) {
      return NextResponse.json(
        { error: "Apenas o time financeiro pode anexar o comprovante de pagamento" },
        { status: 403 },
      );
    }
    const docsOk =
      billing.notaFiscalUrl && billing.reciboTerraUrl && billing.reciboAluguelUrl;
    if (!docsOk && !isFullAdmin(session.user.role)) {
      return NextResponse.json(
        { error: "Aguarde o envio de Nota Fiscal, Recibo de Terra e Recibo de Aluguel antes do comprovante." },
        { status: 400 },
      );
    }
  }

  // Mes encerrado: bloqueia QUALQUER upload (incluindo re-upload do
  // proprio comprovante) para nao-ADMIN. Reabertura eh explicita via
  // POST /reabrir.
  if (billing.encerradoEm && !isFullAdmin(session.user.role)) {
    return NextResponse.json(
      {
        error:
          "Mês encerrado (comprovante anexado). Apenas ADMIN pode trocar documentos — peça reabertura.",
      },
      { status: 403 },
    );
  }

  const subdir = `billing/plants/${id}`;
  const saved = await saveUploadedFile(file, subdir);
  const now = new Date();

  // Apaga arquivo antigo (se existir) para o mesmo slot
  const oldUrlMap: Record<DocType, string | null | undefined> = {
    relatorio: billing.relatorioGeradoUrl,
    nota_fiscal: billing.notaFiscalUrl,
    recibo_terra: billing.reciboTerraUrl,
    recibo_aluguel: billing.reciboAluguelUrl,
    comprovante_pagamento: billing.comprovantePagamentoUrl,
  };
  await deleteUploadedFile(oldUrlMap[type]);

  // Monta o update conforme o tipo
  const data: Record<string, unknown> = {};
  switch (type) {
    case "relatorio":
      data.relatorioGeradoUrl = saved.relativePath;
      data.relatorioGeradoAt = now;
      data.relatorioGeradoBy = session.user.id;
      break;
    case "nota_fiscal":
      data.notaFiscalUrl = saved.relativePath;
      data.notaFiscalAt = now;
      break;
    case "recibo_terra":
      data.reciboTerraUrl = saved.relativePath;
      data.reciboTerraAt = now;
      break;
    case "recibo_aluguel":
      data.reciboAluguelUrl = saved.relativePath;
      data.reciboAluguelAt = now;
      break;
    case "comprovante_pagamento":
      data.comprovantePagamentoUrl = saved.relativePath;
      data.comprovantePagamentoAt = now;
      data.comprovantePagamentoBy = session.user.id;
      data.status = "PAGO";
      // Encerra o mes automaticamente: trava todas as edicoes pra
      // nao-ADMIN ate uma reabertura explicita via POST /reabrir.
      data.encerradoEm = now;
      data.encerradoPorUserId = session.user.id;
      break;
  }

  // Transição automática de status para docs do dono
  if (type !== "comprovante_pagamento" && type !== "relatorio") {
    const merged = {
      notaFiscalUrl: type === "nota_fiscal" ? saved.relativePath : billing.notaFiscalUrl,
      reciboTerraUrl: type === "recibo_terra" ? saved.relativePath : billing.reciboTerraUrl,
      reciboAluguelUrl: type === "recibo_aluguel" ? saved.relativePath : billing.reciboAluguelUrl,
    };
    if (merged.notaFiscalUrl && merged.reciboTerraUrl && merged.reciboAluguelUrl) {
      if (billing.status === "PENDENTE" || billing.status === "AGUARDANDO_DOCUMENTOS") {
        data.status = "AGUARDANDO_PAGAMENTO";
      }
    } else if (billing.status === "PENDENTE") {
      data.status = "AGUARDANDO_DOCUMENTOS";
    }
  } else if (type === "relatorio" && billing.status === "PENDENTE") {
    data.status = "AGUARDANDO_DOCUMENTOS";
  }

  const updated = await prisma.plantBilling.update({ where: { id }, data });

  // Comprovante anexado = mes encerrado: cascadeia kWh em aberto pra mes
  // seguinte (UCs inadimplentes nao deixam kWh "perdidos" no mes encerrado).
  if (type === "comprovante_pagamento") {
    cascadeUnpaidPayablesToNextMonth(
      billing.plantId,
      billing.ano,
      billing.mes,
    ).catch((e) => {
      console.warn(
        `[upload comprovante] cascade falhou para plant=${billing.plantId} ${billing.mes}/${billing.ano}:`,
        e,
      );
    });
  }

  return NextResponse.json(updated);
}

/**
 * DELETE /api/billing/plants/[id]/upload?type=nota_fiscal
 * Remove um arquivo já enviado.
 */
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as DocType | null;
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "type inválido" }, { status: 400 });
  }

  const billing = await prisma.plantBilling.findUnique({ where: { id } });
  if (!billing) {
    return NextResponse.json({ error: "Faturamento não encontrado" }, { status: 404 });
  }

  if (type === "comprovante_pagamento" && !isFinanceRole(session.user.role)) {
    return NextResponse.json({ error: "Apenas o financeiro pode remover o comprovante" }, { status: 403 });
  }

  // Mes encerrado: nao-ADMIN nao remove nada (nem o proprio comprovante).
  // Reabertura eh explicita via POST /reabrir.
  if (billing.encerradoEm && !isFullAdmin(session.user.role)) {
    return NextResponse.json(
      {
        error:
          "Mês encerrado. Apenas ADMIN pode remover documentos — peça reabertura.",
      },
      { status: 403 },
    );
  }

  const fieldMap: Record<DocType, { url: keyof typeof billing; at: keyof typeof billing }> = {
    relatorio: { url: "relatorioGeradoUrl", at: "relatorioGeradoAt" },
    nota_fiscal: { url: "notaFiscalUrl", at: "notaFiscalAt" },
    recibo_terra: { url: "reciboTerraUrl", at: "reciboTerraAt" },
    recibo_aluguel: { url: "reciboAluguelUrl", at: "reciboAluguelAt" },
    comprovante_pagamento: { url: "comprovantePagamentoUrl", at: "comprovantePagamentoAt" },
  };
  const { url, at } = fieldMap[type];
  await deleteUploadedFile(billing[url] as string | null);

  const data: Record<string, unknown> = {
    [url]: null,
    [at]: null,
  };
  if (type === "comprovante_pagamento") {
    data.comprovantePagamentoBy = null;
    data.status = "AGUARDANDO_PAGAMENTO";
    // Remover comprovante implica reabrir o mes (state consistente com
    // "nao tem comprovante anexado" = nao encerrado).
    data.encerradoEm = null;
    data.encerradoPorUserId = null;
  }

  const updated = await prisma.plantBilling.update({ where: { id }, data });
  return NextResponse.json(updated);
}
