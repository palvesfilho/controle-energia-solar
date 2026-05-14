"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ProprietarioSelect } from "@/components/brasil-solar/proprietario-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";
import { CONCESSIONARIAS } from "@/lib/concessionarias";

const PLATAFORMAS = [
  "GROWATT", "SOLIS", "FRONIUS", "CANADIAN", "ABB", "DEYE",
  "HOYMILES", "GOODWE", "HUAWEI", "SUNGROW", "BYD", "ENPHASE",
];

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

interface FormData {
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade: string;
  uf: string;
  latitude: string;
  longitude: string;
  potenciaInstalada: string;
  dataInstalacao: string;
  modulosMarca: string;
  modulosModelo: string;
  modulosQuantidade: string;
  inversorMarca: string;
  inversorModelo: string;
  inversorQuantidade: string;
  inversorPotencia: string;
  plataformaMonitoramento: string;
  monitoramentoLogin: string;
  monitoramentoSenha: string;
  monitoramentoUrl: string;
  monitoramentoPlantId: string;
  concessionaria: string;
  codigoUc: string;
  statusContrato: string;
  dataContrato: string;
  consultor: string;
  garantiaAte: string;
  geracaoMediaEsperada: string;
  investimento: string;
  observacoesInternas: string;
}

const emptyForm: FormData = {
  nome: "", cpfCnpj: "", email: "", telefone: "",
  endereco: "", cidade: "", uf: "",
  latitude: "", longitude: "",
  potenciaInstalada: "", dataInstalacao: "",
  modulosMarca: "", modulosModelo: "", modulosQuantidade: "",
  inversorMarca: "", inversorModelo: "", inversorQuantidade: "", inversorPotencia: "",
  plataformaMonitoramento: "", monitoramentoLogin: "", monitoramentoSenha: "",
  monitoramentoUrl: "", monitoramentoPlantId: "",
  concessionaria: "", codigoUc: "",
  statusContrato: "ATIVO", dataContrato: "", consultor: "", garantiaAte: "",
  geracaoMediaEsperada: "", investimento: "", observacoesInternas: "",
};

function FormField({
  label, name, value, onChange, type = "text", placeholder, required, className,
}: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  type?: string; placeholder?: string; required?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
      />
    </div>
  );
}

export default function NovoClienteBrasilSolarPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [proprietarioId, setProprietarioId] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
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
      const res = await fetch("/api/brasil-solar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, proprietarioId }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success("Cliente cadastrado com sucesso");
        router.push(`/admin/brasil-solar/${data.id}`);
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao cadastrar cliente");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/brasil-solar" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Novo Cliente Brasil Solar</h1>
          <p className="text-sm text-muted-foreground">Cadastrar novo cliente para monitoramento</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dados do Cliente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dados do Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <FormField label="Nome" name="nome" value={form.nome} onChange={handleChange} required className="sm:col-span-2" />
              <FormField label="CPF/CNPJ" name="cpfCnpj" value={form.cpfCnpj} onChange={handleChange} />
              <FormField label="Email" name="email" value={form.email} onChange={handleChange} type="email" />
              <div>
                <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                <PhoneInput
                  name="telefone"
                  value={form.telefone}
                  onChange={handleChange}
                  unstyled
                />
              </div>
              <FormField label="Endereco" name="endereco" value={form.endereco} onChange={handleChange} className="sm:col-span-2" />
              <FormField label="Cidade" name="cidade" value={form.cidade} onChange={handleChange} />
              <div>
                <label className="text-xs font-medium text-muted-foreground">UF</label>
                <select
                  name="uf"
                  value={form.uf}
                  onChange={handleChange}
                  className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                >
                  <option value="">Selecione</option>
                  {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <FormField label="Latitude" name="latitude" value={form.latitude} onChange={handleChange} type="number" placeholder="-30.0346" />
              <FormField label="Longitude" name="longitude" value={form.longitude} onChange={handleChange} type="number" placeholder="-51.2177" />
              <div className="sm:col-span-2">
                <ProprietarioSelect
                  value={proprietarioId}
                  onChange={setProprietarioId}
                  label="Proprietario (Dono da Usina)"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instalacao */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dados da Instalacao</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <FormField label="Potencia Instalada (kWp)" name="potenciaInstalada" value={form.potenciaInstalada} onChange={handleChange} type="number" />
              <FormField label="Data Instalacao" name="dataInstalacao" value={form.dataInstalacao} onChange={handleChange} type="date" />
              <FormField label="Geracao Media Esperada (kWh/mes)" name="geracaoMediaEsperada" value={form.geracaoMediaEsperada} onChange={handleChange} type="number" />
              <FormField label="Investimento (R$)" name="investimento" value={form.investimento} onChange={handleChange} type="number" placeholder="0,00" />
              <FormField label="Modulos - Marca" name="modulosMarca" value={form.modulosMarca} onChange={handleChange} />
              <FormField label="Modulos - Modelo" name="modulosModelo" value={form.modulosModelo} onChange={handleChange} />
              <FormField label="Modulos - Quantidade" name="modulosQuantidade" value={form.modulosQuantidade} onChange={handleChange} type="number" />
              <FormField label="Inversor - Marca" name="inversorMarca" value={form.inversorMarca} onChange={handleChange} />
              <FormField label="Inversor - Modelo" name="inversorModelo" value={form.inversorModelo} onChange={handleChange} />
              <FormField label="Inversor - Quantidade" name="inversorQuantidade" value={form.inversorQuantidade} onChange={handleChange} type="number" />
              <FormField label="Inversor - Potencia (kW)" name="inversorPotencia" value={form.inversorPotencia} onChange={handleChange} type="number" />
            </div>
          </CardContent>
        </Card>

        {/* Monitoramento */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monitoramento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Plataforma</label>
                <select
                  name="plataformaMonitoramento"
                  value={form.plataformaMonitoramento}
                  onChange={handleChange}
                  className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                >
                  <option value="">Selecione</option>
                  {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <FormField label="Login" name="monitoramentoLogin" value={form.monitoramentoLogin} onChange={handleChange} />
              <FormField label="Senha" name="monitoramentoSenha" value={form.monitoramentoSenha} onChange={handleChange} type="password" />
              <FormField label="URL do Portal" name="monitoramentoUrl" value={form.monitoramentoUrl} onChange={handleChange} className="sm:col-span-2" />
              <FormField label="Plant ID" name="monitoramentoPlantId" value={form.monitoramentoPlantId} onChange={handleChange} />
            </div>
          </CardContent>
        </Card>

        {/* Concessionaria e Contrato */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Concessionaria e Contrato</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Concessionaria</label>
                <select
                  name="concessionaria"
                  value={form.concessionaria}
                  onChange={handleChange}
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
              <FormField label="Codigo UC" name="codigoUc" value={form.codigoUc} onChange={handleChange} />
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status Contrato</label>
                <select
                  name="statusContrato"
                  value={form.statusContrato}
                  onChange={handleChange}
                  className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                >
                  <option value="ATIVO">Ativo</option>
                  <option value="SUSPENSO">Suspenso</option>
                  <option value="CANCELADO">Cancelado</option>
                  <option value="GARANTIA">Garantia</option>
                </select>
              </div>
              <FormField label="Data Contrato" name="dataContrato" value={form.dataContrato} onChange={handleChange} type="date" />
              <FormField label="Consultor" name="consultor" value={form.consultor} onChange={handleChange} />
              <FormField label="Garantia ate" name="garantiaAte" value={form.garantiaAte} onChange={handleChange} type="date" />
            </div>
          </CardContent>
        </Card>

        {/* Observacoes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Observacoes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              name="observacoesInternas"
              value={form.observacoesInternas}
              onChange={handleChange}
              placeholder="Observacoes internas sobre o cliente..."
              rows={3}
              className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvando..." : "Cadastrar Cliente"}
          </button>
          <Link
            href="/admin/brasil-solar"
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
