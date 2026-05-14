import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { loadDemonstrativoData } from "@/lib/demonstrativo";
import { DemonstrativoPDF } from "@/components/billing/demonstrativo-pdf";
import { renderToBuffer } from "@react-pdf/renderer";

export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const data = await loadDemonstrativoData(id);
  if (!data) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });
  }

  const pdfBuffer = await renderToBuffer(DemonstrativoPDF({ data }));

  const filename = `demonstrativo-${data.codigoUc}-${data.mesLabel.replace("/", "-")}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
