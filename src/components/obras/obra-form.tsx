"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ObraFormValues {
  nome: string;
  descricao: string;
  responsavel: string;
  cliente: string;
  local: string;
  status: string;
  dataInicioPrevista: string;
  dataFimPrevista: string;
  observacoes: string;
}

export const OBRA_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "PLANEJAMENTO", label: "Planejamento" },
  { value: "EM_EXECUCAO", label: "Em execução" },
  { value: "PAUSADA", label: "Pausada" },
  { value: "CONCLUIDA", label: "Concluída" },
  { value: "CANCELADA", label: "Cancelada" },
];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export function obraInitialValues(obra?: Partial<{
  nome: string;
  descricao: string | null;
  responsavel: string | null;
  cliente: string | null;
  local: string | null;
  status: string;
  dataInicioPrevista: string | null;
  dataFimPrevista: string | null;
  observacoes: string | null;
}>): ObraFormValues {
  return {
    nome: obra?.nome ?? "",
    descricao: obra?.descricao ?? "",
    responsavel: obra?.responsavel ?? "",
    cliente: obra?.cliente ?? "",
    local: obra?.local ?? "",
    status: obra?.status ?? "PLANEJAMENTO",
    dataInicioPrevista: toDateInput(obra?.dataInicioPrevista),
    dataFimPrevista: toDateInput(obra?.dataFimPrevista),
    observacoes: obra?.observacoes ?? "",
  };
}

interface ObraFormProps {
  mode: "create" | "edit";
  obraId?: string;
  initialValues: ObraFormValues;
}

export function ObraForm({ mode, obraId, initialValues }: ObraFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ObraFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof ObraFormValues>(key: K, value: ObraFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!values.nome.trim()) {
      toast.error("Informe o nome da obra");
      return;
    }
    if (
      values.dataInicioPrevista &&
      values.dataFimPrevista &&
      values.dataFimPrevista < values.dataInicioPrevista
    ) {
      toast.error("Data fim prevista não pode ser anterior à data início");
      return;
    }

    const payload = {
      nome: values.nome.trim(),
      descricao: values.descricao.trim() || null,
      responsavel: values.responsavel.trim() || null,
      cliente: values.cliente.trim() || null,
      local: values.local.trim() || null,
      status: values.status,
      dataInicioPrevista: values.dataInicioPrevista || null,
      dataFimPrevista: values.dataFimPrevista || null,
      observacoes: values.observacoes.trim() || null,
    };

    setSubmitting(true);
    try {
      const url = mode === "create" ? "/api/obras" : `/api/obras/${obraId}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao salvar" }));
        toast.error(err.error || "Erro ao salvar obra");
        return;
      }

      if (mode === "create") {
        const created = await res.json();
        toast.success("Obra criada");
        router.push(`/admin/obra/cronograma/${created.id}`);
      } else {
        toast.success("Obra atualizada");
        router.push(`/admin/obra/cronograma/${obraId}`);
      }
      router.refresh();
    } catch {
      toast.error("Erro de rede ao salvar obra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dados da obra</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              value={values.nome}
              onChange={(e) => update("nome", e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="cliente">Cliente</Label>
            <Input
              id="cliente"
              value={values.cliente}
              onChange={(e) => update("cliente", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="responsavel">Responsável</Label>
            <Input
              id="responsavel"
              value={values.responsavel}
              onChange={(e) => update("responsavel", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="local">Local</Label>
            <Input
              id="local"
              value={values.local}
              onChange={(e) => update("local", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={values.status} onValueChange={(v) => update("status", v ?? "PLANEJAMENTO")}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBRA_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="dataInicioPrevista">Início previsto</Label>
            <Input
              id="dataInicioPrevista"
              type="date"
              value={values.dataInicioPrevista}
              onChange={(e) => update("dataInicioPrevista", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dataFimPrevista">Fim previsto</Label>
            <Input
              id="dataFimPrevista"
              type="date"
              value={values.dataFimPrevista}
              onChange={(e) => update("dataFimPrevista", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              rows={3}
              value={values.descricao}
              onChange={(e) => update("descricao", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              rows={3}
              value={values.observacoes}
              onChange={(e) => update("observacoes", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : mode === "create" ? "Criar obra" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
