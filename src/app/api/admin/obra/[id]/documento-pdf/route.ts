import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { loadObraCompleta, formatNumeroOs } from "@/lib/obra-load";
import { DocumentoObraPDF } from "@/components/obra/documento-obra-pdf";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const loaded = await loadObraCompleta(id);
  if (!loaded) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const { obra, proprietario, cleanObservacoes, meta } = loaded;

  const numeroOs = formatNumeroOs(obra.id, obra.createdAt);

  const pdf = await renderToBuffer(
    DocumentoObraPDF({
      data: {
        numeroOs,
        obra: {
          nome: obra.nome,
          descricao: obra.descricao,
          responsavel: obra.responsavel,
          cliente: obra.cliente,
          local: obra.local,
          status: obra.status,
          dataInicioPrevista: obra.dataInicioPrevista,
          dataFimPrevista: obra.dataFimPrevista,
          observacoes: cleanObservacoes || null,
        },
        proprietario: proprietario
          ? {
              nome: proprietario.nome,
              cpfCnpj: proprietario.cpfCnpj,
              telefone: proprietario.telefone,
              email: proprietario.email,
              endereco: proprietario.endereco,
              cidade: proprietario.cidade,
              uf: proprietario.uf,
              concessionaria: proprietario.concessionaria,
              codigoUc: proprietario.codigoUc,
            }
          : null,
        tecnico: {
          potenciaKwp:
            meta.potenciaKwp ?? proprietario?.potenciaInstalada ?? null,
          inversorMarca: proprietario?.inversorMarca ?? null,
          inversorModelo: proprietario?.inversorModelo ?? null,
          inversorPotencia:
            meta.inversorPotenciaKw ?? proprietario?.inversorPotencia ?? null,
          modulosMarca: proprietario?.modulosMarca ?? null,
          modulosModelo: proprietario?.modulosModelo ?? null,
          modulosQuantidade: proprietario?.modulosQuantidade ?? null,
        },
        emitidoEm: new Date(),
      },
    })
  );

  await prisma.obra.update({
    where: { id: obra.id },
    data: { documentoPdfGeradoEm: new Date() },
  });

  const filename = `documento-obra-${numeroOs}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
