/**
 * 🔒 Login por senha local DESLIGADO — 08/08/2026.
 *
 * A autenticação passou para o Clerk em 21/06/2026 (`/login` só redireciona para
 * `/login-clerk`, e `src/proxy.ts` usa `clerkMiddleware`). Mas este handler
 * continuou no ar por mais de um mês: `NEXTAUTH_SECRET` estava definido, o
 * endpoint anunciava o provider em `/api/auth/providers`, emitia CSRF e
 * processava POST em `/api/auth/callback/credentials` comparando com bcrypt
 * contra `User.passwordHash` — 10 contas ativas com hash válido, entre elas 1
 * ADMIN e 3 GESTOR, sem nenhum rate limit.
 *
 * O cookie emitido não abria nada (`lib/auth-compat` lê só o Clerk, e ignora o
 * argumento `authOptions`), mas um endpoint público que confirma se uma senha
 * está certa é um oráculo de força bruta — e senha confirmada costuma ser
 * reusada em outros sistemas. Não é porque a porta não leva a lugar nenhum que
 * ela pode ficar destrancada.
 *
 * Ficou como lápide em vez de sumir: se algum cliente antigo ainda chamar
 * `/api/auth/...`, um 410 explícito diz o que aconteceu, enquanto um 404 pareceria
 * bug de rota. Pode ser apagado de vez quando não houver mais chamadas nos logs.
 */
import { NextResponse } from "next/server";

const RESPOSTA = {
  error: "AUTENTICACAO_DESCONTINUADA",
  message:
    "O login por senha local foi desativado. A autenticação é feita pelo Clerk em /login-clerk.",
} as const;

function gone() {
  return NextResponse.json(RESPOSTA, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = gone;
export const POST = gone;
