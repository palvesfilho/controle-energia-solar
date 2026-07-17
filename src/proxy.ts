import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  canAccessSection,
  canEnterAdminPanel,
  getHomeRoute,
  type AdminSection,
} from "@/lib/roles";

// Mais específico primeiro. resolveSection() casa o primeiro prefix que bater.
const PATH_SECTIONS: Array<[string, AdminSection]> = [
  ["/admin/usuarios", "usuarios"],
  ["/admin/agenda", "agenda"],
  ["/admin/investidores", "investidores"],
  ["/admin/usinas", "investidores"],
  ["/admin/consumidores", "clientes"],
  ["/admin/unidades-consumidoras", "clientes"],
  ["/admin/gestao-creditos", "gestaoCreditos"],
  ["/admin/faturas-energia", "faturasEnergia"],
  ["/admin/faturamento", "faturamento"],
  ["/admin/brasil-solar", "brasilSolar"],
  ["/admin/obra", "obra"],
  ["/admin/personalizacoes/obras", "persObras"],
  ["/admin/personalizacoes/equipes", "persEquipes"],
  ["/admin/personalizacoes/codigos-erro-inversor", "persCodigosErroView"],
  ["/admin/personalizacoes/distribuidora-emails", "persDistribuidoraEmails"],
  ["/admin/personalizacoes/alertas-usinas", "persAlertasUsinas"],
  ["/admin/personalizacoes/relatorio-parametros", "persRelatorioParametros"],
  ["/admin/personalizacoes", "personalizacoesHub"],
];

function resolveAdminSection(pathname: string): AdminSection | null {
  if (pathname === "/admin" || pathname === "/admin/") return "dashboard";
  for (const [prefix, section] of PATH_SECTIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return section;
    }
  }
  return null;
}

const isProtected = createRouteMatcher([
  "/admin(.*)",
  "/painel(.*)",
  "/relatorios(.*)",
  "/perfil(.*)",
  "/portal(.*)",
  "/portal-cliente(.*)",
  // "Visão do cliente" (pós-venda): prévia read-only do portal. Exige login; o
  // gate de role (section brasilSolar) é feito na própria página.
  "/visao-cliente(.*)",
]);

const isApi = createRouteMatcher([
  "/api(.*)",
]);

const isPublicApi = createRouteMatcher([
  "/api/webhooks/(.*)",
  "/api/auth/(.*)", // legado NextAuth — pode remover quando lib/auth-options sumir
  // Server-to-server: o robô RGE (backfill de faturas) faz POST aqui com a sua
  // PRÓPRIA autenticação (Authorization: Bearer CRON_SECRET). Sem sessão Clerk,
  // então precisa ser público no middleware — a rota valida o Bearer.
  "/api/faturas-energia/ingest",
  // Callback do robô RGE ao terminar o backfill assíncrono (Bearer CRON_SECRET,
  // sem sessão Clerk). O [id] da UC é dinâmico → wildcard.
  "/api/consumer-units/(.*)/bills/backfill/status",
  // Pagamento branded: o cliente paga ANTES de ter conta. A chave é o
  // conviteToken (UUID) na URL — a rota valida o token, não a sessão.
  "/api/portal/cobranca/(.*)",
]);

// Página pública de pagamento branded (/portal-cliente/pagar/<token>): o pagador
// ainda não tem login. Fica FORA do isProtected mesmo casando /portal-cliente(.*).
const isPagamentoPublico = createRouteMatcher(["/portal-cliente/pagar/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;

  // APIs: bloqueia se não autenticado (exceto webhooks e legado)
  if (isApi(req) && !isPublicApi(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return;
  }

  // Página de pagamento branded é pública (autenticada pelo token na URL).
  if (isPagamentoPublico(req)) return;

  if (!isProtected(req)) return;

  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/login-clerk", req.url));
  }

  // Role vem do publicMetadata do Clerk. Pra aparecer em sessionClaims,
  // configure Custom Session Token no painel Clerk:
  //   Configure → Sessions → Customize session token
  //   Claims: { "metadata": "{{user.public_metadata}}" }
  // Sem isso, role fica vazio e RBAC redireciona pro home.
  const claims = sessionClaims as Record<string, unknown> | null;
  const metadata = (claims?.metadata ?? claims?.publicMetadata) as { role?: string } | undefined;
  const role = metadata?.role ?? "";

  if (pathname.startsWith("/admin")) {
    if (!canEnterAdminPanel(role)) {
      return NextResponse.redirect(new URL(getHomeRoute(role), req.url));
    }
    const section = resolveAdminSection(pathname);
    if (section && !canAccessSection(role, section)) {
      return NextResponse.redirect(new URL(getHomeRoute(role), req.url));
    }
  }

  if (
    pathname.startsWith("/painel") &&
    (canEnterAdminPanel(role) || role === "CLIENTE_BS")
  ) {
    return NextResponse.redirect(new URL(getHomeRoute(role), req.url));
  }
});

export const config = {
  matcher: [
    // Pula assets internos e arquivos com extensão
    "/((?!_next|.*\\.[\\w]+$).*)",
    // Sempre roda em API
    "/(api|trpc)(.*)",
  ],
};
