import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";

/**
 * Marca um item da fila do CRM como resolvido nesta ponta (UC cadastrada,
 * usina criada, balanço ajustado) ou como ignorado.
 *
 * `processadaEm` carimbado aqui trava a situação: o sync das próximas rodadas
 * continua atualizando os dados vindos do CRM, mas não volta a linha pra
 * PENDENTE — não desfaz o trabalho de quem cadastrou.
 */
const SITUACOES_MANUAIS = new Set(["CONCLUIDA", "IGNORADA", "PENDENTE"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const situacao = String(body.situacao ?? "").toUpperCase();
  if (!SITUACOES_MANUAIS.has(situacao)) {
    return NextResponse.json(
      { error: "Situação inválida. Use CONCLUIDA, IGNORADA ou PENDENTE." },
      { status: 400 },
    );
  }

  const linha = await prisma.crmVendaImportada.update({
    where: { id },
    data: {
      situacao,
      observacao: typeof body.observacao === "string" ? body.observacao : undefined,
      // Voltar pra PENDENTE destrava a linha e devolve o controle ao sync.
      processadaEm: situacao === "PENDENTE" ? null : new Date(),
      processadaPorId: situacao === "PENDENTE" ? null : session.user.id,
    },
  });

  return NextResponse.json(linha);
}
