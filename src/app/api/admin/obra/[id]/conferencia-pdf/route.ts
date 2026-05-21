import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { loadObraCompleta } from "@/lib/obra-load";
import { ConferenciaObraPDF } from "@/components/obra/conferencia-obra-pdf";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const loaded = await loadObraCompleta(id);
  if (!loaded) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const { obra, proprietario, meta } = loaded;
  const pdf = await renderToBuffer(
    ConferenciaObraPDF({
      data: {
        obra: {
          nome: obra.nome,
          cliente: obra.cliente,
          local: obra.local,
          responsavel: obra.responsavel,
        },
        proprietarioNome: proprietario?.nome ?? null,
        potenciaKwp:
          meta.potenciaKwp ?? proprietario?.potenciaInstalada ?? null,
        inversorPotenciaKw:
          meta.inversorPotenciaKw ?? proprietario?.inversorPotencia ?? null,
        emitidoEm: new Date(),
      },
    })
  );

  await prisma.obra.update({
    where: { id: obra.id },
    data: { conferenciaPdfGeradoEm: new Date() },
  });

  const filename = `conferencia-obra-${obra.id.slice(-6)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
