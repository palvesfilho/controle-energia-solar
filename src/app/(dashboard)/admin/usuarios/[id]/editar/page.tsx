"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrador", description: "Acesso total ao sistema, incluindo gestão de usuários" },
  { value: "GESTOR", label: "Gestor", description: "Acesso ao painel administrativo, sem gestão de usuários" },
  { value: "FINANCEIRO", label: "Financeiro", description: "Acesso ao painel com foco em dados financeiros" },
  { value: "INVESTOR", label: "Investidor", description: "Acesso ao portal do investidor e relatórios" },
  { value: "CONSUMER", label: "Consumidor", description: "Acesso ao portal do consumidor" },
];

export default function EditarUsuarioPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "",
    active: true,
  });

  useEffect(() => {
    fetch(`/api/users/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Usuário não encontrado");
        return res.json();
      })
      .then((user) => {
        setForm({
          name: user.name,
          email: user.email,
          password: "",
          role: user.role,
          active: user.active,
        });
      })
      .catch(() => setError("Erro ao carregar usuário"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        active: form.active,
      };
      if (form.password) {
        payload.password = form.password;
      }

      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success("Usuário atualizado", { description: `${form.name} foi atualizado com sucesso` });
        router.push("/admin/usuarios");
      } else {
        const data = await res.json();
        setError(data.error || "Erro ao atualizar usuário");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Link
        href="/admin/usuarios"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Editar Usuário</h1>
        <p className="text-sm text-muted-foreground">Atualize os dados do usuário</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="p-4 space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Nome completo *">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </FormField>
              <FormField label="Email *">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </FormField>
            </div>

            <FormField label="Nova senha (deixe em branco para manter)">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Preencha apenas para alterar"
                  minLength={6}
                  className="w-full text-sm border rounded-lg px-3 py-1.5 pr-9 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Perfil de acesso *
              </label>
              <div className="grid gap-2">
                {ROLE_OPTIONS.map((option) => {
                  const selected = form.role === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-input hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={option.value}
                        checked={selected}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        className="mt-1 accent-primary"
                      />
                      <div>
                        <span className="font-medium text-sm">{option.label}</span>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </label>
              <div className="flex gap-2">
                <label
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 cursor-pointer transition-colors ${
                    form.active ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" : "border-input hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="active"
                    checked={form.active}
                    onChange={() => setForm({ ...form, active: true })}
                    className="accent-emerald-500"
                  />
                  <span className="text-sm font-medium">Ativo</span>
                </label>
                <label
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 cursor-pointer transition-colors ${
                    !form.active ? "border-red-500 bg-red-50 dark:bg-red-950/40" : "border-input hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="active"
                    checked={!form.active}
                    onChange={() => setForm({ ...form, active: false })}
                    className="accent-red-500"
                  />
                  <span className="text-sm font-medium">Inativo</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar Alterações"}
              </button>
              <Link
                href="/admin/usuarios"
                className="inline-flex items-center px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
              >
                Cancelar
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}
