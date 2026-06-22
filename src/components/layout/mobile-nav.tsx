"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileBarChart,
  User,
  Sparkles,
  ChevronDown,
  ArrowLeftRight,
} from "lucide-react";
import { useState } from "react";
import { UserRole } from "@/types/next-auth";
import {
  detectAdminModule,
  getAdminItems,
  isGroupActive,
  isLeafActive,
  MODULE_META,
} from "@/components/layout/admin-nav-config";

const investorNavItems: Array<{ title: string; href: string; icon: React.ElementType }> = [
  { title: "Visão Geral", href: "/painel", icon: LayoutDashboard },
  { title: "Relatórios", href: "/relatorios", icon: FileBarChart },
  { title: "Meu Perfil", href: "/perfil", icon: User },
];

const consumerNavItems: Array<{ title: string; href: string; icon: React.ElementType }> = [
  { title: "Visão Geral", href: "/painel", icon: LayoutDashboard },
  { title: "Meu Perfil", href: "/perfil", icon: User },
];

export function MobileNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  const isInvestor = role === "INVESTOR";
  const isConsumer = role === "CONSUMER";
  const simpleItems = isInvestor ? investorNavItems : isConsumer ? consumerNavItems : null;
  const currentModule = detectAdminModule(pathname);
  const adminItems = simpleItems ? [] : getAdminItems(role, currentModule);
  const moduleMeta = MODULE_META[currentModule];
  const ModuleIcon = moduleMeta.icon;

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
        <Link href="/portal" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-600 to-emerald-600 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold">AURA</span>
        </Link>
      </div>

      {/* Módulo atual (só pra admin) */}
      {!simpleItems && (
        <div className="px-3 pt-3">
          <Link
            href="/portal"
            title="Trocar de módulo"
            className="group flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-2.5 py-2 hover:bg-sidebar-accent transition-colors"
          >
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white", moduleMeta.accent)}>
              <ModuleIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Módulo</div>
              <div className="text-xs font-semibold text-sidebar-foreground truncate">{moduleMeta.label}</div>
            </div>
            <ArrowLeftRight className="h-3.5 w-3.5 text-sidebar-foreground/40 group-hover:text-sidebar-foreground/80 transition-colors" />
          </Link>
        </div>
      )}

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
                  <item.icon className={cn("h-5 w-5", isActive && "text-sidebar-primary")} />
                  <span>{item.title}</span>
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
                    <item.icon className={cn("h-5 w-5", isActive && "text-sidebar-primary")} />
                    <span>{item.title}</span>
                  </Link>
                );
              }

              const groupActive = isGroupActive(pathname, item);
              const isOpen = openGroups[item.title] ?? groupActive;

              return (
                <div key={item.title} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.title)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      groupActive
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5", groupActive && "text-sidebar-primary")} />
                    <span className="flex-1 text-left">{item.title}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isOpen ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </button>

                  {isOpen && (
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
                            <child.icon className={cn("h-4 w-4", childActive && "text-sidebar-primary")} />
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
    </div>
  );
}
