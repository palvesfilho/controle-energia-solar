import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { CalendarioClient } from "./calendario-client";

export const dynamic = "force-dynamic";

export default async function CalendarioObrasPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!isAdminRole(session.user.role)) redirect("/painel");

  const equipes = await prisma.equipeExecucao.findMany({
    where: { active: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  return <CalendarioClient equipes={equipes} />;
}
