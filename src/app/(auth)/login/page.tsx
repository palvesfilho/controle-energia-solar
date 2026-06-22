import { redirect } from "next/navigation";

// O login antigo (NextAuth + senha local) foi descontinuado em 2026-06-21.
// Toda autenticação agora passa pelo Clerk em /login-clerk.
export default function LegacyLoginRedirect() {
  redirect("/login-clerk");
}
