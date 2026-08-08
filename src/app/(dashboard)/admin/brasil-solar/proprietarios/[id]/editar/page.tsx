"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";
import { EmpresaTerceiraDialog } from "@/components/brasil-solar/empresa-terceira-dialog";

interface FormData {
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade: string;
  uf: string;
  observacoes: string;
  executadoPor: "BRASIL_SOLAR" | "TERCEIRO";
  /** Só usado quando executadoPor = TERCEIRO. "" = nenhuma escolhida. */
  empresaTerceiraId: string;
  /** Nome da empresa escolhida — só pra exibir sem rebuscar a lista. */
  empresaTerceiraNome: string;
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
    executadoPor: "BRASIL_SOLAR", empresaTerceiraId: "", empresaTerceiraNome: "",
  });
  const [empresaDialogAberto, setEmpresaDialogAberto] = useState(false);

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
          executadoPor: data.executadoPor === "TERCEIRO" ? "TERCEIRO" : "BRASIL_SOLAR",
          empresaTerceiraId: data.empresaTerceira?.id || "",
          empresaTerceiraNome: data.empresaTerceira?.nome || "",
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
    if (form.executadoPor === "TERCEIRO" && !form.empresaTerceiraId) {
      toast.error("Selecione a empresa que executou o sistema");
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

            <div className="space-y-3 pt-4 border-t">
              <div>
                <label className="text-sm font-medium">Sistema executado por *</label>
                <select
                  value={form.executadoPor}
                  onChange={(e) => {
                    const v = e.target.value as FormData["executadoPor"];
                    set("executadoPor", v);
                    // Marcar "Terceiro" já abre a janela — sem empresa o salvar
                    // nem passa na validação.
                    if (v === "TERCEIRO") {
                      if (!form.empresaTerceiraId) setEmpresaDialogAberto(true);
                    } else {
                      // Voltar para Brasil Solar limpa a empresa (a API faz o
                      // mesmo no servidor, aqui é só o reflexo na tela).
                      set("empresaTerceiraId", "");
                      set("empresaTerceiraNome", "");
                    }
                  }}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg bg-background"
                >
                  <option value="BRASIL_SOLAR">Brasil Solar</option>
                  <option value="TERCEIRO">Terceiro</option>
                </select>
              </div>

              {form.executadoPor === "TERCEIRO" && (
                <div>
                  <label className="text-sm font-medium">Empresa que executou *</label>
                  <button
                    type="button"
                    onClick={() => setEmpresaDialogAberto(true)}
                    className={`w-full mt-1 px-3 py-2 text-sm border rounded-lg bg-background text-left flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors ${
                      form.empresaTerceiraId ? "" : "text-muted-foreground"
                    }`}
                  >
                    <span className="truncate">
                      {form.empresaTerceiraNome || "Selecionar empresa…"}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {form.empresaTerceiraId ? "Trocar" : "Escolher"}
                    </span>
                  </button>
                </div>
              )}
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

      {/* Fora do <form>: os botões do diálogo não podem submeter a edição. */}
      <EmpresaTerceiraDialog
        open={empresaDialogAberto}
        onOpenChange={setEmpresaDialogAberto}
        value={form.empresaTerceiraId}
        onSelect={(empresa) => {
          set("empresaTerceiraId", empresa.id);
          set("empresaTerceiraNome", empresa.nome);
        }}
      />
    </div>
  );
}
