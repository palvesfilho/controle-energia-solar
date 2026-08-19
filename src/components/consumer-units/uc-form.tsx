"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import {
  CONCESSIONARIAS,
  isConcessionariaValida,
  normalizeConcessionaria,
} from "@/lib/concessionarias";
import { exigeCodigoUcAntigo, normalizeCodigoUc } from "@/lib/uc-codigo";

export interface UCFormData {
  nome: string;
  codigoUc: string;
  codigoUcAntigo: string;
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
  dataInicioContrato: string; // YYYY-MM-DD
  loginDistribuidora: string;
  senhaDistribuidora: string;
  temGeracaoPropria: boolean;
}

export const EMPTY_UC_FORM: UCFormData = {
  nome: "",
  codigoUc: "",
  codigoUcAntigo: "",
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
  dataInicioContrato: "",
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
  { value: "FAT_UNICA_COMPENSADA_BANDEIRAS", label: "Fatura Única Compensada Bandeiras" },
  {
    value: "FAT_UNICA_COMPENSADA_BANDEIRAS_DIMARZARI",
    label: "Fatura Única Compensada Bandeiras — DIMARZARI",
  },
  { value: "PERCENTUAL_SOBRE_COMPENSADO", label: "Percentual Sobre Compensado" },
  { value: "DESC_COMPENSADA", label: "Desconto sobre Energia Compensada" },
  { value: "DESC_FATURA_COMPENSADA_DOMMO", label: "Desconto sobre Fatura Compensada DOMMO" },
];

export const REGRAS_VENCIMENTO: { value: string; label: string }[] = [
  { value: "DIA_FIXO_MES", label: "Dia fixo do mês" },
  { value: "TRES_DIAS_ANTES_VENC", label: "3 dias antes do vencimento da fatura" },
];

// Percentuais são exibidos como inteiro (80 = 80%) e armazenados como decimal (0.80).
// A conversão acontece nas bordas: ao carregar do banco (percentDbToInput) e ao
// enviar pra API (percentInputToDb).
export const percentDbToInput = (v: number | null | undefined): string => {
  if (v == null) return "";
  // Arredonda em 2 casas para evitar lixo de float (ex.: 0.8 * 100 = 80.00000001).
  return String(Number((v * 100).toFixed(2)));
};

export const percentInputToDb = (v: string): string => {
  if (v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(Number((n / 100).toFixed(4)));
};

interface Props {
  initialData?: Partial<UCFormData>;
  onSubmit: (data: UCFormData) => Promise<void>;
  saving: boolean;
  error?: string;
  cancelHref: string;
  submitLabel?: string;
  /**
   * Painel exibido À DIREITA do card Identificação, em telas grandes.
   *
   * Existe para os documentos da adesão: os campos de identificação são
   * justamente os que se conferem olhando o papel — o CNPJ contra o cartão
   * CNPJ, o nome contra o contrato social. Ter o arquivo ao lado enquanto se
   * digita vale mais que um card no fim da página.
   *
   * Sem o painel, o card volta a ocupar a largura inteira: nenhuma tela que já
   * usa o formulário muda de aparência.
   */
  painelLateral?: React.ReactNode;
  /**
   * Quando a UC foi cadastrada. Só é usada para saber se o código antigo é
   * obrigatório (ver `exigeCodigoUcAntigo`). Ausente = cadastro novo, e aí a
   * data é agora.
   */
  createdAt?: string | Date | null;
}

export function UCForm({
  initialData,
  onSubmit,
  saving,
  error,
  cancelHref,
  submitLabel = "Salvar",
  painelLateral,
  createdAt,
}: Props) {
  const [form, setForm] = useState<UCFormData>(() => {
    const base = { ...EMPTY_UC_FORM, ...initialData };
    // O campo era texto livre e virou lista fechada. Sem normalizar, cadastro
    // legado ("RGE", "NOVA PALMA") não casaria com nenhuma opção, o select
    // apareceria vazio e o salvar apagaria o valor em silêncio.
    return {
      ...base,
      distribuidora: normalizeConcessionaria(base.distribuidora) ?? base.distribuidora,
    };
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

  // Avisa só quando o campo é OBRIGATÓRIO e está vazio. A regra dispensa o
  // código antigo de quem entrou a partir de 01/08/2026 no modelo de desconto:
  // essa UC não tem histórico anterior a importar, e cobrar o campo dela seria
  // alarme falso. Ver `exigeCodigoUcAntigo`.
  //
  // O form guarda o percentual como o operador digita (15), o banco guarda a
  // fração (0,85) — a conversão é a mesma do submit.
  const avisoCodigoAntigo =
    !form.codigoUcAntigo.trim() &&
    exigeCodigoUcAntigo({
      codigoUc: normalizeCodigoUc(form.codigoUc) ?? form.codigoUc,
      createdAt: createdAt ?? new Date(),
      percentCompensado: Number(percentInputToDb(form.percentCompensado)) || null,
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      ...form,
      percentCompensado: percentInputToDb(form.percentCompensado),
      percentBandeira: percentInputToDb(form.percentBandeira),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Identificação — com os documentos ao lado, quando houver. */}
      <div
        className={
          painelLateral
            ? "grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)] lg:items-start"
            : undefined
        }
      >
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
              placeholder="3.562.981.001-26"
              required
            />
            <p className="text-xs text-muted-foreground">
              Número atual (novo, a partir de jul/2026)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="codigoUcAntigo">Código da instalação (antigo)</Label>
            <Input
              id="codigoUcAntigo"
              value={form.codigoUcAntigo}
              onChange={(e) => update("codigoUcAntigo", e.target.value)}
            />
            {avisoCodigoAntigo ? (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                Sem ele, as faturas anteriores a jun/2026 não encontram esta UC e
                entram como pendentes, sem erro na tela.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Código anterior à migração da RGE. Faturas antigas casam por ele.
              </p>
            )}
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
        {painelLateral}
      </div>

      {/* Distribuidora */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuidora e Classificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="distribuidora">Concessionária</Label>
            {/* Lista fechada: este valor é a fonte da concessionária da
                credencial de acesso ao portal, que não pergunta de novo. */}
            <select
              id="distribuidora"
              value={form.distribuidora}
              onChange={(e) => update("distribuidora", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
            >
              <option value="">—</option>
              {CONCESSIONARIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {/* Valor de cadastro antigo que a lista não reconhece: fica
                  visível e selecionado em vez de sumir calado (o operador troca
                  quando quiser). Ver feedback_anomalias_sinalizar. */}
              {form.distribuidora && !isConcessionariaValida(form.distribuidora) && (
                <option value={form.distribuidora}>
                  {form.distribuidora} (fora da lista)
                </option>
              )}
            </select>
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
          <div className="space-y-2">
            <Label htmlFor="vigenciaCompensacao">Vigência de Compensação</Label>
            <Input
              id="vigenciaCompensacao"
              value={form.vigenciaCompensacao}
              onChange={(e) => update("vigenciaCompensacao", e.target.value)}
              placeholder="MM/AAAA"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dataInicioContrato">Início do Contrato</Label>
            <Input
              id="dataInicioContrato"
              type="date"
              value={form.dataInicioContrato}
              onChange={(e) => update("dataInicioContrato", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Marco zero pra cálculo de economia/crédito acumulado.
            </p>
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
            <Label htmlFor="percentCompensado">Desconto de Contrato (%)</Label>
            <div className="relative">
              <Input
                id="percentCompensado"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={form.percentCompensado}
                onChange={(e) => update("percentCompensado", e.target.value)}
                placeholder="80"
                className="pr-7"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="percentBandeira">Desconto de Contrato sobre Bandeira (%)</Label>
            <div className="relative">
              <Input
                id="percentBandeira"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={form.percentBandeira}
                onChange={(e) => update("percentBandeira", e.target.value)}
                placeholder="80"
                className="pr-7"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
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
            <PasswordInput
              id="senhaDistribuidora"
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
