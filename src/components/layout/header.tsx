"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { MobileNav } from "./mobile-nav";
import { UserRole } from "@/types/next-auth";

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  FINANCEIRO: "Financeiro",
  POS_VENDA: "Pós-Venda",
  GESTOR_OBRA: "Gestor de Obras",
  INVESTOR: "Investidor",
  CONSUMER: "Consumidor",
};

const PANEL_TITLES: Record<UserRole, string> = {
  ADMIN: "Painel Administrativo",
  GESTOR: "Painel de Gestão",
  FINANCEIRO: "Painel Financeiro",
  POS_VENDA: "Painel de Pós-Venda",
  GESTOR_OBRA: "Painel de Obras",
  INVESTOR: "Portal do Investidor",
  CONSUMER: "Portal do Consumidor",
};

const MOTIVATIONAL_MESSAGES = [
  "O sol nasce para todos — que seu dia brilhe também.",
  "Cada kWh economizado é um passo para um futuro mais limpo.",
  "Grandes resultados nascem de pequenas ações diárias.",
  "Energia boa atrai energia boa. Bom trabalho!",
  "Transformar luz em valor é a sua missão hoje.",
  "Foco, disciplina e constância — o resto é consequência.",
  "Todo dia é um novo começo. Aproveite essa energia.",
  "Cuidar do hoje é investir no amanhã.",
  "Pequenos ajustes geram grandes economias.",
  "Seu trabalho ilumina a vida de muitas pessoas.",
  "Que hoje você colha os frutos do que plantou ontem.",
  "Persistência é o combustível de quem chega longe.",
  "Energia renovável começa com atitudes renovadas.",
  "Acredite no processo — os resultados virão.",
  "Um bom gestor transforma desafios em oportunidades.",
];

export function Header({ role }: { role: UserRole }) {
  const { data: session } = useSession();
  const [motivation, setMotivation] = useState<string | null>(null);

  useEffect(() => {
    const idx = Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length);
    setMotivation(MOTIVATIONAL_MESSAGES[idx]);
  }, []);

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-4 md:px-6">
      {/* Mobile menu */}
      <div className="flex items-center gap-3 md:hidden">
        <Sheet>
          <SheetTrigger render={<Button variant="ghost" size="icon" />}>
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <MobileNav role={role} />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-bold text-sm">AURA</span>
        </div>
      </div>

      {/* Desktop title area */}
      <div className="hidden md:flex flex-col min-w-0 pr-4">
        <h2 className="text-sm text-muted-foreground">
          {PANEL_TITLES[role] || "Painel"}
        </h2>
        {motivation && (
          <p className="text-xs text-green-700 italic truncate max-w-xl">
            “{motivation}”
          </p>
        )}
      </div>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-3 outline-none">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium">{session?.user?.name}</span>
            <Badge
              variant="secondary"
              className="text-[10px] h-5"
            >
              {ROLE_LABELS[role] || role}
            </Badge>
          </div>
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-green-100 text-green-700 text-sm font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="gap-2">
            <User className="h-4 w-4" />
            Meu Perfil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-red-600"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
