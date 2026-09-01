import { redirect } from "next/navigation";
import { getEstadoAcesso } from "@/lib/auth-compat";
import { getHomeRoute } from "@/lib/roles";
import { SemAcesso } from "@/components/auth/sem-acesso";

export default async function Home() {
  const acesso = await getEstadoAcesso();

  if (acesso.estado === "ANONIMO") {
    redirect("/login");
  }

  // Logado sem autorização: para aqui. Mandar pro login devolveria a pessoa
  // pra cá pelo Clerk — laço. Ver `EstadoAcesso` em auth-compat.ts.
  if (acesso.estado === "SEM_ACESSO") {
    return <SemAcesso email={acesso.email} nome={acesso.nome} />;
  }

  // Rota inicial por perfil (mesma tabela do middleware). Antes mandava todo
  // não-ADMIN pra /painel, o que quicava o CLIENTE_BS (/ ↔ /painel) e fechava
  // o loop de login. getHomeRoute leva CLIENTE_BS direto pro /portal-cliente.
  redirect(getHomeRoute(acesso.session.user.role));
}
