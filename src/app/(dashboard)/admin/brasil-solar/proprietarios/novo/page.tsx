"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, FileUp } from "lucide-react";
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

// Dados técnicos da planta extraídos do Anexo F, guardados para pré-preencher
// a tela "Novo Cliente" após a criação do proprietário.
export interface AnexoFPlantaPrefill {
  codigoUc?: string;
  latitude?: number;
  longitude?: number;
  concessionaria?: string;
  modulosQuantidade?: number;
  modulosMarca?: string;
  modulosModelo?: string;
  inversorQuantidade?: number;
  inversorMarca?: string;
  inversorModelo?: string;
  potenciaInstalada?: number;
  inversorPotencia?: number;
  numeroFases?: string;
  tipoAtendimento?: string;
}

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

export default function NovoProprietarioPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [plantaPrefill, setPlantaPrefill] = useState<AnexoFPlantaPrefill | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormData>({
    nome: "", cpfCnpj: "", email: "", telefone: "",
    endereco: "", cidade: "", uf: "", observacoes: "",
  });

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAnexoFUpload(file: File) {
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/brasil-solar/proprietarios/parse-anexo", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Falha ao processar PDF");
        return;
      }
      const { data } = await res.json();

      setForm((prev) => ({
        nome: data.nome ?? prev.nome,
        cpfCnpj: data.cpfCnpj ?? prev.cpfCnpj,
        email: data.email ?? prev.email,
        telefone: data.telefone ?? prev.telefone,
        endereco: data.endereco ?? prev.endereco,
        cidade: data.cidade ?? prev.cidade,
        uf: data.uf ?? prev.uf,
        observacoes: prev.observacoes,
      }));

      setPlantaPrefill({
        codigoUc: data.codigoUc,
        latitude: data.latitude,
        longitude: data.longitude,
        concessionaria: data.concessionaria,
        modulosQuantidade: data.modulosQuantidade,
        modulosMarca: data.modulosMarca,
        modulosModelo: data.modulosModelo,
        inversorQuantidade: data.inversorQuantidade,
        inversorMarca: data.inversorMarca,
        inversorModelo: data.inversorModelo,
        potenciaInstalada: data.potenciaInstalada,
        inversorPotencia: data.inversorPotencia,
        numeroFases: data.numeroFases,
        tipoAtendimento: data.tipoAtendimento,
      });

      toast.success("Dados extraídos do Anexo F");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao ler o PDF");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (form.telefone && !isValidPhone(form.telefone)) {
      toast.error("Telefone inválido. Use (XX)XXXXX-XXXX");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (plantaPrefill && Object.values(plantaPrefill).some((v) => v !== undefined)) {
        payload.planta = plantaPrefill;
      }

      const res = await fetch("/api/brasil-solar/proprietarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          plantaPrefill
            ? "Proprietário e usina cadastrados"
            : "Proprietário criado",
        );
        router.push(`/admin/brasil-solar/proprietarios/${data.id}`);
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao criar");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/brasil-solar/proprietarios" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Novo Proprietário</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Importar do Anexo F (CPFL/RGE)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAnexoFUpload(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {parsing ? "Lendo PDF..." : "Selecionar PDF do Anexo F"}
            </button>
            <p className="text-xs text-muted-foreground">
              Os campos abaixo e os dados da planta serão preenchidos automaticamente.
            </p>
          </div>

          {plantaPrefill && (
            <div className="mt-3 p-3 border rounded-lg bg-muted/30 text-xs space-y-1">
              <div className="font-medium text-sm mb-1">Dados da planta detectados</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                {plantaPrefill.codigoUc && <div><span className="text-muted-foreground">UC:</span> {plantaPrefill.codigoUc}</div>}
                {plantaPrefill.concessionaria && <div><span className="text-muted-foreground">Concessionária:</span> {plantaPrefill.concessionaria}</div>}
                {plantaPrefill.potenciaInstalada !== undefined && <div><span className="text-muted-foreground">Potência:</span> {plantaPrefill.potenciaInstalada} kWp</div>}
                {plantaPrefill.inversorPotencia !== undefined && <div><span className="text-muted-foreground">Inversor:</span> {plantaPrefill.inversorPotencia} kW</div>}
                {plantaPrefill.modulosMarca && <div><span className="text-muted-foreground">Módulo:</span> {plantaPrefill.modulosMarca} {plantaPrefill.modulosModelo ?? ""}</div>}
                {plantaPrefill.modulosQuantidade !== undefined && <div><span className="text-muted-foreground">Qtd módulos:</span> {plantaPrefill.modulosQuantidade}</div>}
                {plantaPrefill.inversorMarca && <div><span className="text-muted-foreground">Inversor:</span> {plantaPrefill.inversorMarca} {plantaPrefill.inversorModelo ?? ""}</div>}
                {plantaPrefill.latitude !== undefined && plantaPrefill.longitude !== undefined && (
                  <div><span className="text-muted-foreground">Localização:</span> {plantaPrefill.latitude.toFixed(5)}, {plantaPrefill.longitude.toFixed(5)}</div>
                )}
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Ao salvar, a usina será criada e vinculada automaticamente a este proprietário.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
              <Link href="/admin/brasil-solar/proprietarios" className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                Cancelar
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
