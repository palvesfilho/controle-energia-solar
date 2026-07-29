import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Leaf, Zap, Users, FileText, ShieldCheck, ArrowRight } from "lucide-react";
import { brand, brandGradient } from "@/lib/brand-colors";

type ModulosVisiveis = { assoc: boolean; bs: boolean; prop: boolean };

const ACESSO_POR_ROLE: Record<string, ModulosVisiveis> = {
  ADMIN: { assoc: true, bs: true, prop: true },
  GESTOR: { assoc: true, bs: true, prop: true },
  FINANCEIRO: { assoc: true, bs: false, prop: false },
  POS_VENDA: { assoc: false, bs: true, prop: true },
  GESTOR_OBRA: { assoc: false, bs: true, prop: false },
};

const GERADOR_URL = "https://gerador-proposta-rbs-production.up.railway.app/login";

export default async function PortalPage() {
  const user = await currentUser();
  if (!user) redirect("/login-clerk");

  const role = ((user.publicMetadata as Record<string, unknown>)?.role as string) || "INVESTOR";

  // Investidor e consumidor não passam pelo portal — vão direto pro painel deles
  if (role === "INVESTOR" || role === "CONSUMER") redirect("/painel");
  // Cliente Brasil Solar tem portal próprio (isolado do hub corporativo)
  if (role === "CLIENTE_BS") redirect("/portal-cliente");

  const acesso = ACESSO_POR_ROLE[role] ?? { assoc: false, bs: false, prop: false };
  const visiveis = Number(acesso.assoc) + Number(acesso.bs) + Number(acesso.prop);

  const nome = user.firstName || user.emailAddresses[0]?.emailAddress.split("@")[0] || "Usuário";
  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? "";
  const iniciais = (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "");

  const gridCols = visiveis === 1
    ? "grid-cols-1 max-w-md mx-auto"
    : visiveis === 2
    ? "grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto"
    : "grid-cols-1 md:grid-cols-3";

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F2]">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: brandGradient }}>
              <Leaf className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="font-bold text-[#1A2A30] leading-tight tracking-tight">AURA</div>
              <div className="text-xs text-[#8A9298]">Portal corporativo</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-[#1A2A30]">{nome}</div>
              <div className="text-xs text-[#8A9298]">
                {email} · <span className="font-medium" style={{ color: brand.tealDark }}>{role}</span>
              </div>
            </div>
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: "h-10 w-10",
                },
              }}
            />
            {iniciais && (
              <span className="sr-only">{iniciais}</span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-[#1A2A30]">
            Bem-vindo, <span style={{ color: brand.tealDark }}>{nome}</span>
          </h1>
          <p className="text-[#4B5A62] mt-2">Escolha o módulo que você quer acessar</p>
        </div>

        {visiveis === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#E5E5E0] mb-4">
              <ShieldCheck className="w-8 h-8 text-[#8A9298]" />
            </div>
            <h3 className="text-lg font-semibold text-[#1A2A30]">Sem acesso a nenhum módulo</h3>
            <p className="text-sm text-[#4B5A62] mt-1">Fale com o administrador.</p>
          </div>
        ) : (
          <div className={`grid ${gridCols} gap-6`}>
            {acesso.assoc && (
              <CardModulo
                href="/admin"
                titulo="Associação de Energia"
                subtitulo="Rede Brasil Solar"
                descricao="Gestão de investidores, créditos, faturas e cobrança dos descontistas."
                icon={Zap}
                cor={brand.orange}
                corAcento={brand.orangeLight}
                itens={[
                  "Gestora de Energia",
                  "Agenda da Semana",
                  "Investidores · Clientes",
                  "Gestão de Créditos",
                  "Faturas · Faturamento",
                ]}
              />
            )}
            {acesso.bs && (
              <CardModulo
                // Entra pelo dashboard, não pela lista de plantas — é o
                // primeiro item do menu e a visão que abre o módulo.
                href="/admin/brasil-solar/mapa"
                titulo="Gestão de Clientes"
                subtitulo="Brasil Solar"
                descricao="Monitoramento de plantas, cronograma de obras e atendimento aos clientes da rede."
                icon={Users}
                cor={brand.teal}
                corAcento={brand.tealMid}
                itens={[
                  "Dashboard Brasil Solar",
                  "Obras (cronograma + calendário)",
                  "Monitoramento de plantas",
                  "Relatórios mensais",
                ]}
              />
            )}
            {acesso.prop && (
              <CardModulo
                href={GERADOR_URL}
                external
                titulo="Gerador de Proposta"
                subtitulo="Sistema externo"
                descricao="Geração de propostas comerciais em PDF (solar, aquecimento, piscina)."
                icon={FileText}
                cor={brand.tealDark}
                corAcento={brand.teal}
                itens={[
                  "Clientes · Kits · Produtos",
                  "Nova proposta",
                  "Consulta de propostas",
                  "Configurações da empresa",
                ]}
              />
            )}
          </div>
        )}
      </main>

      <footer className="border-t bg-white mt-8">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-[#8A9298]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: brand.orange }} />
            <span>AURA · Gestão de Energia Sustentável</span>
          </div>
          <span>© 2026 Rede Brasil Solar</span>
        </div>
      </footer>
    </div>
  );
}

function CardModulo({
  href, external, titulo, subtitulo, descricao, icon: Icon, cor, corAcento, itens,
}: {
  href: string;
  external?: boolean;
  titulo: string;
  subtitulo: string;
  descricao: string;
  icon: typeof Zap;
  cor: string;
  corAcento: string;
  itens: string[];
}) {
  const body = (
    <div
      className="group bg-white border border-[#E5E5E0] rounded-2xl p-6 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg"
      style={{ ["--card-color" as string]: cor }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 shadow-sm"
        style={{ background: `linear-gradient(135deg, ${corAcento} 0%, ${cor} 100%)` }}
      >
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="text-lg font-bold leading-snug text-[#1A2A30]">
        {titulo}
        {subtitulo && <><br /><span className="text-[#8A9298] font-normal">{subtitulo}</span></>}
      </div>
      <p className="text-sm text-[#4B5A62] mt-2 leading-relaxed">{descricao}</p>
      <ul className="mt-4 space-y-1.5 text-sm text-[#4B5A62]">
        {itens.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full" style={{ background: cor }} />
            {item}
          </li>
        ))}
      </ul>
      <div
        className="mt-5 inline-flex items-center gap-1 text-sm font-semibold"
        style={{ color: cor }}
      >
        Entrar
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
      </div>
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    );
  }
  return <Link href={href}>{body}</Link>;
}
