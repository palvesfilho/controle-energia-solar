import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolvePortalProprietario } from "@/lib/portal-cliente-auth";

export const runtime = "nodejs";

const schema = z.object({ acao: z.enum(["LIDO", "INTERESSE", "DISPENSAR"]) });

/**
 * PATCH /api/portal-cliente/avisos/[id]
 *
 * Registra o que o cliente fez com o aviso.
 *   LIDO      — abriu a caixa de avisos (ou tocou na notificação).
 *   INTERESSE — tocou no botão da oferta. É O LEAD. Vale a venda inteira.
 *   DISPENSAR — não quer; o aviso some da caixa dele.
 *
 * 🔑 O `updateMany` filtra por `proprietarioId` junto com o id: sem isso, um
 * cliente marcaria interesse no aviso de outro só trocando o id na URL — e o
 * pós-venda ligaria para a pessoa errada oferecendo o que ela não pediu.
 *
 * `interesseEm` só é gravado UMA vez (o `where` exige null). Tocar duas vezes
 * no botão não pode reordenar a fila do pós-venda como se fosse lead novo.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const prop = await resolvePortalProprietario();
  if (!prop) {
    return NextResponse.json({ error: "Conta não vinculada" }, { status: 404 });
  }

  const { id } = await params;
  const corpo = schema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const agora = new Date();
  const escopo = { id, proprietarioId: prop.id };

  if (corpo.data.acao === "LIDO") {
    await prisma.campanhaEnvio.updateMany({
      where: { ...escopo, lidoEm: null },
      data: { lidoEm: agora },
    });
  } else if (corpo.data.acao === "INTERESSE") {
    await prisma.campanhaEnvio.updateMany({
      where: { ...escopo, interesseEm: null },
      // Interesse implica leitura: o cliente não toca no botão sem ter lido.
      data: { interesseEm: agora, lidoEm: agora },
    });
  } else {
    await prisma.campanhaEnvio.updateMany({
      where: escopo,
      data: { dispensadoEm: agora },
    });
  }

  return NextResponse.json({ ok: true });
}
