"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  UserX,
  UserCheck,
  Shield,
  Briefcase,
  DollarSign,
  TrendingUp,
  Zap,
  Headphones,
  HardHat,
  AlertTriangle,
  Mail,
  MailCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useFiltroTabela, type Faceta } from "@/lib/filtro-tabela";
import { FiltrosTabela } from "@/components/ui/filtros-tabela";
import { FiltroColuna } from "@/components/ui/filtro-coluna";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
  /** Já tem identidade no Clerk, ou seja: o convite foi aceito. */
  acessoEmitido: boolean;
}

/**
 * Fora do componente para a identidade do array não mudar a cada render.
 * Perfil e status saíram da API e vieram para cá: eram duas consultas a cada
 * troca de seletor, e com o filtro no servidor o Exportar levaria só o recorte
 * que a API devolveu, sem a tela saber disso.
 */
const FACETAS: Faceta<UserData>[] = [
  {
    chave: "perfil",
    label: "Perfil",
    valor: (u) => ROLE_LABELS[u.role] ?? u.role,
  },
  {
    chave: "status",
    label: "Status",
    valor: (u) => (u.active ? "Ativo" : "Inativo"),
  },
  {
    chave: "acesso",
    label: "Acesso",
    valor: (u) => (u.acessoEmitido ? "Acesso emitido" : "Sem acesso"),
  },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  FINANCEIRO: "Financeiro",
  POS_VENDA: "Pós-Venda",
  GESTOR_OBRA: "Gestor de Obras",
  INVESTOR: "Investidor",
  CONSUMER: "Consumidor",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-500 hover:bg-red-600",
  GESTOR: "bg-blue-500 hover:bg-blue-600",
  FINANCEIRO: "bg-amber-500 hover:bg-amber-600",
  POS_VENDA: "bg-cyan-500 hover:bg-cyan-600",
  GESTOR_OBRA: "bg-orange-500 hover:bg-orange-600",
  INVESTOR: "bg-emerald-500 hover:bg-emerald-600",
  CONSUMER: "bg-purple-500 hover:bg-purple-600",
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  ADMIN: Shield,
  GESTOR: Briefcase,
  FINANCEIRO: DollarSign,
  POS_VENDA: Headphones,
  GESTOR_OBRA: HardHat,
  INVESTOR: TrendingUp,
  CONSUMER: Zap,
};

// Trava do "Desativar": exige digitar a palavra exata (case-sensitive) antes
// de liberar a ação. Só vale pra desativação — ativar segue clique direto.
const PALAVRA_DESATIVAR = "Desativar";

const ROLE_OPTIONS = [
  "ADMIN",
  "GESTOR",
  "FINANCEIRO",
  "POS_VENDA",
  "GESTOR_OBRA",
  "INVESTOR",
  "CONSUMER",
];

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  const filtro = useFiltroTabela(users, {
    sincronizarUrl: true,
    busca: (u) => [u.name, u.email],
    facetas: FACETAS,
  });
  const [toggling, setToggling] = useState<string | null>(null);
  const [desativarTarget, setDesativarTarget] = useState<UserData | null>(null);
  const [desativarText, setDesativarText] = useState("");

  // Comparação exata (case-sensitive); só o trim das bordas é tolerado.
  const palavraBate = desativarText.trim() === PALAVRA_DESATIVAR;
  const desativando = desativarTarget !== null && toggling === desativarTarget.id;

  const [convidando, setConvidando] = useState<string | null>(null);

  // Emitir acesso DISPARA E-MAIL. Fica atrás de confirmação explícita: nenhum
  // envio pode sair de um clique acidental na lista.
  const [conviteTarget, setConviteTarget] = useState<UserData | null>(null);

  const enviarConvite = async (user: UserData) => {
    setConvidando(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}/convite`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao emitir acesso");
      toast.success(`Convite enviado para ${user.email}`);
      setConviteTarget(null);
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao emitir acesso");
    } finally {
      setConvidando(null);
    }
  };

  const fetchUsers = () => {
    setLoading(true);
    fetch("/api/users")
      .then((res) => res.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleActive = async (user: UserData) => {
    setToggling(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });
      if (res.ok) {
        toast.success(user.active ? "Usuário desativado" : "Usuário ativado");
        setDesativarTarget(null);
        setDesativarText("");
        fetchUsers();
      } else {
        const data = await res.json();
        toast.error("Erro ao atualizar usuário", { description: data.error });
      }
    } finally {
      setToggling(null);
    }
  };

  // Ativar é clique direto; desativar passa pela trava textual.
  const handleToggleClick = (user: UserData) => {
    if (!user.active) {
      toggleActive(user);
      return;
    }
    setDesativarText("");
    setDesativarTarget(user);
  };

  const fecharDesativar = () => {
    if (desativando) return;
    setDesativarTarget(null);
    setDesativarText("");
  };

  const confirmarDesativacao = () => {
    if (!desativarTarget || !palavraBate || desativando) return;
    toggleActive(desativarTarget);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">Gerencie os acessos ao sistema</p>
        </div>
        <Link
          href="/admin/usuarios/novo"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Usuário
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {ROLE_OPTIONS.map((role) => {
          const count = users.filter((u) => u.role === role).length;
          const Icon = ROLE_ICONS[role];
          // O card do perfil É o funil da coluna Perfil — os dois mexem na
          // mesma faceta, senão a tela mostraria dois estados do mesmo filtro.
          const rotulo = ROLE_LABELS[role];
          const isActive = (filtro.selecionados.perfil ?? []).includes(rotulo);
          return (
            <Card
              key={role}
              className={`cursor-pointer hover:shadow-md transition-all ${isActive ? "ring-2 ring-primary/30" : ""}`}
              onClick={() => filtro.alternarValor("perfil", rotulo)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${ROLE_COLORS[role]} text-white`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</div>
                  <div className="text-lg font-semibold">{count}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <FiltrosTabela
            filtro={filtro}
            placeholder="Buscar por nome ou email..."
            substantivo="usuários"
            exportar={{ tabela: "usuarios", nome: "usuarios", aba: "Usuários" }}
          />

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtro.filtrados.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-tabela="usuarios">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Nome</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Email</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">
                      Perfil
                      <FiltroColuna filtro={filtro} chave="perfil" />
                    </th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">
                      Status
                      <FiltroColuna filtro={filtro} chave="status" />
                    </th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">
                      Acesso
                      <FiltroColuna filtro={filtro} chave="acesso" />
                    </th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Criado em</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtro.filtrados.map((user) => {
                    const RoleIcon = ROLE_ICONS[user.role] || Shield;
                    return (
                      <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-medium">{user.name}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{user.email}</td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge className={`${ROLE_COLORS[user.role]} text-white`}>
                            <RoleIcon className="h-3 w-3 mr-1" />
                            {ROLE_LABELS[user.role] || user.role}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge
                            variant={user.active ? "default" : "secondary"}
                            className={user.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                          >
                            {user.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {user.acessoEmitido ? (
                            <Badge variant="secondary" className="gap-1">
                              <MailCheck className="h-3 w-3" />
                              Emitido
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                              <AlertTriangle className="h-3 w-3" />
                              Sem acesso
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center text-xs text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Link
                              href={`/admin/usuarios/${user.id}/editar`}
                              title="Editar"
                              className="p-1.5 rounded hover:bg-muted transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            {!user.acessoEmitido && user.active && (
                              <button
                                type="button"
                                title="Emitir acesso (envia e-mail de convite)"
                                onClick={() => setConviteTarget(user)}
                                disabled={convidando === user.id}
                                className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
                              >
                                <Mail className="h-4 w-4 text-blue-500" />
                              </button>
                            )}
                            <button
                              type="button"
                              title={user.active ? "Desativar" : "Ativar"}
                              onClick={() => handleToggleClick(user)}
                              disabled={toggling === user.id}
                              className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
                            >
                              {user.active ? (
                                <UserX className="h-4 w-4 text-red-500" />
                              ) : (
                                <UserCheck className="h-4 w-4 text-emerald-500" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Emitir acesso — confirmação porque ENVIA E-MAIL para a pessoa */}
      <Dialog
        open={conviteTarget !== null}
        onOpenChange={(open) => !open && setConviteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
            <DialogTitle className="text-center text-lg">
              Emitir acesso?
            </DialogTitle>
            <DialogDescription className="text-center">
              Um e-mail de convite será enviado agora para{" "}
              <span className="font-semibold text-foreground">
                {conviteTarget?.email}
              </span>
              , com o perfil{" "}
              <span className="font-semibold text-foreground">
                {conviteTarget ? ROLE_LABELS[conviteTarget.role] ?? conviteTarget.role : ""}
              </span>
              .
              <br />
              A pessoa cria a própria senha ao aceitar. Só depois disso ela
              consegue entrar.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setConviteTarget(null)}
              disabled={convidando !== null}
              className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => conviteTarget && enviarConvite(conviteTarget)}
              disabled={convidando !== null}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              {convidando ? "Enviando..." : "Enviar convite"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trava do "Desativar" — exige digitar a palavra exata */}
      <Dialog
        open={desativarTarget !== null}
        onOpenChange={(open) => !open && fecharDesativar()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-center text-lg">
              Desativar usuário?
            </DialogTitle>
            <DialogDescription className="text-center">
              Você está prestes a desativar{" "}
              <span className="font-semibold text-foreground">
                {desativarTarget?.name}
              </span>{" "}
              <span className="text-muted-foreground">
                ({desativarTarget?.email})
              </span>
              .
              <br />
              O usuário perderá o acesso ao sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-2">
            <label className="block text-sm font-medium">
              Para confirmar, digite a palavra abaixo:
            </label>
            <div className="rounded-md bg-muted px-3 py-2 text-sm font-mono select-all">
              {PALAVRA_DESATIVAR}
            </div>
            <input
              type="text"
              value={desativarText}
              onChange={(e) => setDesativarText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && palavraBate) confirmarDesativacao();
              }}
              placeholder="Digite a palavra exata aqui"
              autoFocus
              disabled={desativando}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
            />
            {desativarText.length > 0 && !palavraBate && (
              <p className="text-xs text-red-600">
                A palavra precisa ser exatamente &quot;{PALAVRA_DESATIVAR}&quot;
                (com D maiúsculo).
              </p>
            )}
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <button
              type="button"
              onClick={fecharDesativar}
              disabled={desativando}
              className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarDesativacao}
              disabled={!palavraBate || desativando}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {desativando ? "Desativando..." : "Desativar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
