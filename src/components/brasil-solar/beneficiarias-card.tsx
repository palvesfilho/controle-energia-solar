"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Users, Check } from "lucide-react";

interface Beneficiaria {
  id: string;
  codigoUc: string;
  nome: string | null;
  percentual: number;
  observacoes: string | null;
}

interface Draft {
  codigoUc: string;
  nome: string;
  percentual: string;
}

const emptyDraft = (): Draft => ({ codigoUc: "", nome: "", percentual: "" });

function toDraft(b: Beneficiaria): Draft {
  return {
    codigoUc: b.codigoUc,
    nome: b.nome ?? "",
    percentual: Number.isFinite(b.percentual) ? String(b.percentual) : "",
  };
}

function sumPercent(drafts: Draft[]): number {
  return drafts.reduce((acc, d) => {
    const v = parseFloat(d.percentual);
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);
}

function fmtPercent(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function BeneficiariasCard({ proprietarioId }: { proprietarioId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [beneficiarias, setBeneficiarias] = useState<Beneficiaria[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/brasil-solar/proprietarios/${proprietarioId}/beneficiarias`,
      );
      if (!res.ok) throw new Error();
      const json = await res.json();
      setBeneficiarias(json.beneficiarias ?? []);
    } catch {
      // silencioso — primeira carga, sem dados
      setBeneficiarias([]);
    } finally {
      setLoading(false);
    }
  }, [proprietarioId]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit() {
    setDrafts(
      beneficiarias.length > 0 ? beneficiarias.map(toDraft) : [emptyDraft()],
    );
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDrafts([]);
  }

  function updateDraft(idx: number, patch: Partial<Draft>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  }

  function addRow() {
    setDrafts((prev) => [...prev, emptyDraft()]);
  }

  function removeRow(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const cleaned = drafts.filter(
      (d) => d.codigoUc.trim() || d.percentual.trim() || d.nome.trim(),
    );
    for (const d of cleaned) {
      if (!d.codigoUc.trim()) {
        toast.error("Toda linha precisa de um Código UC");
        return;
      }
      const p = parseFloat(d.percentual);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        toast.error(`Percentual inválido para UC ${d.codigoUc}`);
        return;
      }
    }
    if (cleaned.length > 0) {
      const soma = sumPercent(cleaned);
      if (Math.abs(soma - 100) > 0.01) {
        toast.error(
          `A soma dos percentuais precisa ser 100% (atual: ${fmtPercent(soma)}%)`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/brasil-solar/proprietarios/${proprietarioId}/beneficiarias`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            beneficiarias: cleaned.map((d) => ({
              codigoUc: d.codigoUc.trim(),
              nome: d.nome.trim() || null,
              percentual: parseFloat(d.percentual),
            })),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Erro ao salvar", { description: json.error });
        return;
      }
      setBeneficiarias(json.beneficiarias ?? []);
      setEditing(false);
      setDrafts([]);
      toast.success("Beneficiárias atualizadas");
    } finally {
      setSaving(false);
    }
  }

  const soma = editing ? sumPercent(drafts) : null;
  const hasRows = editing ? drafts.length > 0 : beneficiarias.length > 0;
  const somaOk =
    soma === null || drafts.length === 0 || Math.abs(soma - 100) <= 0.01;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-700" />
            <CardTitle className="text-base">Beneficiárias dos créditos</CardTitle>
          </div>
          {!editing && !loading && (
            <Button
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800"
              onClick={startEdit}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {beneficiarias.length === 0
                ? "Cadastrar Beneficiárias"
                : "Editar"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : !editing ? (
          beneficiarias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma beneficiária cadastrada. Cadastre as UCs do mesmo titular que
              recebem os créditos gerados pelas usinas deste proprietário.
            </p>
          ) : (
            <div className="overflow-hidden border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Código UC</th>
                    <th className="text-left font-medium px-3 py-2">Nome</th>
                    <th className="text-right font-medium px-3 py-2 w-32">
                      Percentual
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {beneficiarias.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2 font-mono">{b.codigoUc}</td>
                      <td className="px-3 py-2">{b.nome || "—"}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {fmtPercent(b.percentual)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/20">
                    <td className="px-3 py-2 font-medium" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {fmtPercent(
                        beneficiarias.reduce((acc, b) => acc + b.percentual, 0),
                      )}
                      %
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cadastre as UCs do mesmo titular que recebem créditos. A soma dos
              percentuais deve ser <strong>100%</strong>. A UC da usina (titular)
              não entra nesta lista — só as que recebem.
            </p>
            <div className="space-y-2">
              {drafts.map((d, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-end border rounded-lg p-3 bg-muted/20"
                >
                  <div className="col-span-12 sm:col-span-4 space-y-1.5">
                    <Label htmlFor={`uc-${idx}`} className="text-xs">
                      Código UC
                    </Label>
                    <Input
                      id={`uc-${idx}`}
                      value={d.codigoUc}
                      onChange={(e) =>
                        updateDraft(idx, { codigoUc: e.target.value })
                      }
                      placeholder="Ex.: 3095464357"
                      className="font-mono"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-5 space-y-1.5">
                    <Label htmlFor={`nome-${idx}`} className="text-xs">
                      Nome (opcional)
                    </Label>
                    <Input
                      id={`nome-${idx}`}
                      value={d.nome}
                      onChange={(e) => updateDraft(idx, { nome: e.target.value })}
                      placeholder="Filial centro, residência..."
                    />
                  </div>
                  <div className="col-span-9 sm:col-span-2 space-y-1.5">
                    <Label htmlFor={`pct-${idx}`} className="text-xs">
                      Percentual
                    </Label>
                    <Input
                      id={`pct-${idx}`}
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={d.percentual}
                      onChange={(e) =>
                        updateDraft(idx, { percentual: e.target.value })
                      }
                      placeholder="0,00"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1 flex justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeRow(idx)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      aria-label="Remover linha"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Adicionar UC
            </Button>

            {hasRows && (
              <div
                className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
                  somaOk
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                <span>Soma dos percentuais</span>
                <span className="font-semibold flex items-center gap-1.5">
                  {somaOk && <Check className="h-4 w-4" />}
                  {fmtPercent(soma ?? 0)}%
                  {!somaOk && <span className="font-normal">(precisa ser 100%)</span>}
                </span>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-emerald-700 hover:bg-emerald-800"
                onClick={save}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Check className="h-4 w-4 mr-1.5" />
                )}
                Salvar beneficiárias
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
