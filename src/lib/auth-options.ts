/**
 * 🔒 Resto inerte do NextAuth — 08/08/2026.
 *
 * Este arquivo continha um `CredentialsProvider` funcional: `bcrypt.compare()`
 * contra `User.passwordHash`, sessão JWT. Era o miolo do endpoint público
 * `/api/auth/callback/credentials` (agora desligado — ver a lápide em
 * `src/app/api/auth/[...nextauth]/route.ts`).
 *
 * 🔑 Por que o arquivo não sumiu: **202 arquivos** fazem
 * `getServerSession(authOptions)`. Só que o `getServerSession` que eles usam é o
 * de `@/lib/auth-compat`, cuja assinatura é `(_optionsIgnoradas?: unknown)` — o
 * argumento nunca foi lido. Então `authOptions` é hoje um valor decorativo:
 * esvaziá-lo desliga o login por senha sem encostar em nenhum dos 202 call sites.
 *
 * Quando a refatoração final acontecer (cada call site chamando o Clerk direto),
 * este arquivo e o `auth-compat` somem juntos.
 */

/**
 * Placeholder para os call sites de `getServerSession(authOptions)`.
 * NÃO configura autenticação — o argumento é ignorado pelo shim do Clerk.
 */
export const authOptions = {} as const;
