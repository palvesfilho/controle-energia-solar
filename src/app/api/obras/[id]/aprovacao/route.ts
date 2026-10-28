import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { execucaoDasObras } from "@/lib/execucao-obra";

const VALORES_VALIDOS = new Set(["PENDENTE", "ACEITA", "RECUSADA"]);

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const aprovacao = String(body.aprovacao || "").toUpperCase();
  if (!VALORES_VALIDOS.has(aprovacao)) {
    return NextResponse.json(
      { error: "Valor inválido. Use PENDENTE, ACEITA ou RECUSADA." },
      { status: 400 }
    );
  }

  if (aprovacao !== "ACEITA") {
    const obra = await prisma.obra.update({
      where: { id },
      data: { aprovacao },
    });
    return NextResponse.json(obra);
  }

  // Aceite exige o valor que a equipe cobrou, e ele não pode passar do teto
  // da venda. A tela já trava, mas a regra mora aqui: outra tela ou um script
  // que chame esta rota não pode aceitar por fora.
  const valorExecucao = Number(body.valorExecucao);
  if (!Number.isFinite(valorExecucao) || valorExecucao <= 0) {
    return NextResponse.json(
      { error: "Informe o valor que a equipe cobrou pela execução para aceitar a obra." },
      { status: 400 }
    );
  }

  const execucao = (await execucaoDasObras([id])).get(id);
  if (execucao?.aguardandoAdmin) {
    return NextResponse.json(
      {
        error:
          "Projeto grande: o máximo de execução é negociado à parte e definido pelo " +
          "administrador. Peça a autorização antes de aceitar.",
      },
      { status: 422 }
    );
  }
  const teto = execucao?.teto ?? null;
  if (teto != null && valorExecucao > teto) {
    return NextResponse.json(
      {
        error:
          `O valor de ${formatarReais(valorExecucao)} passa do máximo de ${formatarReais(teto)} ` +
          "aceito para esta obra. Negocie com a equipe ou peça ao administrador um " +
          "máximo maior antes de aceitar.",
      },
      { status: 422 }
    );
  }

  const obra = await prisma.obra.update({
    where: { id },
    data: {
      aprovacao,
      valorExecucao: Math.round(valorExecucao * 100) / 100,
      tetoExecucao: teto,
      valorExecucaoInformadoEm: new Date(),
      valorExecucaoInformadoPor: session.user.name || session.user.email,
    },
  });

  return NextResponse.json(obra);
}
