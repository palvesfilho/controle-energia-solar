import { getEstadoAcesso } from "@/lib/auth-compat";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { SemAcesso } from "@/components/auth/sem-acesso";
import { UserRole } from "@/types/next-auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acesso = await getEstadoAcesso();

  // Não logado: manda pro login, que é onde ele resolve o problema dele.
  if (acesso.estado === "ANONIMO") {
    redirect("/login");
  }

  // Logado, porém sem autorização: estado TERMINAL. Redirecionar aqui devolve
  // a pessoa pro Clerk, que a manda de volta pra cá — laço infinito, app
  // "piscando". Ver o comentário de `EstadoAcesso` em auth-compat.ts.
  if (acesso.estado === "SEM_ACESSO") {
    return <SemAcesso email={acesso.email} nome={acesso.nome} />;
  }

  const role = acesso.session.user.role as UserRole;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header role={role} />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
