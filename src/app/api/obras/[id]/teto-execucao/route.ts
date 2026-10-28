import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

/**
 * Máximo de execução AUTORIZADO pelo admin numa obra: projeto grande
 * (negociado à parte) ou acréscimo extraordinário. Substitui o teto calculado
 * pela regra do produto — ver lib/execucao-obra.ts.
 *
 * Só o trio admin (ADMIN/GESTOR/FINANCEIRO). O gestor de obras vê o valor e o
 * motivo, mas não altera: quem negocia com a equipe não autoriza o próprio
 * teto. Só vale enquanto a obra não foi aceita — depois do aceite o teto já
 * está congelado em `tetoExecucao`.
 *
 * Body: { valor: number | null, motivo: string }. `valor: null` remove a
 * autorização e a obra volta para a regra do produto.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json(
      { error: "Só o administrador define o máximo de execução de uma obra." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const obra = await prisma.obra.findUnique({ where: { id }, select: { aprovacao: true } });
  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
  }
  if (obra.aprovacao !== "PENDENTE") {
    return NextResponse.json(
      { error: "A obra já foi decidida; o máximo só muda enquanto ela está pendente." },
      { status: 409 }
    );
  }

  if (body.valor === null) {
    const atualizada = await prisma.obra.update({
      where: { id },
      data: {
        tetoExecucaoAutorizado: null,
        tetoExecucaoAutorizadoMotivo: null,
        tetoExecucaoAutorizadoPor: null,
        tetoExecucaoAutorizadoEm: null,
      },
    });
    return NextResponse.json(atualizada);
  }

  const valor = Number(body.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ error: "Informe um valor maior que zero." }, { status: 400 });
  }
  const motivo = String(body.motivo ?? "").trim();
  if (!motivo) {
    return NextResponse.json(
      { error: "Escreva o motivo: é ele que explica, depois, por que esta obra pagou diferente." },
      { status: 400 }
    );
  }

  const atualizada = await prisma.obra.update({
    where: { id },
    data: {
      tetoExecucaoAutorizado: Math.round(valor * 100) / 100,
      tetoExecucaoAutorizadoMotivo: motivo,
      tetoExecucaoAutorizadoPor: session.user.name || session.user.email,
      tetoExecucaoAutorizadoEm: new Date(),
    },
  });
  return NextResponse.json(atualizada);
}
