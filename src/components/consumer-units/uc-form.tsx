"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

export interface UCFormData {
  nome: string;
  codigoUc: string;
  consumerId: string;
  plantId: string;
  cpfCnpj: string;
  distribuidora: string;
  grupo: string;
  subGrupo: string;
  modalidade: string;
  consumoMedio: string;
  cep: string;
  logradouro: string;
  complemento: string;
  numero: string;
  cidade: string;
  consultor: string;
  comissao: string;
  metodoPagamento: string;
  regraRemuneracao: string;
  percentCompensado: string;
  percentBandeira: string;
  regraVencimento: string;
  valorVencimento: string;
  statusContrato: string;
  vigenciaCompensacao: string;
  loginDistribuidora: string;
  senhaDistribuidora: string;
  temGeracaoPropria: boolean;
}

export const EMPTY_UC_FORM: UCFormData = {
  nome: "",
  codigoUc: "",
  consumerId: "",
  plantId: "",
  cpfCnpj: "",
  distribuidora: "",
  grupo: "",
  subGrupo: "",
  modalidade: "",
  consumoMedio: "",
  cep: "",
  logradouro: "",
  complemento: "",
  numero: "",
  cidade: "",
  consultor: "",
  comissao: "",
  metodoPagamento: "",
  regraRemuneracao: "",
  percentCompensado: "",
  percentBandeira: "",
  regraVencimento: "",
  valorVencimento: "",
  statusContrato: "Ativo",
  vigenciaCompensacao: "",
  loginDistribuidora: "",
  senhaDistribuidora: "",
  temGeracaoPropria: false,
};

interface Option {
  id: string;
  label: string;
}

export const METODOS_PAGAMENTO: { value: string; label: string }[] = [
  { value: "ASAAS", label: "Asaas" },
  { value: "BANCO_DO_BRASIL", label: "Banco do Brasil" },
];

export const REGRAS_REMUNERACAO: { value: string; label: string }[] = [
  { value: "DESC_COMPENSADA", label: "Desconto sobre Energia Compensada" },
  { value: "DESC_COMPENSADA_BANDEIRAS", label: "Desconto sobre Energia Compensada + Bandeiras" },
  { value: "DESC_FATURA_COMPENSADA_DOMMO", label: "Desconto sobre Fatura Compensada DOMMO" },
];

export const REGRAS_VENCIMENTO: { value: string; label: string }[] = [
  { value: "DIA_FIXO_MES", label: "Dia fixo do mês" },
  { value: "TRES_DIAS_ANTES_VENC", label: "3 dias antes do vencimento da fatura" },
];

interface Props {
  initialData?: Partial<UCFormData>;
  onSubmit: (data: UCFormData) => Promise<void>;
  saving: boolean;
  error?: string;
  cancelHref: string;
  submitLabel?: string;
}

export function UCForm({
  initialData,
  onSubmit,
  saving,
  error,
  cancelHref,
  submitLabel = "Salvar",
}: Props) {
  const [form, setForm] = useState<UCFormData>({
    ...EMPTY_UC_FORM,
    ...initialData,
  });
  const [consumers, setConsumers] = useState<Option[]>([]);
  const [plants, setPlants] = useState<Option[]>([]);

  useEffect(() => {
    fetch("/api/consumers")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) =>
        setConsumers(data.map((c) => ({ id: c.id, label: c.name })))
      );
    fetch("/api/plants")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) =>
        setPlants(data.map((p) => ({ id: p.id, label: p.name })))
      );
  }, []);

  const update = <K extends keyof UCFormData>(key: K, value: UCFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Identificação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome da UC *</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => update("nome", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codigoUc">Código da UC *</Label>
            <Input
              id="codigoUc"
              value={form.codigoUc}
              onChange={(e) => update("codigoUc", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cpfCnpj">CPF/CNPJ</Label>
            <Input
              id="cpfCnpj"
              value={form.cpfCnpj}
              onChange={(e) => update("cpfCnpj", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="consumerId">Consumidor</Label>
            <select
              id="consumerId"
              value={form.consumerId}
              onChange={(e) => update("consumerId", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
            >
              <option value="">— Sem consumidor vinculado —</option>
              {consumers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plantId">Usina Geradora</Label>
            <select
              id="plantId"
              value={form.plantId}
              onChange={(e) => update("plantId", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
            >
              <option value="">— Sem usina vinculada —</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="modalidade">Modalidade</Label>
            <select
              id="modalidade"
              value={form.modalidade}
              onChange={(e) => update("modalidade", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
            >
              <option value="">—</option>
              <option value="AUTOCONSUMO_REMOTO">Autoconsumo Remoto</option>
              <option value="GERACAO_COMPARTILHADA">Geração Compartilhada</option>
              <option value="AUTOCONSUMO_LOCAL">Autoconsumo Local</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Distribuidora */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuidora e Classificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="distribuidora">Distribuidora</Label>
            <Input
              id="distribuidora"
              value={form.distribuidora}
              onChange={(e) => update("distribuidora", e.target.value)}
              placeholder="RGE, CPFL, CEEE..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grupo">Grupo</Label>
            <Input
              id="grupo"
              value={form.grupo}
              onChange={(e) => update("grupo", e.target.value)}
              placeholder="A ou B"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subGrupo">Sub Grupo</Label>
            <Input
              id="subGrupo"
              value={form.subGrupo}
              onChange={(e) => update("subGrupo", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="consumoMedio">Consumo Médio (kWh)</Label>
            <Input
              id="consumoMedio"
              type="number"
              step="0.01"
              value={form.consumoMedio}
              onChange={(e) => update("consumoMedio", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="vigenciaCompensacao">Vigência de Compensação</Label>
            <Input
              id="vigenciaCompensacao"
              value={form.vigenciaCompensacao}
              onChange={(e) => update("vigenciaCompensacao", e.target.value)}
              placeholder="MM/AAAA"
            />
          </div>
          <div className="md:col-span-3">
            <label className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={form.temGeracaoPropria}
                onChange={(e) => update("temGeracaoPropria", e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Esta UC tem geração própria</p>
                <p className="text-xs text-muted-foreground">
                  Marque se houver placas solares no medidor desta UC. A Lei 14.300
                  determina que a distribuidora compensa primeiro a injeção própria
                  antes dos créditos da usina do rateio. Marca-se automaticamente
                  quando uma fatura chega com injeção &gt; 0.
                </p>
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Endereço */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="cep">CEP</Label>
            <Input
              id="cep"
              value={form.cep}
              onChange={(e) => update("cep", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="logradouro">Logradouro</Label>
            <Input
              id="logradouro"
              value={form.logradouro}
              onChange={(e) => update("logradouro", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="numero">Número</Label>
            <Input
              id="numero"
              value={form.numero}
              onChange={(e) => update("numero", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="complemento">Complemento</Label>
            <Input
              id="complemento"
              value={form.complemento}
              onChange={(e) => update("complemento", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cidade">Cidade</Label>
            <Input
              id="cidade"
              value={form.cidade}
              onChange={(e) => update("cidade", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Comercial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados Comerciais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="consultor">Consultor</Label>
            <Input
              id="consultor"
              value={form.consultor}
              onChange={(e) => update("consultor", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comissao">Comissão</Label>
            <Input
              id="comissao"
              value={form.comissao}
              onChange={(e) => update("comissao", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metodoPagamento">Método de Pagamento</Label>
            <select
              id="metodoPagamento"
              value={form.metodoPagamento}
              onChange={(e) => update("metodoPagamento", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
            >
              <option value="">— Selecione —</option>
              {METODOS_PAGAMENTO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="regraRemuneracao">Regra de Remuneração</Label>
            <select
              id="regraRemuneracao"
              value={form.regraRemuneracao}
              onChange={(e) => update("regraRemuneracao", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
            >
              <option value="">— Selecione —</option>
              {REGRAS_REMUNERACAO.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="percentCompensado">Desconto de Contrato</Label>
            <Input
              id="percentCompensado"
              type="number"
              step="0.01"
              value={form.percentCompensado}
              onChange={(e) => update("percentCompensado", e.target.value)}
              placeholder="0.80"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="percentBandeira">Desconto de Contrato sobre Bandeira</Label>
            <Input
              id="percentBandeira"
              type="number"
              step="0.01"
              value={form.percentBandeira}
              onChange={(e) => update("percentBandeira", e.target.value)}
              placeholder="0.80"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="regraVencimento">Regra de Vencimento</Label>
            <select
              id="regraVencimento"
              value={form.regraVencimento}
              onChange={(e) => {
                const v = e.target.value;
                update("regraVencimento", v);
                if (v !== "DIA_FIXO_MES") update("valorVencimento", "");
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
            >
              <option value="">— Selecione —</option>
              {REGRAS_VENCIMENTO.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {form.regraVencimento === "DIA_FIXO_MES" && (
            <div className="space-y-2">
              <Label htmlFor="valorVencimento">Dia do mês *</Label>
              <Input
                id="valorVencimento"
                type="number"
                min={1}
                max={31}
                step={1}
                value={form.valorVencimento}
                onChange={(e) => update("valorVencimento", e.target.value)}
                placeholder="Ex.: 10"
                required
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acesso e Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status e Acesso à Distribuidora</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="statusContrato">Status do Contrato</Label>
            <select
              id="statusContrato"
              value={form.statusContrato}
              onChange={(e) => update("statusContrato", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
            >
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Pendente">Pendente</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>
          <div />
          <div className="space-y-2">
            <Label htmlFor="loginDistribuidora">Login (Distribuidora)</Label>
            <Input
              id="loginDistribuidora"
              value={form.loginDistribuidora}
              onChange={(e) => update("loginDistribuidora", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senhaDistribuidora">Senha (Distribuidora)</Label>
            <Input
              id="senhaDistribuidora"
              type="password"
              value={form.senhaDistribuidora}
              onChange={(e) => update("senhaDistribuidora", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          type="submit"
          className="bg-green-700 hover:bg-green-800"
          disabled={saving}
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : submitLabel}
        </Button>
        <a href={cancelHref}>
          <Button type="button" variant="outline">
            Cancelar
          </Button>
        </a>
      </div>
    </form>
  );
}
