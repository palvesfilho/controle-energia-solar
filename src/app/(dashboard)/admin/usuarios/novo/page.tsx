"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Save, Mail } from "lucide-react";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";
import { rolesAtribuiveisPor } from "@/lib/roles";

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
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "INVESTOR",
    phone: "",
    document: "",
  });

  // Espelha a alçada do servidor pra não oferecer um perfil que a API vai
  // recusar. Se o role não veio no publicMetadata (conta antiga, sem o claim
  // configurado), mostra tudo e deixa o servidor decidir — esconder opções de
  // um ADMIN legítimo seria pior que mostrar uma que ele não pode usar.
  const roleAtual = ((user?.publicMetadata as Record<string, unknown> | undefined)?.role as string) ?? "";
  const permitidos = roleAtual ? rolesAtribuiveisPor(roleAtual) : null;
  const roleOptions = permitidos
    ? ROLE_OPTIONS.filter((o) => (permitidos as string[]).includes(o.value))
    : ROLE_OPTIONS;

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

            {/* O campo "Senha" saiu em 31/08/2026. O login por senha local morreu
                em 08/08 — quem autentica é o Clerk. O que existia aqui era um
                hash que ninguém lia, e ele dava a impressão falsa de que salvar
                já entregava o acesso. */}
            <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <Mail className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
              <div className="text-xs text-blue-900 leading-relaxed">
                <span className="font-semibold">Salvar não libera o acesso.</span>{" "}
                Este cadastro só registra a pessoa. Para ela conseguir entrar,
                use o botão <span className="font-semibold">Emitir acesso</span>{" "}
                na lista de usuários — ele envia um convite por e-mail, e a
                própria pessoa define a senha ao aceitar.
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Perfil de acesso *
              </label>
              <div className="grid gap-2">
                {roleOptions.map((option) => {
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
