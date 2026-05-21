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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getServerSession } from "next-auth";
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
    | "Concessionárias";
  accent: string;
  section: AdminSection;
}

const items: HubItem[] = [
  {
    title: "Padrões de materiais",
    description:
      "Especificações padrão por potência do inversor (disjuntor, cabos, DPS, barramento, placas e observações).",
    href: "/admin/personalizacoes/obras",
    icon: HardHat,
    group: "Obras",
    accent: "from-orange-500 to-amber-600",
    section: "persObras",
  },
  {
    title: "Equipes de execução",
    description:
      "Cadastro das equipes de campo e contato do responsável. Usadas na alocação de obras.",
    href: "/admin/personalizacoes/equipes",
    icon: Users,
    group: "Obras",
    accent: "from-blue-500 to-indigo-600",
    section: "persEquipes",
  },
  {
    title: "Alertas de usinas",
    description:
      "Configure quais erros das usinas serão monitorados e o nível de severidade de cada limite (crítico, médio, baixo).",
    href: "/admin/personalizacoes/alertas-usinas",
    icon: ShieldAlert,
    group: "Monitoramento",
    accent: "from-amber-500 to-red-600",
    section: "persAlertasUsinas",
  },
  {
    title: "Códigos de erro do inversor",
    description:
      "Base de conhecimento dos códigos por fabricante (Fronius, SolarEdge, Sungrow, Huawei) com ações sugeridas pro time de pós-venda.",
    href: "/admin/personalizacoes/codigos-erro-inversor",
    icon: Wrench,
    group: "Monitoramento",
    accent: "from-blue-500 to-indigo-700",
    section: "persCodigosErroView",
  },
  {
    title: "Emails das concessionárias",
    description:
      "Cadastro de emails (destino, remetente e cópia) usados para enviar rateios às distribuidoras de energia.",
    href: "/admin/personalizacoes/distribuidora-emails",
    icon: Mail,
    group: "Concessionárias",
    accent: "from-indigo-500 to-indigo-700",
    section: "persDistribuidoraEmails",
  },
  {
    title: "Parâmetros do relatório",
    description:
      "Reajuste anual de tarifa e depreciação dos módulos usados no cálculo de payback dos relatórios Brasil Solar.",
    href: "/admin/personalizacoes/relatorio-parametros",
    icon: FileText,
    group: "Financeiro",
    accent: "from-emerald-500 to-teal-700",
    section: "persRelatorioParametros",
  },
];

const GROUPS: Array<HubItem["group"]> = [
  "Obras",
  "Clientes",
  "Financeiro",
  "Monitoramento",
  "Concessionárias",
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
          <h1 className="text-2xl font-bold">Personalizações</h1>
          <p className="text-sm text-muted-foreground">
            Configure os padrões e cadastros que alimentam os fluxos
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
