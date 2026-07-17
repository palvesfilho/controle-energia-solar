import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { getHomeRoute } from "@/lib/roles";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  // Rota inicial por perfil (mesma tabela do middleware). Antes mandava todo
  // não-ADMIN pra /painel, o que quicava o CLIENTE_BS (/ ↔ /painel) e fechava
  // o loop de login. getHomeRoute leva CLIENTE_BS direto pro /portal-cliente.
  redirect(getHomeRoute(session.user.role));
}
