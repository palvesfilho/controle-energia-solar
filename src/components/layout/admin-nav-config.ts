/**
 * Config compartilhada entre Sidebar (desktop) e MobileNav.
 * Toda alteração de item de menu admin deve ser feita aqui.
 */
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCheck,
  ShieldCheck,
  Plug,
  Receipt,
  SunMedium,
  FolderTree,
  MapPin,
  Wallet,
  Eye,
  CalendarCheck,
  CalendarRange,
  HardHat,
  ClipboardCheck,
  ClipboardList,
  PackageCheck,
  Settings2,
  Coins,
  Scale,
  PieChart,
  Activity,
  CalendarClock,
  TrendingUp,
  BarChart3,
  Zap,
  FileBarChart,
  Inbox,
  KeyboardIcon,
  MessageSquareHeart,
} from "lucide-react";
import { canAccessSection, type AdminSection } from "@/lib/roles";
import { UserRole } from "@/types/next-auth";

export type AdminModule = "assoc" | "bs" | "both";

export interface NavLeaf {
  kind: "leaf";
  module: AdminModule;
  section: AdminSection;
  title: string;
  href: string;
  icon: React.ElementType;
}

export interface NavGroup {
  kind: "group";
  module: AdminModule;
  section: AdminSection;
  title: string;
  icon: React.ElementType;
  children: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

export const MODULE_META = {
  assoc: { label: "Associação de Energia", icon: Zap, accent: "from-orange-500 to-amber-500" },
  bs: { label: "Brasil Solar", icon: SunMedium, accent: "from-teal-600 to-emerald-500" },
} as const;

/**
 * Detecta em qual módulo do AURA o user está navegando, baseado no path.
 * /admin/brasil-solar/* ou /admin/obra/* → módulo BS.
 * Caso contrário → módulo Associação (default).
 */
export function detectAdminModule(pathname: string): "assoc" | "bs" {
  if (pathname.startsWith("/admin/brasil-solar")) return "bs";
  if (pathname.startsWith("/admin/obra")) return "bs";
  return "assoc";
}

export const adminNavItems: NavEntry[] = [
  { kind: "leaf", module: "assoc", section: "dashboard", title: "Gestora de Energia", href: "/admin", icon: LayoutDashboard },
  { kind: "leaf", module: "assoc", section: "agenda", title: "Agenda da Semana", href: "/admin/agenda", icon: CalendarClock },
  // Folha única de propósito: quem usa é o pós-venda, que não enxerga o grupo
  // Gestão de Créditos. Ver [[feedback_menu_hub_pattern]].
  //
  // Existe nos DOIS módulos, com rotas e conteúdo diferentes: a Associação vê
  // só as adesões de desconto na fatura, a Brasil Solar vê monitoramento e
  // obra. Divisão fechada com o Paulo em 15/08/2026, implementada em
  // [[crm-modulo]].
  //
  // Não dá para usar `module: "both"` com uma rota só: `detectAdminModule` lê o
  // PATH, então `/admin/crm/fila` jogaria quem está na Brasil Solar de volta
  // para o sidebar da Associação.
  //
  // Folha única desde 15/08/2026: o de-para de produtos saiu daqui para
  // Personalizações — é configuração, não fila de trabalho. Sobrando um item
  // só, grupo vira folha. Ver [[feedback_menu_hub_pattern]].
  { kind: "leaf", module: "assoc", section: "crmIntegracao", title: "Vendas do CRM", href: "/admin/crm/fila", icon: Inbox },
  {
    kind: "group",
    module: "assoc",
    section: "investidores",
    title: "Investidores",
    icon: Users,
    children: [
      { kind: "leaf", module: "assoc", section: "investidores", title: "Cadastro", href: "/admin/investidores", icon: Users },
      { kind: "leaf", module: "assoc", section: "investidores", title: "Usinas", href: "/admin/usinas", icon: Building2 },
    ],
  },
  {
    kind: "group",
    module: "assoc",
    section: "clientes",
    title: "Clientes",
    icon: UserCheck,
    children: [
      { kind: "leaf", module: "assoc", section: "clientes", title: "Consumidores", href: "/admin/consumidores", icon: UserCheck },
      { kind: "leaf", module: "assoc", section: "clientes", title: "Unidades Consumidoras", href: "/admin/unidades-consumidoras", icon: Plug },
    ],
  },
  {
    kind: "group",
    module: "assoc",
    section: "gestaoCreditos",
    title: "Gestão de Créditos",
    icon: Coins,
    children: [
      { kind: "leaf", module: "assoc", section: "gestaoCreditos", title: "Análise", href: "/admin/gestao-creditos/analise", icon: Activity },
      { kind: "leaf", module: "assoc", section: "gestaoCreditos", title: "Balanço Mensal", href: "/admin/gestao-creditos/balanco-mensal", icon: Scale },
      { kind: "leaf", module: "assoc", section: "gestaoCreditos", title: "Rateios", href: "/admin/gestao-creditos/rateios", icon: PieChart },
    ],
  },
  {
    kind: "group",
    module: "assoc",
    section: "faturasEnergia",
    title: "Faturas de Energia",
    icon: Receipt,
    children: [
      { kind: "leaf", module: "assoc", section: "faturasEnergia", title: "Visão Geral", href: "/admin/faturas-energia", icon: Eye },
      { kind: "leaf", module: "assoc", section: "faturasEnergia", title: "Gestão Financeira", href: "/admin/faturas-energia/gestao-financeira", icon: Wallet },
      { kind: "leaf", module: "assoc", section: "faturasEnergia", title: "Fechamento Mensal", href: "/admin/faturas-energia/fechamento-mensal", icon: CalendarCheck },
    ],
  },
  {
    kind: "group",
    module: "assoc",
    section: "faturamento",
    title: "Faturamento",
    icon: Receipt,
    children: [
      { kind: "leaf", module: "assoc", section: "faturamento", title: "Usinas", href: "/admin/faturamento/usinas", icon: Building2 },
      { kind: "leaf", module: "assoc", section: "faturamento", title: "Unidades Consumidoras", href: "/admin/faturamento/unidades-consumidoras", icon: Plug },
      { kind: "leaf", module: "assoc", section: "faturamento", title: "Fechamento Investidores", href: "/admin/faturamento/fechamentos-investidor", icon: CalendarCheck },
      { kind: "leaf", module: "assoc", section: "faturamento", title: "Fechamento Financeiro", href: "/admin/faturamento/fechamento-financeiro", icon: TrendingUp },
    ],
  },
  {
    kind: "group",
    module: "bs",
    section: "brasilSolar",
    title: "Gestão Brasil Solar",
    icon: SunMedium,
    children: [
      { kind: "leaf", module: "bs", section: "brasilSolar", title: "Dashboard Mapa", href: "/admin/brasil-solar/mapa", icon: MapPin },
      { kind: "leaf", module: "bs", section: "brasilSolar", title: "Clientes Brasil Solar", href: "/admin/brasil-solar/proprietarios", icon: FolderTree },
      { kind: "leaf", module: "bs", section: "brasilSolar", title: "Plantas Fotovoltaicas", href: "/admin/brasil-solar", icon: SunMedium },
      { kind: "leaf", module: "bs", section: "brasilSolar", title: "Relatórios — Visão Geral", href: "/admin/brasil-solar/relatorios", icon: FileBarChart },
      { kind: "leaf", module: "bs", section: "brasilSolar", title: "Geração Manual", href: "/admin/brasil-solar/geracao-manual", icon: KeyboardIcon },
    ],
  },
  // Espelho da folha da Associação, com a rota sob /admin/brasil-solar/ para o
  // sidebar não trocar de módulo. Ver o comentário lá em cima.
  { kind: "leaf", module: "bs", section: "crmIntegracao", title: "Vendas do CRM", href: "/admin/brasil-solar/vendas-crm", icon: Inbox },
  // Mensagens (campanhas de push para o cliente). Mora sob /admin/brasil-solar/
  // pelo mesmo motivo da fila do CRM: `detectAdminModule` lê o PATH, e uma rota
  // fora daqui jogaria o operador para o sidebar da Associação no meio da
  // campanha. O público também é de lá — quem tem app e usina é o cliente BS.
  //
  // Folha única apontando para uma tela com abas (campanhas · interessados),
  // não grupo expansível. Ver [[feedback_menu_hub_pattern]].
  { kind: "leaf", module: "bs", section: "mensagens", title: "Mensagens", href: "/admin/brasil-solar/mensagens", icon: MessageSquareHeart },
  {
    kind: "group",
    module: "bs",
    section: "obra",
    title: "Obra",
    icon: HardHat,
    children: [
      { kind: "leaf", module: "bs", section: "obra", title: "Indicadores", href: "/admin/obra/indicadores", icon: BarChart3 },
      { kind: "leaf", module: "bs", section: "obra", title: "Gestão de Obra", href: "/admin/obra/gestao-obra", icon: ClipboardList },
      { kind: "leaf", module: "bs", section: "obra", title: "Obras Finalizadas", href: "/admin/obra/finalizadas", icon: PackageCheck },
      { kind: "leaf", module: "bs", section: "obra", title: "Aprovação de Obras", href: "/admin/obra/aprovacao", icon: ClipboardCheck },
      { kind: "leaf", module: "bs", section: "obra", title: "Cronograma de Obras", href: "/admin/obra/cronograma", icon: CalendarRange },
      { kind: "leaf", module: "bs", section: "obra", title: "Calendário de Obras", href: "/admin/obra/calendario", icon: CalendarCheck },
    ],
  },
  { kind: "leaf", module: "both", section: "personalizacoesHub", title: "Personalizações", href: "/admin/personalizacoes", icon: Settings2 },
];

export const userManagementItem: NavLeaf = {
  kind: "leaf",
  module: "both",
  section: "usuarios",
  title: "Usuários",
  href: "/admin/usuarios",
  icon: ShieldCheck,
};

function itemMatchesModule(itemModule: AdminModule, currentModule: "assoc" | "bs"): boolean {
  return itemModule === "both" || itemModule === currentModule;
}

function filterAdminNavItems(
  items: NavEntry[],
  role: UserRole,
  currentModule: "assoc" | "bs",
): NavEntry[] {
  const out: NavEntry[] = [];
  for (const item of items) {
    if (!itemMatchesModule(item.module, currentModule)) continue;
    if (item.kind === "leaf") {
      if (canAccessSection(role, item.section)) out.push(item);
    } else {
      if (!canAccessSection(role, item.section)) continue;
      const visibleChildren = item.children.filter((c) =>
        canAccessSection(role, c.section),
      );
      if (visibleChildren.length > 0) {
        out.push({ ...item, children: visibleChildren });
      }
    }
  }
  return out;
}

export function getAdminItems(role: UserRole, currentModule: "assoc" | "bs"): NavEntry[] {
  const base = filterAdminNavItems(adminNavItems, role, currentModule);
  if (canAccessSection(role, "usuarios")) {
    return [...base, userManagementItem];
  }
  return base;
}

/**
 * Todos os hrefs do menu admin, do mais específico pro mais genérico.
 *
 * Existe porque alguns itens são prefixo de outros: "Plantas Fotovoltaicas"
 * mora em `/admin/brasil-solar`, que é prefixo de `/admin/brasil-solar/proprietarios`
 * ("Clientes Brasil Solar"). Sem desempate, um `startsWith` acende os dois.
 */
const TODOS_OS_HREFS: string[] = (() => {
  const hrefs = new Set<string>([userManagementItem.href]);
  for (const item of adminNavItems) {
    if (item.kind === "leaf") hrefs.add(item.href);
    else for (const child of item.children) hrefs.add(child.href);
  }
  return Array.from(hrefs).sort((a, b) => b.length - a.length);
})();

/** Casamento por segmento: `/admin/obra` não pode casar com `/admin/obras`. */
function cobre(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Um item fica aceso só quando é o href MAIS ESPECÍFICO que cobre a rota atual.
 * Em `/admin/brasil-solar/proprietarios/123` quem acende é "Clientes Brasil
 * Solar" — não "Plantas Fotovoltaicas", que só cobre o prefixo.
 */
export function isLeafActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/admin" || href === "/painel") return false;
  if (!cobre(pathname, href)) return false;
  // Perde pra qualquer href mais longo que também cubra a rota.
  return !TODOS_OS_HREFS.some(
    (outro) => outro.length > href.length && cobre(pathname, outro),
  );
}

export function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.children.some((child) => isLeafActive(pathname, child.href));
}
