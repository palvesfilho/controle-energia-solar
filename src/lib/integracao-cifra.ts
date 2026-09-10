/**
 * Autenticação das rotas `/api/integracoes/cifra/*` — o Cifra (sistema
 * financeiro) lendo os números fechados das usinas.
 *
 * Chave própria (`CIFRA_API_KEY`), não o `CRON_SECRET`: são consumidores
 * diferentes, e revogar o acesso de um não pode derrubar o outro. Sem a
 * variável a rota responde 503 — nunca existe modo aberto.
 */
import { NextRequest, NextResponse } from "next/server";

export type Autorizacao =
  | { ok: true }
  | { ok: false; resposta: NextResponse };

export function autorizarCifra(req: NextRequest): Autorizacao {
  const chave = process.env.CIFRA_API_KEY;
  if (!chave) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { error: "Integração indisponível — configure CIFRA_API_KEY." },
        { status: 503 },
      ),
    };
  }

  const header = req.headers.get("x-api-key");
  const bearer = req.headers.get("authorization");
  const enviada = header ?? (bearer?.startsWith("Bearer ") ? bearer.slice(7) : null);

  if (enviada !== chave) {
    return {
      ok: false,
      resposta: NextResponse.json({ error: "Não autorizado" }, { status: 401 }),
    };
  }

  return { ok: true };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
