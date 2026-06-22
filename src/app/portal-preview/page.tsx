"use client";

import { useState, useMemo } from "react";
import {
  Leaf,
  Zap,
  Users,
  FileText,
  ArrowRight,
  RotateCcw,
  LogOut,
  LayoutDashboard,
  CalendarClock,
  UserCheck,
  Building2,
  Plug,
  Coins,
  Activity,
  Scale,
  PieChart,
  Receipt,
  Eye,
  Wallet,
  CalendarCheck,
  TrendingUp,
  SunMedium,
  MapPin,
  FolderTree,
  FileBarChart,
  HardHat,
  BarChart3,
  ClipboardList,
  PackageCheck,
  ClipboardCheck,
  CalendarRange,
  Settings2,
  ShieldCheck,
  ChevronDown,
  Mail,
  Wrench,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { brand, brandGradient } from "@/lib/brand-colors";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Role =
  | "admin"
  | "gestor"
  | "financeiro"
  | "operador"
  | "POS_VENDA"
  | "GESTOR_OBRA"
  | "orcamentista"
  | "vendedor";

type View = "portal" | "modulo-assoc" | "modulo-bs";

type AcessoModulo = {
  assoc: string | null;
  bs: string | null;
  prop: string | null;
};

const acessos: Record<Role, AcessoModulo> = {
  admin: { assoc: "admin", bs: "admin", prop: "admin" },
  gestor: { assoc: "gestor", bs: "gestor", prop: "admin" },
  financeiro: { assoc: "financeiro", bs: null, prop: null },
  operador: { assoc: "operador", bs: null, prop: null },
  POS_VENDA: { assoc: null, bs: "POS_VENDA", prop: "pós venda" },
  GESTOR_OBRA: { assoc: null, bs: "GESTOR_OBRA", prop: null },
  orcamentista: { assoc: null, bs: null, prop: "orçamentista" },
  vendedor: { assoc: null, bs: null, prop: "vendedor" },
};

type MenuItem = {
  id: string;
  titulo: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  children?: { id: string; titulo: string; roles: Role[] }[];
};

const menuAssoc: MenuItem[] = [
  { id: "dashboard", titulo: "Gestora de Energia", icon: LayoutDashboard, roles: ["admin", "gestor", "financeiro", "operador"] },
  { id: "agenda", titulo: "Agenda da Semana", icon: CalendarClock, roles: ["admin", "gestor", "financeiro", "operador"] },
  {
    id: "investidores",
    titulo: "Investidores",
    icon: Users,
    roles: ["admin", "gestor", "financeiro", "operador"],
    children: [
      { id: "inv-cad", titulo: "Cadastro", roles: ["admin", "gestor", "financeiro", "operador"] },
      { id: "inv-usinas", titulo: "Usinas", roles: ["admin", "gestor", "financeiro", "operador"] },
    ],
  },
  {
    id: "clientes",
    titulo: "Clientes",
    icon: UserCheck,
    roles: ["admin", "gestor", "financeiro", "operador"],
    children: [
      { id: "cli-cons", titulo: "Consumidores", roles: ["admin", "gestor", "financeiro", "operador"] },
      { id: "cli-ucs", titulo: "Unidades Consumidoras", roles: ["admin", "gestor", "financeiro", "operador"] },
    ],
  },
  {
    id: "creditos",
    titulo: "Gestão de Créditos",
    icon: Coins,
    roles: ["admin", "gestor", "financeiro", "operador"],
    children: [
      { id: "cr-analise", titulo: "Análise", roles: ["admin", "gestor", "operador"] },
      { id: "cr-balanco", titulo: "Balanço Mensal", roles: ["admin", "gestor", "financeiro"] },
      { id: "cr-rateios", titulo: "Rateios", roles: ["admin", "gestor", "operador"] },
    ],
  },
  {
    id: "faturas",
    titulo: "Faturas de Energia",
    icon: Receipt,
    roles: ["admin", "gestor", "financeiro", "operador"],
    children: [
      { id: "fe-vg", titulo: "Visão Geral", roles: ["admin", "gestor", "financeiro", "operador"] },
      { id: "fe-gf", titulo: "Gestão Financeira", roles: ["admin", "gestor", "financeiro"] },
      { id: "fe-fm", titulo: "Fechamento Mensal", roles: ["admin", "gestor", "financeiro"] },
    ],
  },
  {
    id: "faturamento",
    titulo: "Faturamento",
    icon: Receipt,
    roles: ["admin", "gestor", "financeiro"],
    children: [
      { id: "fa-usinas", titulo: "Usinas", roles: ["admin", "gestor", "financeiro"] },
      { id: "fa-ucs", titulo: "Unidades Consumidoras", roles: ["admin", "gestor", "financeiro"] },
      { id: "fa-fi", titulo: "Fechamento Investidores", roles: ["admin", "gestor", "financeiro"] },
      { id: "fa-ff", titulo: "Fechamento Financeiro", roles: ["admin", "gestor"] },
    ],
  },
  { id: "person", titulo: "Personalizações", icon: Settings2, roles: ["admin", "gestor", "financeiro", "operador"] },
  { id: "users", titulo: "Usuários", icon: ShieldCheck, roles: ["admin"] },
];

const menuBs: MenuItem[] = [
  {
    id: "bs-main",
    titulo: "Gestão Brasil Solar",
    icon: SunMedium,
    roles: ["admin", "gestor", "POS_VENDA", "GESTOR_OBRA"],
    children: [
      { id: "bs-mapa", titulo: "Dashboard Mapa", roles: ["admin", "gestor", "POS_VENDA", "GESTOR_OBRA"] },
      { id: "bs-prop", titulo: "Clientes Brasil Solar", roles: ["admin", "gestor", "POS_VENDA", "GESTOR_OBRA"] },
      { id: "bs-plant", titulo: "Plantas Fotovoltaicas", roles: ["admin", "gestor", "POS_VENDA"] },
      { id: "bs-rel", titulo: "Relatórios — Visão Geral", roles: ["admin", "gestor", "POS_VENDA"] },
    ],
  },
  {
    id: "obra",
    titulo: "Obra",
    icon: HardHat,
    roles: ["admin", "gestor", "GESTOR_OBRA", "POS_VENDA"],
    children: [
      { id: "ob-ind", titulo: "Indicadores", roles: ["admin", "gestor", "GESTOR_OBRA"] },
      { id: "ob-ges", titulo: "Gestão de Obra", roles: ["admin", "gestor", "GESTOR_OBRA", "POS_VENDA"] },
      { id: "ob-fin", titulo: "Obras Finalizadas", roles: ["admin", "gestor", "GESTOR_OBRA", "POS_VENDA"] },
      { id: "ob-apr", titulo: "Aprovação de Obras", roles: ["admin", "gestor"] },
      { id: "ob-cro", titulo: "Cronograma de Obras", roles: ["admin", "gestor", "GESTOR_OBRA"] },
      { id: "ob-cal", titulo: "Calendário de Obras", roles: ["admin", "gestor", "GESTOR_OBRA", "POS_VENDA"] },
    ],
  },
  { id: "person", titulo: "Personalizações", icon: Settings2, roles: ["admin", "gestor", "GESTOR_OBRA", "POS_VENDA"] },
  { id: "users", titulo: "Usuários", icon: ShieldCheck, roles: ["admin"] },
];

type Personalizacao = {
  id: string;
  titulo: string;
  desc: string;
  icon: typeof Settings2;
  modulos: Array<"assoc" | "bs">;
  roles: Role[];
};

const personalizacoes: Personalizacao[] = [
  { id: "p-rel", titulo: "Parâmetros de Relatório", desc: "Logo, cores e textos dos PDFs emitidos.", icon: FileText, modulos: ["assoc", "bs"], roles: ["admin", "gestor"] },
  { id: "p-distr", titulo: "Distribuidora & Emails", desc: "Templates de email enviados pra RGE/CPFL.", icon: Mail, modulos: ["assoc"], roles: ["admin", "gestor", "operador", "financeiro"] },
  { id: "p-equipes", titulo: "Equipes de Obra", desc: "Equipes responsáveis por cada cronograma.", icon: Users, modulos: ["bs"], roles: ["admin", "gestor", "GESTOR_OBRA"] },
  { id: "p-obras", titulo: "Templates de Tarefa (Obra)", desc: "Modelos de tarefas que geram automaticamente.", icon: Wrench, modulos: ["bs"], roles: ["admin", "gestor", "GESTOR_OBRA"] },
  { id: "p-alertas", titulo: "Alertas de Usinas", desc: "Regras de alerta de geração e indisponibilidade.", icon: Bell, modulos: ["bs"], roles: ["admin", "gestor"] },
  { id: "p-erros", titulo: "Códigos de Erro de Inversor", desc: "Base de conhecimento por fabricante.", icon: AlertTriangle, modulos: ["bs"], roles: ["admin", "gestor"] },
];

function filtrarMenu(menu: MenuItem[], role: Role): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of menu) {
    if (!item.roles.includes(role)) continue;
    if (item.children) {
      const visiveis = item.children.filter((c) => c.roles.includes(role));
      if (visiveis.length === 0) continue;
      out.push({ ...item, children: visiveis });
    } else {
      out.push(item);
    }
  }
  return out;
}

export default function PortalPreviewPage() {
  const [view, setView] = useState<View>("portal");
  const [role, setRole] = useState<Role>("admin");
  const [itemAtual, setItemAtual] = useState<string>("dashboard");
  const [itemTitulo, setItemTitulo] = useState<string>("Gestora de Energia");
  const [grupoTitulo, setGrupoTitulo] = useState<string | null>(null);

  const acesso = acessos[role];

  function entrarModulo(mod: "assoc" | "bs" | "prop") {
    if (mod === "prop") {
      window.open("https://gerador-proposta-rbs-production.up.railway.app/login", "_blank");
      return;
    }
    const menu = mod === "assoc" ? menuAssoc : menuBs;
    const filtrado = filtrarMenu(menu, role);
    const primeiro = filtrado[0];
    if (!primeiro) return;
    const primeiroChild = primeiro.children?.[0];
    setItemAtual(primeiroChild?.id || primeiro.id);
    setItemTitulo(primeiroChild?.titulo || primeiro.titulo);
    setGrupoTitulo(primeiroChild ? primeiro.titulo : null);
    setView(mod === "assoc" ? "modulo-assoc" : "modulo-bs");
  }

  function selecionarItem(itemId: string, titulo: string, grupo: string | null) {
    setItemAtual(itemId);
    setItemTitulo(titulo);
    setGrupoTitulo(grupo);
  }

  if (view === "portal") {
    return <TelaPortal role={role} setRole={setRole} acesso={acesso} onEntrar={entrarModulo} />;
  }

  const mod = view === "modulo-assoc" ? "assoc" : "bs";
  const menu = mod === "assoc" ? menuAssoc : menuBs;
  return (
    <TelaModulo
      mod={mod}
      menuFiltrado={filtrarMenu(menu, role)}
      itemAtual={itemAtual}
      itemTitulo={itemTitulo}
      grupoTitulo={grupoTitulo}
      role={role}
      setRole={setRole}
      onTrocarModulo={() => setView("portal")}
      onSelecionarItem={selecionarItem}
    />
  );
}

// ============================================================
// BARRA DE PREVIEW (não faz parte do design final)
// ============================================================
function PreviewBar({ role, setRole, onReset }: { role: Role; setRole: (r: Role) => void; onReset?: () => void }) {
  const roles: Role[] = ["admin", "gestor", "financeiro", "operador", "POS_VENDA", "GESTOR_OBRA", "orcamentista", "vendedor"];
  return (
    <div className="bg-foreground text-background px-4 py-2 text-xs flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <span className="bg-[var(--orange)] text-white px-2 py-0.5 rounded font-semibold" style={{ background: brand.orange }}>
          PREVIEW
        </span>
        <span className="opacity-70">Portal AURA — mockup com componentes reais</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="opacity-70">Visualizar como:</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="bg-background/10 text-background border border-background/20 rounded px-2 py-1 text-xs"
        >
          {roles.map((r) => (
            <option key={r} value={r} className="text-foreground">{r}</option>
          ))}
        </select>
        {onReset && (
          <button onClick={onReset} className="opacity-70 hover:opacity-100 ml-2 flex items-center gap-1">
            <RotateCcw className="size-3" /> portal
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TELA 1 — PORTAL (escolha de módulo)
// ============================================================
function TelaPortal({ role, setRole, acesso, onEntrar }: {
  role: Role;
  setRole: (r: Role) => void;
  acesso: AcessoModulo;
  onEntrar: (mod: "assoc" | "bs" | "prop") => void;
}) {
  const visiveis = [acesso.assoc, acesso.bs, acesso.prop].filter(Boolean).length;
  const gridCols = visiveis === 1
    ? "grid-cols-1 max-w-md mx-auto"
    : visiveis === 2
    ? "grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto"
    : "grid-cols-1 md:grid-cols-3";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PreviewBar role={role} setRole={setRole} />

      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ background: brandGradient }}
            >
              <Leaf className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="font-heading font-bold text-foreground leading-tight tracking-tight">AURA</div>
              <div className="text-xs text-muted-foreground">Portal corporativo</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">Paulo Silva</div>
              <div className="text-xs text-muted-foreground">
                paulo@solvesm.eng.br · <span className="font-medium" style={{ color: brand.tealDark }}>{role}</span>
              </div>
            </div>
            <Avatar size="lg">
              <AvatarFallback className="text-white font-semibold" style={{ background: brandGradient }}>
                PS
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl font-bold text-foreground">
            Bem-vindo, <span style={{ color: brand.tealDark }}>Paulo</span>
          </h2>
          <p className="text-muted-foreground mt-2">Escolha o módulo que você quer acessar</p>
        </div>

        {visiveis === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted mb-4">
              <ShieldCheck className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Sem acesso a nenhum módulo</h3>
            <p className="text-sm text-muted-foreground mt-1">Fale com o administrador.</p>
          </div>
        ) : (
          <div className={`grid ${gridCols} gap-6`}>
            {acesso.assoc && (
              <CardModulo
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
                  "Fatura de Energia · Faturamento",
                ]}
                acesso={acesso.assoc}
                onClick={() => onEntrar("assoc")}
              />
            )}
            {acesso.bs && (
              <CardModulo
                titulo="Gestão de Clientes"
                subtitulo="Brasil Solar"
                descricao="Monitoramento de plantas, cronograma de obras e atendimento aos clientes da rede."
                icon={Users}
                cor={brand.teal}
                corAcento={brand.tealMid}
                itens={[
                  "Gestão Brasil Solar",
                  "Obras (cronograma + calendário)",
                  "Monitoramento de plantas",
                  "Relatórios mensais",
                ]}
                acesso={acesso.bs}
                onClick={() => onEntrar("bs")}
              />
            )}
            {acesso.prop && (
              <CardModulo
                titulo="Gerador de Proposta"
                subtitulo=""
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
                acesso={acesso.prop}
                onClick={() => onEntrar("prop")}
              />
            )}
          </div>
        )}
      </main>

      <footer className="border-t bg-card mt-8">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-muted-foreground">
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
  titulo, subtitulo, descricao, icon: Icon, cor, corAcento, itens, acesso, onClick,
}: {
  titulo: string; subtitulo: string; descricao: string; icon: typeof Zap;
  cor: string; corAcento: string; itens: string[]; acesso: string; onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-all hover:-translate-y-1 hover:ring-2"
      style={{ "--tw-ring-color": cor } as React.CSSProperties}
      onClick={onClick}
    >
      <CardHeader>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${corAcento} 0%, ${cor} 100%)` }}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
        <CardTitle className="font-heading text-lg leading-snug">
          {titulo}
          {subtitulo && <><br /><span className="text-muted-foreground font-normal">{subtitulo}</span></>}
        </CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-xs text-foreground/80">
          {itens.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor }} />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Seu acesso: <span className="font-semibold text-foreground">{acesso}</span>
        </span>
        <span className="font-semibold flex items-center gap-1" style={{ color: cor }}>
          Acessar <ArrowRight className="size-3.5" />
        </span>
      </CardFooter>
    </Card>
  );
}

// ============================================================
// TELAS 2 e 3 — DENTRO DE CADA MÓDULO (sidebar + conteúdo)
// ============================================================
function TelaModulo({
  mod, menuFiltrado, itemAtual, itemTitulo, grupoTitulo, role, setRole, onTrocarModulo, onSelecionarItem,
}: {
  mod: "assoc" | "bs";
  menuFiltrado: MenuItem[];
  itemAtual: string;
  itemTitulo: string;
  grupoTitulo: string | null;
  role: Role;
  setRole: (r: Role) => void;
  onTrocarModulo: () => void;
  onSelecionarItem: (id: string, titulo: string, grupo: string | null) => void;
}) {
  const moduloNome = mod === "assoc" ? "Associação de Energia" : "Clientes Brasil Solar";
  const moduloCor = mod === "assoc" ? brand.orange : brand.teal;
  const moduloIcon = mod === "assoc" ? Zap : Users;
  const ModuloIcon = moduloIcon;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PreviewBar role={role} setRole={setRole} onReset={onTrocarModulo} />

      <div className="flex-1 flex">
        {/* SIDEBAR — usa os tokens reais (bg-sidebar, etc) */}
        <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
          {/* logo */}
          <div className="h-16 px-4 flex items-center gap-3 border-b border-sidebar-border">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${moduloCor} 0%, ${mod === "assoc" ? brand.orangeLight : brand.tealDark} 100%)` }}
            >
              <ModuloIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight">AURA</div>
              <div className="text-[10px] opacity-70 leading-tight truncate">{moduloNome}</div>
            </div>
          </div>

          {/* nav */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto text-sm">
            {menuFiltrado.map((item) =>
              item.children ? (
                <GrupoMenu
                  key={item.id}
                  item={item}
                  itemAtual={itemAtual}
                  onSelecionar={(id, titulo) => onSelecionarItem(id, titulo, item.titulo)}
                />
              ) : (
                <ItemMenu
                  key={item.id}
                  ativo={itemAtual === item.id}
                  icon={<item.icon className="h-4 w-4 shrink-0" />}
                  label={item.titulo}
                  onClick={() => onSelecionarItem(item.id, item.titulo, null)}
                />
              )
            )}
          </nav>

          {/* rodapé sidebar — link discreto */}
          <div className="p-3 border-t border-sidebar-border">
            <button
              onClick={onTrocarModulo}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
            >
              <LogOut className="size-3.5" /> Voltar pro portal
            </button>
          </div>
        </aside>

        {/* CONTEÚDO */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 bg-card border-b flex items-center justify-between px-6 shrink-0">
            <div>
              <div className="text-xs text-muted-foreground">
                {grupoTitulo ? `${moduloNome}  ›  ${grupoTitulo}` : moduloNome}
              </div>
              <div className="font-heading text-lg font-semibold text-foreground">{itemTitulo}</div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                style={{ background: `${moduloCor}1A`, color: moduloCor, border: "none" }}
              >
                <ModuloIcon className="size-3" /> {mod === "assoc" ? "Associação" : "Clientes BS"}
              </Badge>
              <Button variant="outline" size="sm" onClick={onTrocarModulo}>
                <RotateCcw className="size-3.5" /> Trocar de módulo
              </Button>
              <Avatar>
                <AvatarFallback className="text-white text-xs" style={{ background: brandGradient }}>
                  PS
                </AvatarFallback>
              </Avatar>
            </div>
          </header>

          <main className="flex-1 p-8 overflow-y-auto">
            {itemAtual === "person" ? (
              <PersonalizacoesHub mod={mod} role={role} />
            ) : itemAtual === "users" ? (
              <UsuariosHub />
            ) : (
              <PlaceholderItem titulo={itemTitulo} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function ItemMenu({ ativo, icon, label, onClick, indent }: {
  ativo: boolean; icon: React.ReactNode; label: string; onClick: () => void; indent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        indent ? "pl-9" : "",
        ativo
          ? "bg-sidebar-accent text-sidebar-primary font-medium"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      ].join(" ")}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function GrupoMenu({ item, itemAtual, onSelecionar }: {
  item: MenuItem;
  itemAtual: string;
  onSelecionar: (id: string, titulo: string) => void;
}) {
  const grupoAtivo = item.children?.some((c) => c.id === itemAtual) ?? false;
  const [open, setOpen] = useState(true);
  const Icon = item.icon;
  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(!open)}
        className={[
          "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
          grupoAtivo ? "text-sidebar-primary font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        ].join(" ")}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.titulo}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="ml-4 pl-2 border-l border-sidebar-border space-y-0.5">
          {item.children!.map((c) => (
            <ItemMenu
              key={c.id}
              ativo={itemAtual === c.id}
              icon={<span className="w-1 h-1 rounded-full bg-sidebar-foreground/40" />}
              label={c.titulo}
              onClick={() => onSelecionar(c.id, c.titulo)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonalizacoesHub({ mod, role }: { mod: "assoc" | "bs"; role: Role }) {
  const itens = useMemo(
    () => personalizacoes.filter((p) => p.modulos.includes(mod) && p.roles.includes(role)),
    [mod, role]
  );
  const cor = mod === "assoc" ? brand.orange : brand.teal;
  const moduloNome = mod === "assoc" ? "Associação de Energia" : "Clientes Brasil Solar";

  if (itens.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <h3 className="text-lg font-semibold">Sem personalizações disponíveis</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Seu perfil não tem permissão pra editar configurações deste módulo.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Configurações abaixo afetam apenas o módulo <strong style={{ color: cor }}>{moduloNome}</strong> e
        foram filtradas pelo seu perfil (<strong>{role}</strong>).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {itens.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.id} className="cursor-pointer hover:ring-2 transition-all" style={{ "--tw-ring-color": cor } as React.CSSProperties}>
              <CardContent className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${cor}1A`, color: cor }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-sm">{p.titulo}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{p.desc}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function UsuariosHub() {
  const usuarios = [
    { nome: "Paulo Silva", email: "paulo@solvesm.eng.br", perfil: "admin (todos os módulos)", iniciais: "PS", voce: true },
    { nome: "Maria Santos", email: "maria@solvesm.eng.br", perfil: "POS_VENDA (Brasil Solar + Gerador)", iniciais: "MS" },
    { nome: "João Ribeiro", email: "joao@solvesm.eng.br", perfil: "vendedor (só Gerador)", iniciais: "JR" },
    { nome: "Ana Costa", email: "ana@solvesm.eng.br", perfil: "financeiro (só Associação)", iniciais: "AC" },
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-heading">Usuários do sistema</CardTitle>
            <CardDescription>Apenas administradores podem acessar esta página.</CardDescription>
          </div>
          <Button style={{ background: brand.teal }} className="text-white hover:opacity-90">
            + Novo usuário
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {usuarios.map((u) => (
          <div key={u.email} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50">
            <Avatar>
              <AvatarFallback
                className={u.voce ? "text-white" : "bg-muted text-muted-foreground"}
                style={u.voce ? { background: brandGradient } : undefined}
              >
                {u.iniciais}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{u.nome}</div>
              <div className="text-xs text-muted-foreground">{u.email} · {u.perfil}</div>
            </div>
            {u.voce && <Badge variant="secondary">Você</Badge>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PlaceholderItem({ titulo }: { titulo: string }) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-muted mb-4">
          <LayoutDashboard className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="font-heading text-lg font-semibold">{titulo}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          (Mockup) Aqui apareceria a tela real de <strong>{titulo}</strong> do AURA.
        </p>
      </CardContent>
    </Card>
  );
}
