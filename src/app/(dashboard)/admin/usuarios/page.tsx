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
} from "lucide-react";
import { toast } from "sonner";

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}

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
  const [filterRole, setFilterRole] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchUsers = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterRole) params.set("role", filterRole);
    if (filterActive) params.set("active", filterActive);

    fetch(`/api/users?${params.toString()}`)
      .then((res) => res.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, [filterRole, filterActive]);

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
        fetchUsers();
      } else {
        const data = await res.json();
        toast.error("Erro ao atualizar usuário", { description: data.error });
      }
    } finally {
      setToggling(null);
    }
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
          const isActive = filterRole === role;
          return (
            <Card
              key={role}
              className={`cursor-pointer hover:shadow-md transition-all ${isActive ? "ring-2 ring-primary/30" : ""}`}
              onClick={() => setFilterRole(isActive ? "" : role)}
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
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todos os perfis</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todos os status</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
            <span className="ml-auto text-xs text-muted-foreground">
              {users.length} usuário{users.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Nome</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Email</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Perfil</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Status</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Criado em</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
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
                            <button
                              type="button"
                              title={user.active ? "Desativar" : "Ativar"}
                              onClick={() => toggleActive(user)}
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
    </div>
  );
}
