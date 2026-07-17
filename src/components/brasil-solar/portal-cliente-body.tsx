import { ShieldCheck, ShieldOff, Building2 } from "lucide-react";
import { brand } from "@/lib/brand-colors";
import type { PortalClienteData } from "@/lib/portal-cliente-data";
import { PortalClienteDashboard } from "@/components/brasil-solar/portal-cliente-dashboard";
import { PortalClienteRelatorios } from "@/components/brasil-solar/portal-cliente-relatorios";

/**
 * Corpo da tela do portal do cliente Brasil Solar (saudação, badge de acesso,
 * dashboard, lista de usinas e relatórios). Fonte ÚNICA de renderização, usada
 * tanto pelo portal real (`/portal-cliente`, proprietário = usuário logado)
 * quanto pela "Visão do cliente" do pós-venda (`/visao-cliente/[id]`, somente
 * leitura). Assim as duas telas nunca divergem.
 *
 * `relatoriosProprietarioId`: quando definido, a seção "Meus relatórios" busca
 * pelos endpoints admin (preview), resolvendo o proprietário por id em vez do
 * `clerkUserId` do logado.
 */

interface PortalBodyUsina {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  potenciaInstalada: number | null;
}

export function PortalClienteBody({
  nome,
  acesso,
  portalData,
  usinas,
  relatoriosProprietarioId,
}: {
  nome: string;
  acesso: { status: string; vigenteAte: Date | null } | null;
  portalData: PortalClienteData | null;
  usinas: PortalBodyUsina[];
  relatoriosProprietarioId?: string;
}) {
  return (
    <>
      <h1 className="text-2xl font-bold text-[#1F1F1F]">
        Olá, <span style={{ color: brand.tealDark }}>{nome}</span> 👋
      </h1>
      <p className="text-[#59604F] mt-1">
        Acompanhe a geração das suas usinas e seus relatórios.
      </p>

      <AcessoBadge acesso={acesso} />

      {portalData && (
        <div className="mt-6">
          <PortalClienteDashboard data={portalData} />
        </div>
      )}

      <h2 className="text-sm font-semibold text-[#8A938D] uppercase tracking-wide mt-8 mb-3">
        Minhas usinas ({usinas.length})
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {usinas.map((u) => (
          <div
            key={u.id}
            className="bg-white border border-[#E1EAE7] rounded-xl p-4 flex items-start gap-3"
          >
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: brand.tealMid }}
            >
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-[#1F1F1F] truncate">{u.nome}</div>
              <div className="text-sm text-[#59604F]">
                {[u.cidade, u.uf].filter(Boolean).join("/") || "—"}
                {u.potenciaInstalada ? ` · ${u.potenciaInstalada} kWp` : ""}
              </div>
            </div>
          </div>
        ))}
        {usinas.length === 0 && (
          <p className="text-sm text-[#8A938D]">Nenhuma usina vinculada ainda.</p>
        )}
      </div>

      <h2 className="text-sm font-semibold text-[#8A938D] uppercase tracking-wide mt-8 mb-3">
        Meus relatórios
      </h2>
      <PortalClienteRelatorios proprietarioId={relatoriosProprietarioId} />
    </>
  );
}

function AcessoBadge({
  acesso,
}: {
  acesso: { status: string; vigenteAte: Date | null } | null;
}) {
  const ativo = acesso?.status === "ATIVO";
  return (
    <div
      className={`mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
        ativo
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {ativo ? (
        <ShieldCheck className="h-4 w-4" />
      ) : (
        <ShieldOff className="h-4 w-4" />
      )}
      {ativo
        ? acesso?.vigenteAte
          ? `Acesso ativo até ${acesso.vigenteAte.toLocaleDateString("pt-BR")}`
          : "Acesso ativo"
        : "Acesso pendente de pagamento"}
    </div>
  );
}
