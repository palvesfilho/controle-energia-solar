"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";

interface FormData {
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade: string;
  uf: string;
  observacoes: string;
}

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

export default function EditarProprietarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormData>({
    nome: "", cpfCnpj: "", email: "", telefone: "",
    endereco: "", cidade: "", uf: "", observacoes: "",
  });

  useEffect(() => {
    fetch(`/api/brasil-solar/proprietarios/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setForm({
          nome: data.nome || "",
          cpfCnpj: data.cpfCnpj || "",
          email: data.email || "",
          telefone: data.telefone || "",
          endereco: data.endereco || "",
          cidade: data.cidade || "",
          uf: data.uf || "",
          observacoes: data.observacoes || "",
        });
      })
      .catch(() => toast.error("Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [id]);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("Nome e obrigatorio");
      return;
    }
    if (form.telefone && !isValidPhone(form.telefone)) {
      toast.error("Telefone inválido. Use (XX)XXXXX-XXXX");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/brasil-solar/proprietarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        toast.success("Proprietario atualizado");
        router.push(`/admin/brasil-solar/proprietarios/${id}`);
      } else {
        toast.error("Erro ao atualizar");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-96 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/admin/brasil-solar/proprietarios/${id}`} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Editar Proprietario</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dados do Proprietario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Nome *</label>
                <input type="text" value={form.nome} onChange={(e) => set("nome", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg" required />
              </div>
              <div>
                <label className="text-sm font-medium">CPF/CNPJ</label>
                <input type="text" value={form.cpfCnpj} onChange={(e) => set("cpfCnpj", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg" />
              </div>
              <div>
                <label className="text-sm font-medium">Telefone</label>
                <PhoneInput
                  value={form.telefone}
                  onChange={(e) => set("telefone", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg"
                  unstyled
                />
              </div>
              <div>
                <label className="text-sm font-medium">Endereco</label>
                <input type="text" value={form.endereco} onChange={(e) => set("endereco", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg" />
              </div>
              <div>
                <label className="text-sm font-medium">Cidade</label>
                <input type="text" value={form.cidade} onChange={(e) => set("cidade", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg" />
              </div>
              <div>
                <label className="text-sm font-medium">UF</label>
                <select value={form.uf} onChange={(e) => set("uf", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg bg-background">
                  <option value="">Selecionar...</option>
                  {UF_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Observacoes</label>
                <textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)}
                  rows={3} className="w-full mt-1 px-3 py-2 text-sm border rounded-lg resize-none" />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
              <Link href={`/admin/brasil-solar/proprietarios/${id}`} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                Cancelar
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
