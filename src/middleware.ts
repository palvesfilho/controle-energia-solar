import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const ADMIN_ROLES = ["ADMIN", "GESTOR", "FINANCEIRO"];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const role = token?.role as string;

    // Admin routes - only accessible by ADMIN, GESTOR, FINANCEIRO
    if (pathname.startsWith("/admin")) {
      if (!ADMIN_ROLES.includes(role)) {
        return NextResponse.redirect(new URL("/painel", req.url));
      }

      // User management - only ADMIN
      if (pathname.startsWith("/admin/usuarios") && role !== "ADMIN") {
        return NextResponse.redirect(new URL("/admin", req.url));
      }
    }

    // Investor/Consumer panel - redirect admin roles to admin panel
    if (pathname.startsWith("/painel") && ADMIN_ROLES.includes(role)) {
      return NextResponse.redirect(new URL("/admin", req.url));
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
