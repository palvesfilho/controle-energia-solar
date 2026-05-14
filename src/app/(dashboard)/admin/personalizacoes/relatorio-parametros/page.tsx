"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, FileText, Save, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Params {
  reajusteTarifaAnual: number;
  depreciacaoModuloAnual: number;
  defaults: {
    reajusteTarifaAnual: number;
    depreciacaoModuloAnual: number;
  };
}

function pctToInput(v: number): string {
  // 0.07 → "7"
  return (v * 100).toString();
}

function inputToPct(s: string): number {
  // "7" → 0.07
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n / 100 : 0;
}

export default function RelatorioParametrosPage() {
  const [data, setData] = useState<Params | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reajuste, setReajuste] = useState("7");
  const [depreciacao, setDepreciacao] = useState("0.5");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/personalizacoes/relatorio-parametros");
      if (!res.ok) {
        toast.error("Erro ao carregar parâmetros");
        return;
      }
      const j: Params = await res.json();
      setData(j);
      setReajuste(pctToInput(j.reajusteTarifaAnual));
      setDepreciacao(pctToInput(j.depreciacaoModuloAnual));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/personalizacoes/relatorio-parametros", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reajusteTarifaAnual: inputToPct(reajuste),
          depreciacaoModuloAnual: inputToPct(depreciacao),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao salvar");
        return;
      }
      toast.success("Parâmetros salvos");
      await fetchData();
    } finally {
      setSaving(false);
    }
  }, [reajuste, depreciacao, fetchData]);

  const restoreDefaults = useCallback(() => {
    if (!data) return;
    setReajuste(pctToInput(data.defaults.reajusteTarifaAnual));
    setDepreciacao(pctToInput(data.defaults.depreciacaoModuloAnual));
  }, [data]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 text-white">
          <FileText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Parâmetros do relatório</h1>
          <p className="text-sm text-muted-foreground">
            Variáveis usadas no cálculo de payback dos relatórios Brasil Solar.
          </p>
        </div>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Projeção de payback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="reajuste">Reajuste anual da tarifa de energia (%)</Label>
                <Input
                  id="reajuste"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={reajuste}
                  onChange={(e) => setReajuste(e.target.value)}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Quanto a tarifa da concessionária sobe a cada ano. Default {(data?.defaults.reajusteTarifaAnual ?? 0.07) * 100}%.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="depreciacao">Depreciação anual dos módulos (%)</Label>
                <Input
                  id="depreciacao"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={depreciacao}
                  onChange={(e) => setDepreciacao(e.target.value)}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Quanto os módulos perdem de eficiência a cada ano. Default {(data?.defaults.depreciacaoModuloAnual ?? 0.005) * 100}%.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
                <Button variant="outline" onClick={restoreDefaults} disabled={saving}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restaurar padrões
                </Button>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Esses parâmetros não aparecem no PDF do relatório — só afetam o
                cálculo da data de quitação prevista. Validação: cada campo
                aceita 0% a 100%.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
