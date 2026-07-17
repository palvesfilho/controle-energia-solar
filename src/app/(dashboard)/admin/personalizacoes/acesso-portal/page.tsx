"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Valores {
  mensal: number;
  anual: number;
}

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AcessoPortalParametrosPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mensal, setMensal] = useState("0");
  const [anual, setAnual] = useState("0");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/personalizacoes/acesso-portal");
      if (!res.ok) {
        toast.error("Erro ao carregar valores");
        return;
      }
      const j: Valores = await res.json();
      setMensal(String(j.mensal ?? 0));
      setAnual(String(j.anual ?? 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const save = useCallback(async () => {
    const m = Number(mensal.replace(",", "."));
    const a = Number(anual.replace(",", "."));
    if (!Number.isFinite(m) || m < 0 || !Number.isFinite(a) || a < 0) {
      toast.error("Informe valores maiores ou iguais a zero.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/personalizacoes/acesso-portal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensal: m, anual: a }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao salvar");
        return;
      }
      toast.success("Valores de tabela salvos");
      await fetchData();
    } finally {
      setSaving(false);
    }
  }, [mensal, anual, fetchData]);

  const mensalNum = Number(mensal.replace(",", ".")) || 0;
  const anualNum = Number(anual.replace(",", ".")) || 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-700 text-white">
          <KeyRound className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Acesso ao portal do cliente</h1>
          <p className="text-sm text-muted-foreground">
            Valores de tabela cobrados no convite de acesso ao portal do cliente
            Brasil Solar.
          </p>
        </div>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Valores de tabela</CardTitle>
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
                <Label htmlFor="mensal">Valor mensal de tabela (R$)</Label>
                <Input
                  id="mensal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={mensal}
                  onChange={(e) => setMensal(e.target.value)}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Cobrado na modalidade <strong>Mensal (recorrente)</strong> e usado
                  como piso mínimo no modo <strong>Personalizado</strong> mensal.
                  {mensalNum > 0 && <> Atual: {formatBRL(mensalNum)}/mês.</>}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="anual">Valor anual de tabela (R$)</Label>
                <Input
                  id="anual"
                  type="number"
                  step="0.01"
                  min="0"
                  value={anual}
                  onChange={(e) => setAnual(e.target.value)}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Cobrado na modalidade <strong>Anual (à vista)</strong> e usado como
                  piso mínimo no modo <strong>Personalizado</strong> anual.
                  {anualNum > 0 && <> Atual: {formatBRL(anualNum)}/ano.</>}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button onClick={save} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Enquanto os valores estiverem em R$ 0,00, as opções Mensal e Anual do
                convite aparecem zeradas. Defina os valores aqui antes de enviar
                convites cobrados.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
