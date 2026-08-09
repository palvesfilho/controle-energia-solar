import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolvePortalProprietario } from "@/lib/portal-cliente-auth";

export const runtime = "nodejs";

const schemaInscricao = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * POST /api/portal-cliente/push/inscrever
 *
 * Grava a inscrição de push do aparelho do cliente logado. O proprietário sai
 * sempre do Clerk (`resolvePortalProprietario`), nunca de id no corpo — senão
 * qualquer um inscreveria um celular na conta alheia e passaria a receber os
 * avisos daquele cliente.
 *
 * `endpoint` é único e identifica o aparelho, então isto é um upsert: reautorizar
 * no mesmo celular atualiza as chaves em vez de criar linha duplicada.
 *
 * 🔑 O upsert também TROCA o dono do endpoint. Celular compartilhado — cliente A
 * sai, cliente B entra no mesmo aparelho — precisa exatamente disso: o aparelho
 * passa a receber os avisos de B, e nunca os dois ao mesmo tempo.
 */
export async function POST(req: NextRequest) {
  const prop = await resolvePortalProprietario();
  if (!prop) {
    return NextResponse.json(
      { error: "Conta não vinculada a um proprietário" },
      { status: 404 },
    );
  }

  const corpo = schemaInscricao.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ error: "Inscrição inválida" }, { status: 400 });
  }

  const { endpoint, keys } = corpo.data;
  // Só para o operador reconhecer o aparelho na tela do admin.
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      proprietarioId: prop.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    },
    update: {
      proprietarioId: prop.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    },
  });

  return NextResponse.json({ ok: true });
}
