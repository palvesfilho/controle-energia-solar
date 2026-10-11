import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { montarDocumentoRge } from "@/lib/transferencia-creditos";
import { TransferenciaSaldoPDF } from "@/components/rateios/transferencia-saldo-pdf";

export const runtime = "nodejs";

/**
 * GET /api/transferencias-credito/[id]/pdf — o formulário "Solicitação de
 * Transferência de Saldo" pronto para o titular assinar e enviar à RGE.
 * Recusa (400) enquanto faltar código antigo, titular ou a soma de 100%:
 * documento incompleto volta rejeitado da RGE 30 dias depois.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const t = await prisma.creditTransfer.findUnique({
    where: { id },
    include: {
      plant: { select: { unidadeConsumidora: true, unidadeConsumidoraAntiga: true } },
      items: {
        orderBy: { percentual: "desc" },
        include: { consumerUnit: { select: { nome: true, codigoUc: true, codigoUcAntigo: true } } },
      },
    },
  });
  if (!t) return NextResponse.json({ error: "Transferência não encontrada" }, { status: 404 });

  const doc = montarDocumentoRge({
    ucOrigemCodigo: t.ucOrigemCodigo,
    usinaCodigoAntigo: t.plant?.unidadeConsumidoraAntiga ?? null,
    usinaCodigo: t.plant?.unidadeConsumidora ?? null,
    titularNome: t.titularNome,
    titularEmail: t.titularEmail,
    destinos: t.items.map((i) => ({ ...i.consumerUnit, percentual: i.percentual })),
  });
  if (!doc.ok) return NextResponse.json({ error: doc.erros.join(" "), erros: doc.erros }, { status: 400 });

  // A data do documento é a do envio; sem ela, hoje (em Brasília).
  const data = t.enviadoEm
    ? t.enviadoEm.toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const pdf = await renderToBuffer(TransferenciaSaldoPDF({ doc: doc.valor, data }));
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="transferencia-saldo-${doc.valor.doadora}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
