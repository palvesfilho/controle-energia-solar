import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Sun, Eye, ArrowLeft } from "lucide-react";
import { getEstadoAcesso } from "@/lib/auth-compat";
import { canAccessSection, getHomeRoute } from "@/lib/roles";
import { SemAcesso } from "@/components/auth/sem-acesso";
import { prisma } from "@/lib/prisma";
import { brandGradient } from "@/lib/brand-colors";
import {
  getPortalClienteData,
  getPortalGeracaoFree,
} from "@/lib/portal-cliente-data";
import { resolvePlanoPortal } from "@/lib/portal-cliente-plano";
import { formatNomeSaudacao } from "@/lib/formatters";
import { PortalClienteBody } from "@/components/brasil-solar/portal-cliente-body";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { InstallAppBotao } from "@/components/pwa/install-app-botao";

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
  searchParams,
}: {
  params: Promise<{ proprietarioId: string }>;
  searchParams: Promise<{ plano?: string }>;
}) {
  const acesso = await getEstadoAcesso();
  if (acesso.estado === "ANONIMO") redirect("/login-clerk");
  // Logado sem autorizacao: estado terminal, sem redirect (ver auth-compat.ts).
  if (acesso.estado === "SEM_ACESSO") {
    return <SemAcesso email={acesso.email} nome={acesso.nome} />;
  }
  const session = acesso.session;
  if (!canAccessSection(session.user.role, "brasilSolar")) {
    redirect(getHomeRoute(session.user.role));
  }

  const { proprietarioId } = await params;
  const { plano: planoParam } = await searchParams;

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

  const nome = formatNomeSaudacao(prop.nome) ?? prop.nome;
  const plano = await resolvePlanoPortal(prop.acesso);
  // Prévia: por padrão reflete o plano real, mas ?plano=free|completo força a
  // visão desejada — útil pro pós-venda mostrar o free-tier a um cliente pago.
  const planoCompleto =
    planoParam === "free"
      ? false
      : planoParam === "completo"
        ? true
        : plano.planoCompleto;
  const portalData = planoCompleto
    ? await getPortalClienteData(prop.id)
    : null;
  const geracaoFree = planoCompleto
    ? null
    : await getPortalGeracaoFree(prop.id);

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F8F7]">
      {/* Faixa de prévia — deixa claro que é somente leitura */}
      <div className="bg-[#1B5E54] text-white px-4 py-2 text-sm flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="font-semibold">Visão do cliente</span>
          <span className="opacity-80 truncate">· somente leitura · {prop.nome}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Alternador de prévia: força o free-tier ou o plano completo */}
          <div className="inline-flex items-center rounded-full bg-white/15 p-0.5 text-xs font-semibold">
            <Link
              href={`/visao-cliente/${prop.id}?plano=free`}
              className={`px-2.5 py-1 rounded-full ${
                !planoCompleto ? "bg-white text-[#1B5E54]" : "opacity-80 hover:opacity-100"
              }`}
            >
              Grátis
            </Link>
            <Link
              href={`/visao-cliente/${prop.id}?plano=completo`}
              className={`px-2.5 py-1 rounded-full ${
                planoCompleto ? "bg-white text-[#1B5E54]" : "opacity-80 hover:opacity-100"
              }`}
            >
              Completo
            </Link>
          </div>
          {/* Instalação do app: fica na barra de prévia, e não na faixa branca
              que o cliente vê, pra não confundir quem demonstra a tela. */}
          <InstallAppBotao />
          <Link
            href={`/admin/brasil-solar/proprietarios/${prop.id}`}
            className="inline-flex items-center gap-1 opacity-90 hover:opacity-100"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao painel
          </Link>
        </div>
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
          planoCompleto={planoCompleto}
          geracaoFree={geracaoFree}
          precoPlanoLabel={plano.precoPlanoLabel}
          ctaHref={plano.ctaHref}
        />
      </main>

      {/* O Chrome só libera a instalação se houver service worker registrado.
          Quem abre a prévia pode nunca ter entrado no portal do cliente, então
          registramos aqui também — é o mesmo `/sw.js`, escopo "/". */}
      <PwaRegister />
    </div>
  );
}
