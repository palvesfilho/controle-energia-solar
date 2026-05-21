"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrador", description: "Acesso total ao sistema, incluindo gestão de usuários" },
  { value: "GESTOR", label: "Gestor", description: "Acesso ao painel administrativo, sem gestão de usuários" },
  { value: "FINANCEIRO", label: "Financeiro", description: "Acesso ao painel com foco em dados financeiros" },
  { value: "POS_VENDA", label: "Pós-Venda", description: "Acesso a Gestão Brasil Solar e Obra" },
  { value: "GESTOR_OBRA", label: "Gestor de Obras", description: "Acesso restrito ao módulo Obra" },
  { value: "INVESTOR", label: "Investidor", description: "Acesso ao portal do investidor e relatórios" },
  { value: "CONSUMER", label: "Consumidor", description: "Acesso ao portal do consumidor" },
];

export default function NovoUsuarioPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "INVESTOR",
    phone: "",
    document: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.phone && !isValidPhone(form.phone)) {
      toast.error("Telefone inválido. Use (XX)XXXXX-XXXX");
      return;
    }
    setSaving(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        toast.success("Usuário criado", { description: `${form.name} foi adicionado ao sistema` });
        router.push("/admin/usuarios");
      } else {
        const data = await res.json();
        setError(data.error || "Erro ao criar usuário");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

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
        <h1 className="text-2xl font-bold">Novo Usuário</h1>
        <p className="text-sm text-muted-foreground">Cadastre um novo usuário no sistema</p>
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
                  placeholder="Nome do usuário"
                  required
                  className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </FormField>
              <FormField label="Email *">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  required
                  className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </FormField>
            </div>

            <FormField label="Senha *">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
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

            {form.role === "INVESTOR" && (
              <div className="grid gap-3 md:grid-cols-2 pt-2 border-t">
                <FormField label="Telefone">
                  <PhoneInput
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    unstyled
                  />
                </FormField>
                <FormField label="CPF/CNPJ">
                  <input
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                </FormField>
              </div>
            )}

            <div className="flex gap-2 pt-3 border-t">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Criar Usuário"}
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
