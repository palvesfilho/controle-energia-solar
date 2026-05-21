import { withAuth } from "next-auth/middleware";
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

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const role = (token?.role as string) || "";

    if (pathname.startsWith("/admin")) {
      if (!canEnterAdminPanel(role)) {
        return NextResponse.redirect(new URL(getHomeRoute(role), req.url));
      }
      const section = resolveAdminSection(pathname);
      if (section && !canAccessSection(role, section)) {
        return NextResponse.redirect(new URL(getHomeRoute(role), req.url));
      }
    }

    if (pathname.startsWith("/painel") && canEnterAdminPanel(role)) {
      return NextResponse.redirect(new URL(getHomeRoute(role), req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/painel/:path*", "/relatorios/:path*", "/admin/:path*", "/perfil/:path*"],
};
