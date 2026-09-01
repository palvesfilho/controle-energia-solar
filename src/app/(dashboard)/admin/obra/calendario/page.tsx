import { getEstadoAcesso } from "@/lib/auth-compat";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { CalendarioClient } from "./calendario-client";

export const dynamic = "force-dynamic";

export default async function CalendarioObrasPage() {
  const acesso = await getEstadoAcesso();
  if (acesso.estado === "ANONIMO") redirect("/login");
  // Sem autorização: quem desenha a tela de 403 é o layout do dashboard. Aqui
  // basta NÃO redirecionar — um redirect daqui dispara mesmo com o layout já
  // renderizando o 403, e reabre o laço.
  if (acesso.estado === "SEM_ACESSO") return null;
  const session = acesso.session;
  if (!isAdminRole(session.user.role)) redirect("/painel");

  const equipes = await prisma.equipeExecucao.findMany({
    where: { active: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  return <CalendarioClient equipes={equipes} />;
}
