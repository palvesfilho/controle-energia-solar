"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, FileUp, Eye, EyeOff, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";
import { CONCESSIONARIAS } from "@/lib/concessionarias";

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
  codigoUc: string;
  concessionaria: string;
  distribuidoraPortal: "" | "RGE" | "CPFL_PAULISTA" | "CPFL_PIRATININGA";
  emailPortal: string;
  senhaPortal: string;
  instalacaoPortal: string;
  tipoTelhado: string;
  tipoTelhadoOutro: string;
  dataPagamento: string;
  prazoContratoDias: string;
}

export const TIPO_TELHADO_OPTIONS: { value: string; label: string }[] = [
  { value: "FIBROCIMENTO", label: "Fibrocimento" },
  { value: "CERAMICO", label: "Cerâmico" },
  { value: "LAJE", label: "Laje" },
  { value: "CARPORT", label: "Carport" },
  { value: "USINA_DE_SOLO", label: "Usina de Solo" },
  { value: "CALHETAO_FIBROCIMENTO", label: "Calhetão Fibrocimento" },
  { value: "CALHETAO_METALICO", label: "Calhetão Metálico" },
  { value: "MISTO", label: "Misto" },
];

const TIPOS_COM_ESTRUTURA = new Set(["CARPORT", "USINA_DE_SOLO"]);
const PRAZO_MIN_CARPORT_SOLO = 19; // 3 dias de estrutura + 15 dias de lag + 1 dia mínimo de instalação

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
    executadoPor: "BRASIL_SOLAR",
    codigoUc: "", concessionaria: "",
    distribuidoraPortal: "", emailPortal: "", senhaPortal: "", instalacaoPortal: "",
    tipoTelhado: "", tipoTelhadoOutro: "",
    dataPagamento: "", prazoContratoDias: "",
  });
  const [showPortalPassword, setShowPortalPassword] = useState(false);

  function set<K extends keyof FormData>(field: K, value: FormData[K]) {
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
        ...prev,
        nome: data.nome ?? prev.nome,
        cpfCnpj: data.cpfCnpj ?? prev.cpfCnpj,
        email: data.email ?? prev.email,
        telefone: data.telefone ?? prev.telefone,
        endereco: data.endereco ?? prev.endereco,
        cidade: data.cidade ?? prev.cidade,
        uf: data.uf ?? prev.uf,
        codigoUc: data.codigoUc ?? prev.codigoUc,
        concessionaria: data.concessionaria ?? prev.concessionaria,
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

    // Validação do bloco "Acesso à concessionária":
    // se qualquer campo do bloco foi preenchido, todos passam a ser obrigatórios.
    const portalAny =
      !!form.distribuidoraPortal ||
      !!form.emailPortal.trim() ||
      !!form.senhaPortal.trim() ||
      !!form.instalacaoPortal.trim();
    if (portalAny) {
      if (!form.codigoUc.trim()) {
        toast.error("Para cadastrar o acesso à concessionária informe primeiro o Código da UC");
        return;
      }
      if (!form.distribuidoraPortal) {
        toast.error("Selecione a distribuidora do portal");
        return;
      }
      if (!form.emailPortal.trim()) {
        toast.error("Informe o email do portal");
        return;
      }
      if (!form.senhaPortal.trim()) {
        toast.error("Informe a senha do portal");
        return;
      }
    }

    const isTerceiro = form.executadoPor === "TERCEIRO";
    let prazo: number | null = null;
    if (!isTerceiro) {
      if (!form.tipoTelhado) {
        toast.error("Selecione o tipo de telhado");
        return;
      }
      if (form.tipoTelhado === "MISTO" && !form.tipoTelhadoOutro.trim()) {
        toast.error("Descreva o tipo de telhado misto");
        return;
      }
      if (!form.dataPagamento) {
        toast.error("Informe a data de pagamento");
        return;
      }
      const p = parseInt(form.prazoContratoDias, 10);
      if (!Number.isFinite(p) || p <= 0) {
        toast.error("Informe o prazo do contrato em dias (maior que zero)");
        return;
      }
      if (TIPOS_COM_ESTRUTURA.has(form.tipoTelhado) && p < PRAZO_MIN_CARPORT_SOLO) {
        toast.error(
          `Para CARPORT/USINA DE SOLO o prazo precisa ser de no mínimo ${PRAZO_MIN_CARPORT_SOLO} dias (3d estrutura + 15d intervalo + instalação)`
        );
        return;
      }
      prazo = p;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome: form.nome,
        cpfCnpj: form.cpfCnpj,
        email: form.email,
        telefone: form.telefone,
        endereco: form.endereco,
        cidade: form.cidade,
        uf: form.uf,
        observacoes: form.observacoes,
        executadoPor: form.executadoPor,
        codigoUc: form.codigoUc.trim() || null,
        concessionaria: form.concessionaria.trim() || null,
      };
      if (portalAny) {
        payload.portal = {
          distribuidora: form.distribuidoraPortal,
          email: form.emailPortal.trim(),
          senha: form.senhaPortal,
          instalacao:
            form.instalacaoPortal.trim() || form.codigoUc.trim(),
        };
      }
      if (!isTerceiro) {
        payload.tipoTelhado = form.tipoTelhado;
        payload.tipoTelhadoOutro =
          form.tipoTelhado === "MISTO" ? form.tipoTelhadoOutro.trim() : null;
        payload.dataPagamento = form.dataPagamento;
        payload.prazoContratoDias = prazo;
      }
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Execução do sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">Sistema executado por *</label>
              <select
                value={form.executadoPor}
                onChange={(e) =>
                  set("executadoPor", e.target.value as FormData["executadoPor"])
                }
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg bg-background"
                required
              >
                <option value="BRASIL_SOLAR">Brasil Solar</option>
                <option value="TERCEIRO">Terceiro</option>
              </select>
            </div>
            {form.executadoPor === "TERCEIRO" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>Somente monitoramento:</strong> a Brasil Solar não executa a obra
                deste sistema. Nenhuma obra ou tarefa de gestão será criada — o cadastro
                serve para monitorar a geração da usina e administrar os créditos.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Unidade Consumidora (UC)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Informe o código da UC para já cadastrar a Unidade Consumidora junto com
              o proprietário. Opcional — você também pode adicionar depois na tela do
              proprietário.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Código UC
                </label>
                <input
                  type="text"
                  value={form.codigoUc}
                  onChange={(e) => set("codigoUc", e.target.value)}
                  placeholder="Ex.: 3095464357"
                  className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Concessionária
                </label>
                <select
                  value={form.concessionaria}
                  onChange={(e) => set("concessionaria", e.target.value)}
                  className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                >
                  <option value="">Selecione</option>
                  {CONCESSIONARIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {form.codigoUc.trim() && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                Uma Unidade Consumidora será criada com este código e vinculada ao
                proprietário ao salvar.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-green-700" />
              <CardTitle className="text-base">
                Status e acesso à concessionária
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Informe os dados de login do portal da distribuidora para que as faturas
              sejam baixadas automaticamente. Opcional — você também pode cadastrar
              depois na tela da UC.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emailPortal">Email do portal</Label>
                <Input
                  id="emailPortal"
                  type="email"
                  value={form.emailPortal}
                  onChange={(e) => set("emailPortal", e.target.value)}
                  placeholder="email@exemplo.com"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senhaPortal">Senha do portal</Label>
                <div className="relative">
                  <Input
                    id="senhaPortal"
                    type={showPortalPassword ? "text" : "password"}
                    value={form.senhaPortal}
                    onChange={(e) => set("senhaPortal", e.target.value)}
                    placeholder="********"
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPortalPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPortalPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="instalacaoPortal">Número da instalação</Label>
                <Input
                  id="instalacaoPortal"
                  value={form.instalacaoPortal}
                  onChange={(e) => set("instalacaoPortal", e.target.value)}
                  placeholder={
                    form.codigoUc ? `Padrão: ${form.codigoUc}` : "Ex.: 1234567890"
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="distribuidoraPortal">Distribuidora</Label>
                <Select
                  value={form.distribuidoraPortal || undefined}
                  onValueChange={(v) =>
                    set(
                      "distribuidoraPortal",
                      (v as FormData["distribuidoraPortal"]) ?? "",
                    )
                  }
                >
                  <SelectTrigger id="distribuidoraPortal">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RGE">RGE Sul</SelectItem>
                    <SelectItem value="CPFL_PAULISTA">CPFL Paulista</SelectItem>
                    <SelectItem value="CPFL_PIRATININGA">CPFL Piratininga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {form.executadoPor === "BRASIL_SOLAR" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dados do Contrato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Tipo de telhado *</label>
                <select
                  value={form.tipoTelhado}
                  onChange={(e) => set("tipoTelhado", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg bg-background"
                  required
                >
                  <option value="">Selecionar...</option>
                  {TIPO_TELHADO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {form.tipoTelhado === "MISTO" && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium">
                    Descreva os tipos de telhado *
                  </label>
                  <input
                    type="text"
                    value={form.tipoTelhadoOutro}
                    onChange={(e) => set("tipoTelhadoOutro", e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm border rounded-lg"
                    placeholder="Ex.: cerâmico + fibrocimento na lateral"
                    required
                  />
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Data de pagamento *</label>
                <input
                  type="date"
                  value={form.dataPagamento}
                  onChange={(e) => set("dataPagamento", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  Prazo do contrato (dias) *
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.prazoContratoDias}
                  onChange={(e) => set("prazoContratoDias", e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg"
                  placeholder="Ex.: 60"
                  required
                />
              </div>
            </div>
            {TIPOS_COM_ESTRUTURA.has(form.tipoTelhado) && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                <strong>Cronograma automático:</strong> ao salvar, serão criadas duas
                tarefas para esta obra — (1) execução da estrutura de fixação de{" "}
                {form.tipoTelhado === "CARPORT" ? "carport" : "usina de solo"} (3 dias) e
                (2) instalação do sistema fotovoltaico, no mínimo 15 dias após o término
                da estrutura.
              </div>
            )}
          </CardContent>
        </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dados do Proprietário</CardTitle>
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
