import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Sun, Eye, ArrowLeft } from "lucide-react";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection, getHomeRoute } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { brandGradient } from "@/lib/brand-colors";
import { getPortalClienteData } from "@/lib/portal-cliente-data";
import { PortalClienteBody } from "@/components/brasil-solar/portal-cliente-body";

export const dynamic = "force-dynamic";

/**
 * "Visão do cliente" — réplica somente-leitura do portal do cliente Brasil
 * Solar, para o pós-venda dar suporte durante uma chamada. Renderiza o MESMO
 * corpo (`PortalClienteBody`) do portal real, mas resolve o proprietário pelo
 * `id` na URL (não pelo Clerk do logado) e sem qualquer ação de escrita.
 *
 * Fica fora do grupo (dashboard) de propósito, pra não herdar a sidebar/header
 * do admin e parecer de fato a tela do cliente. O acesso é gated por role
 * (`brasilSolar`, mesmo escopo do resto do módulo BS).
 */
export default async function VisaoClientePage({
  params,
}: {
  params: Promise<{ proprietarioId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login-clerk");
  if (!canAccessSection(session.user.role, "brasilSolar")) {
    redirect(getHomeRoute(session.user.role));
  }

  const { proprietarioId } = await params;

  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    include: {
      acesso: true,
      plantas: {
        where: { active: true },
        orderBy: { nome: "asc" },
        select: {
          id: true,
          nome: true,
          cidade: true,
          uf: true,
          potenciaInstalada: true,
          statusMonitoramento: true,
        },
      },
    },
  });
  if (!prop) notFound();

  const nome = prop.nome.split(" ")[0] || prop.nome;
  const portalData = await getPortalClienteData(prop.id);

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F8F7]">
      {/* Faixa de prévia — deixa claro que é somente leitura */}
      <div className="bg-[#1B5E54] text-white px-4 py-2 text-sm flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="font-semibold">Visão do cliente</span>
          <span className="opacity-80 truncate">· somente leitura · {prop.nome}</span>
        </div>
        <Link
          href={`/admin/brasil-solar/proprietarios/${prop.id}`}
          className="inline-flex items-center gap-1 opacity-90 hover:opacity-100 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao painel
        </Link>
      </div>

      {/* Header idêntico ao portal do cliente (sem o UserButton do Clerk) */}
      <header className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center"
            style={{ background: brandGradient }}
          >
            <Sun className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="font-bold text-[#1F1F1F] leading-tight tracking-tight">
              Rede Brasil Solar
            </div>
            <div className="text-xs text-[#8A938D]">Portal do Cliente</div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
        <PortalClienteBody
          nome={nome}
          acesso={prop.acesso}
          portalData={portalData}
          usinas={prop.plantas}
          relatoriosProprietarioId={prop.id}
        />
      </main>
    </div>
  );
}
