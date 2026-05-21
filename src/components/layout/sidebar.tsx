"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileBarChart,
  User,
  Users,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  Settings2,
  Coins,
  Scale,
  PieChart,
  CalendarClock,
} from "lucide-react";
import { useState } from "react";
import { UserRole } from "@/types/next-auth";
import { canAccessSection, type AdminSection } from "@/lib/roles";

interface NavLeaf {
  kind: "leaf";
  section: AdminSection;
  title: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  kind: "group";
  section: AdminSection;
  title: string;
  icon: React.ElementType;
  children: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

const investorNavItems: Array<{ title: string; href: string; icon: React.ElementType }> = [
  { title: "Visão Geral", href: "/painel", icon: LayoutDashboard },
  { title: "Relatórios", href: "/relatorios", icon: FileBarChart },
  { title: "Meu Perfil", href: "/perfil", icon: User },
];

const consumerNavItems: Array<{ title: string; href: string; icon: React.ElementType }> = [
  { title: "Visão Geral", href: "/painel", icon: LayoutDashboard },
  { title: "Meu Perfil", href: "/perfil", icon: User },
];

const adminNavItems: NavEntry[] = [
  { kind: "leaf", section: "dashboard", title: "Gestora de Energia", href: "/admin", icon: LayoutDashboard },
  { kind: "leaf", section: "agenda", title: "Agenda da Semana", href: "/admin/agenda", icon: CalendarClock },
  {
    kind: "group",
    section: "investidores",
    title: "Investidores",
    icon: Users,
    children: [
      { kind: "leaf", section: "investidores", title: "Cadastro", href: "/admin/investidores", icon: Users },
      { kind: "leaf", section: "investidores", title: "Usinas", href: "/admin/usinas", icon: Building2 },
    ],
  },
  {
    kind: "group",
    section: "clientes",
    title: "Clientes",
    icon: UserCheck,
    children: [
      { kind: "leaf", section: "clientes", title: "Consumidores", href: "/admin/consumidores", icon: UserCheck },
      { kind: "leaf", section: "clientes", title: "Unidades Consumidoras", href: "/admin/unidades-consumidoras", icon: Plug },
    ],
  },
  {
    kind: "group",
    section: "gestaoCreditos",
    title: "Gestão de Créditos",
    icon: Coins,
    children: [
      { kind: "leaf", section: "gestaoCreditos", title: "Balanço Mensal", href: "/admin/gestao-creditos/balanco-mensal", icon: Scale },
      { kind: "leaf", section: "gestaoCreditos", title: "Rateios", href: "/admin/gestao-creditos/rateios", icon: PieChart },
    ],
  },
  {
    kind: "group",
    section: "faturasEnergia",
    title: "Faturas de Energia",
    icon: Receipt,
    children: [
      { kind: "leaf", section: "faturasEnergia", title: "Visão Geral", href: "/admin/faturas-energia", icon: Eye },
      { kind: "leaf", section: "faturasEnergia", title: "Gestão Financeira", href: "/admin/faturas-energia/gestao-financeira", icon: Wallet },
      { kind: "leaf", section: "faturasEnergia", title: "Fechamento Mensal", href: "/admin/faturas-energia/fechamento-mensal", icon: CalendarCheck },
    ],
  },
  {
    kind: "group",
    section: "faturamento",
    title: "Faturamento",
    icon: Receipt,
    children: [
      { kind: "leaf", section: "faturamento", title: "Usinas", href: "/admin/faturamento/usinas", icon: Building2 },
      { kind: "leaf", section: "faturamento", title: "Unidades Consumidoras", href: "/admin/faturamento/unidades-consumidoras", icon: Plug },
      { kind: "leaf", section: "faturamento", title: "Fechamento Investidores", href: "/admin/faturamento/fechamentos-investidor", icon: CalendarCheck },
    ],
  },
  {
    kind: "group",
    section: "brasilSolar",
    title: "Gestão Brasil Solar",
    icon: SunMedium,
    children: [
      { kind: "leaf", section: "brasilSolar", title: "Dashboard Mapa", href: "/admin/brasil-solar/mapa", icon: MapPin },
      { kind: "leaf", section: "brasilSolar", title: "Clientes Brasil Solar", href: "/admin/brasil-solar/proprietarios", icon: FolderTree },
      { kind: "leaf", section: "brasilSolar", title: "Plantas Fotovoltaicas", href: "/admin/brasil-solar", icon: SunMedium },
      { kind: "leaf", section: "brasilSolar", title: "Relatórios — Visão Geral", href: "/admin/brasil-solar/relatorios", icon: FileBarChart },
    ],
  },
  {
    kind: "group",
    section: "obra",
    title: "Obra",
    icon: HardHat,
    children: [
      { kind: "leaf", section: "obra", title: "Gestão de Obra", href: "/admin/obra/gestao-obra", icon: ClipboardList },
      { kind: "leaf", section: "obra", title: "Aprovação de Obras", href: "/admin/obra/aprovacao", icon: ClipboardCheck },
      { kind: "leaf", section: "obra", title: "Cronograma de Obras", href: "/admin/obra/cronograma", icon: CalendarRange },
      { kind: "leaf", section: "obra", title: "Calendário de Obras", href: "/admin/obra/calendario", icon: CalendarCheck },
    ],
  },
  { kind: "leaf", section: "personalizacoesHub", title: "Personalizações", href: "/admin/personalizacoes", icon: Settings2 },
];

const userManagementItem: NavLeaf = {
  kind: "leaf",
  section: "usuarios",
  title: "Usuários",
  href: "/admin/usuarios",
  icon: ShieldCheck,
};

function filterAdminNavItems(items: NavEntry[], role: UserRole): NavEntry[] {
  const out: NavEntry[] = [];
  for (const item of items) {
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

function getAdminItems(role: UserRole): NavEntry[] {
  const base = filterAdminNavItems(adminNavItems, role);
  if (canAccessSection(role, "usuarios")) {
    return [...base, userManagementItem];
  }
  return base;
}

function isLeafActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/admin" || href === "/painel") return false;
  return pathname.startsWith(href);
}

function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.children.some((child) => isLeafActive(pathname, child.href));
}

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  const isInvestor = role === "INVESTOR";
  const isConsumer = role === "CONSUMER";
  const simpleItems = isInvestor ? investorNavItems : isConsumer ? consumerNavItems : null;
  const adminItems = simpleItems ? [] : getAdminItems(role);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-green-600 to-emerald-600 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold text-sidebar-foreground">JECA</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {simpleItems
          ? simpleItems.map((item) => {
              const isActive = isLeafActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-primary")} />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              );
            })
          : adminItems.map((item) => {
              if (item.kind === "leaf") {
                const isActive = isLeafActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-primary")} />
                    {!collapsed && <span>{item.title}</span>}
                  </Link>
                );
              }

              const groupActive = isGroupActive(pathname, item);
              const isOpen = openGroups[item.title] ?? groupActive;

              return (
                <div key={item.title} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => !collapsed && toggleGroup(item.title)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      groupActive
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5 shrink-0", groupActive && "text-sidebar-primary")} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{item.title}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isOpen ? "rotate-0" : "-rotate-90"
                          )}
                        />
                      </>
                    )}
                  </button>

                  {!collapsed && isOpen && (
                    <div className="ml-4 space-y-1 border-l border-sidebar-border pl-2">
                      {item.children.map((child) => {
                        const childActive = isLeafActive(pathname, child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                              childActive
                                ? "bg-sidebar-accent text-sidebar-primary font-medium"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            )}
                          >
                            <child.icon className={cn("h-4 w-4 shrink-0", childActive && "text-sidebar-primary")} />
                            <span>{child.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>
    </aside>
  );
}
