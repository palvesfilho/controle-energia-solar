import Link from "next/link";
import {
  HardHat,
  Users,
  Settings2,
  ArrowRight,
  ShieldAlert,
  Mail,
  Wrench,
  FileText,
  KeyRound,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection, type AdminSection } from "@/lib/roles";

interface HubItem {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  group:
    | "Obras"
    | "Clientes"
    | "Financeiro"
    | "Monitoramento"
    | "ConcessionÃ¡rias";
  accent: string;
  section: AdminSection;
}

const items: HubItem[] = [
  {
    title: "PadrÃµes de materiais",
    description:
      "EspecificaÃ§Ãµes padrÃ£o por potÃªncia do inversor (disjuntor, cabos, DPS, barramento, placas e observaÃ§Ãµes).",
    href: "/admin/personalizacoes/obras",
    icon: HardHat,
    group: "Obras",
    accent: "from-orange-500 to-amber-600",
    section: "persObras",
  },
  {
    title: "Equipes de execuÃ§Ã£o",
    description:
      "Cadastro das equipes de campo e contato do responsÃ¡vel. Usadas na alocaÃ§Ã£o de obras.",
    href: "/admin/personalizacoes/equipes",
    icon: Users,
    group: "Obras",
    accent: "from-blue-500 to-indigo-600",
    section: "persEquipes",
  },
  {
    title: "Alertas de usinas",
    description:
      "Configure quais erros das usinas serÃ£o monitorados e o nÃ­vel de severidade de cada limite (crÃ­tico, mÃ©dio, baixo).",
    href: "/admin/personalizacoes/alertas-usinas",
    icon: ShieldAlert,
    group: "Monitoramento",
    accent: "from-amber-500 to-red-600",
    section: "persAlertasUsinas",
  },
  {
    title: "CÃ³digos de erro do inversor",
    description:
      "Base de conhecimento dos cÃ³digos por fabricante (Fronius, SolarEdge, Sungrow, Huawei) com aÃ§Ãµes sugeridas pro time de pÃ³s-venda.",
    href: "/admin/personalizacoes/codigos-erro-inversor",
    icon: Wrench,
    group: "Monitoramento",
    accent: "from-blue-500 to-indigo-700",
    section: "persCodigosErroView",
  },
  {
    title: "Emails das concessionÃ¡rias",
    description:
      "Cadastro de emails (destino, remetente e cÃ³pia) usados para enviar rateios Ã s distribuidoras de energia.",
    href: "/admin/personalizacoes/distribuidora-emails",
    icon: Mail,
    group: "ConcessionÃ¡rias",
    accent: "from-indigo-500 to-indigo-700",
    section: "persDistribuidoraEmails",
  },
  {
    title: "ParÃ¢metros do relatÃ³rio",
    description:
      "Reajuste anual de tarifa e depreciaÃ§Ã£o dos mÃ³dulos usados no cÃ¡lculo de payback dos relatÃ³rios Brasil Solar.",
    href: "/admin/personalizacoes/relatorio-parametros",
    icon: FileText,
    group: "Financeiro",
    accent: "from-emerald-500 to-teal-700",
    section: "persRelatorioParametros",
  },
  {
    title: "Acesso ao portal do cliente",
    description:
      "Valores de tabela (mensal e anual) cobrados no convite de acesso ao portal do cliente Brasil Solar. Base do modo personalizado e piso mínimo.",
    href: "/admin/personalizacoes/acesso-portal",
    icon: KeyRound,
    group: "Financeiro",
    accent: "from-teal-500 to-cyan-700",
    section: "persAcessoPortal",
  },
];

const GROUPS: Array<HubItem["group"]> = [
  "Obras",
  "Clientes",
  "Financeiro",
  "Monitoramento",
  "ConcessionÃ¡rias",
];

export default async function PersonalizacoesHubPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? "";
  const visibleItems = items.filter((it) => canAccessSection(role, it.section));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-white">
          <Settings2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">PersonalizaÃ§Ãµes</h1>
          <p className="text-sm text-muted-foreground">
            Configure os padrÃµes e cadastros que alimentam os fluxos
            operacionais do sistema.
          </p>
        </div>
      </div>

      {GROUPS.map((group) => {
        const groupItems = visibleItems.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groupItems.map((it) => (
                <Link key={it.href} href={it.href} className="group">
                  <Card className="h-full transition-colors hover:border-primary/60 hover:shadow-sm">
                    <CardContent className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${it.accent} text-white`}
                        >
                          <it.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold">{it.title}</h3>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {it.description}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
