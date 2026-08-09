import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolvePortalProprietario } from "@/lib/portal-cliente-auth";

export const runtime = "nodejs";

const schemaCancelamento = z.object({ endpoint: z.string().url() });

/**
 * POST /api/portal-cliente/push/cancelar
 *
 * Apaga a inscrição deste aparelho — o cliente desligou os avisos no portal.
 *
 * O `deleteMany` filtra por endpoint **e** proprietário: sem o segundo filtro,
 * um cliente conseguiria desinscrever o celular de outro só mandando o endpoint
 * dele. Como o endpoint não é adivinhável, seria difícil — mas "difícil" não é
 * controle de acesso.
 */
export async function POST(req: NextRequest) {
  const prop = await resolvePortalProprietario();
  if (!prop) {
    return NextResponse.json(
      { error: "Conta não vinculada a um proprietário" },
      { status: 404 },
    );
  }

  const corpo = schemaCancelamento.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ error: "Endpoint inválido" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: corpo.data.endpoint, proprietarioId: prop.id },
  });

  return NextResponse.json({ ok: true });
}
