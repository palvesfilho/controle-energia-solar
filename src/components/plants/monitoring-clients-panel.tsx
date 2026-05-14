"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKWh } from "@/lib/formatters";

interface LinkedClient {
  id: string;
  nome: string;
  cpfCnpj: string | null;
  codigoUc: string | null;
  cidade: string | null;
  uf: string | null;
  plataformaMonitoramento: string | null;
  monitoramentoPlantId: string | null;
  statusMonitoramento: string | null;
  ultimaLeitura: string | null;
  ultimaGeracao: number | null;
  geracaoMesAtual: number | null;
  performanceRatio: number | null;
  potenciaInstalada: number | null;
  proprietario: { id: string; nome: string } | null;
}

interface LinkableClient {
  id: string;
  nome: string;
  cpfCnpj: string | null;
  codigoUc: string | null;
  cidade: string | null;
  uf: string | null;
  plataformaMonitoramento: string | null;
  proprietario: { id: string; nome: string } | null;
  plantId: string | null;
}

interface Props {
  plantId: string;
  embedded?: boolean;
}

export function MonitoringClientsPanel({ plantId, embedded }: Props) {
  const [linked, setLinked] = useState<LinkedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const loadLinked = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/plants/${plantId}/monitoring`);
      const data = await r.json();
      setLinked(data.clients ?? []);
    } finally {
      setLoading(false);
    }
  }, [plantId]);

  useEffect(() => {
    loadLinked();
  }, [loadLinked]);

  async function handleLink(clientId: string) {
    setSaving(clientId);
    try {
      const r = await fetch(`/api/plants/${plantId}/monitoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brasilSolarClientId: clientId }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err.error || "Falha ao vincular");
        return;
      }
      setPickerOpen(false);
      await loadLinked();
    } finally {
      setSaving(null);
    }
  }

  async function handleUnlink(clientId: string) {
    if (!confirm("Desvincular esta usina monitorada da Plant?")) return;
    setSaving(clientId);
    try {
      const r = await fetch(`/api/plants/${plantId}/monitoring/${clientId}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err.error || "Falha ao desvincular");
        return;
      }
      await loadLinked();
    } finally {
      setSaving(null);
    }
  }

  const totalMes = useMemo(
    () => linked.reduce((sum, c) => sum + (c.geracaoMesAtual ?? 0), 0),
    [linked],
  );
  const totalPotencia = useMemo(
    () => linked.reduce((sum, c) => sum + (c.potenciaInstalada ?? 0), 0),
    [linked],
  );

  const body = (
    <>
      {embedded && (
        <div className="flex justify-end px-4 pt-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>
      )}
      {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : linked.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma usina monitorada vinculada. Clique em <b>Adicionar</b> para vincular
            uma usina Brasil Solar que injete energia nesta fatura.
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b flex items-center gap-4 text-xs text-muted-foreground bg-muted/30">
              <span>
                <b className="text-foreground">{linked.length}</b> usina{linked.length > 1 ? "s" : ""}
              </span>
              <span>
                Potência total:{" "}
                <b className="text-foreground">{totalPotencia > 0 ? `${totalPotencia.toFixed(2)} kWp` : "-"}</b>
              </span>
              <span>
                Geração do mês:{" "}
                <b className="text-foreground">{totalMes > 0 ? formatKWh(totalMes) : "-"}</b>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Nome</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Plataforma</th>
                    <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Potência</th>
                    <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Mês atual</th>
                    <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Última leitura</th>
                    <th className="py-2 px-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {linked.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-medium">{c.nome}</div>
                        {c.codigoUc && (
                          <div className="text-xs text-muted-foreground">UC {c.codigoUc}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs">{c.plataformaMonitoramento ?? "-"}</td>
                      <td className="py-2.5 px-3 text-right">
                        {c.potenciaInstalada ? `${c.potenciaInstalada.toFixed(2)} kWp` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {c.geracaoMesAtual != null ? formatKWh(c.geracaoMesAtual) : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs text-muted-foreground">
                        {c.ultimaLeitura ? new Date(c.ultimaLeitura).toLocaleDateString("pt-BR") : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          disabled={saving === c.id}
                          onClick={() => handleUnlink(c.id)}
                          className="p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-colors disabled:opacity-50"
                          title="Desvincular"
                        >
                          {saving === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </>
  );

  const picker = pickerOpen ? (
    <ClientPicker
      plantId={plantId}
      onClose={() => setPickerOpen(false)}
      onPick={handleLink}
      savingId={saving}
    />
  ) : null;

  if (embedded) {
    return (
      <>
        {body}
        {picker}
      </>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Usinas Monitoradas (Inversores)</CardTitle>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0">{body}</CardContent>
      {picker}
    </Card>
  );
}

function ClientPicker({
  plantId,
  onClose,
  onPick,
  savingId,
}: {
  plantId: string;
  onClose: () => void;
  onPick: (id: string) => void;
  savingId: string | null;
}) {
  const [options, setOptions] = useState<LinkableClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const url = new URL("/api/brasil-solar/linkable", window.location.origin);
    url.searchParams.set("plantId", plantId);
    if (search) url.searchParams.set("search", search);
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(url.toString(), { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) => setOptions(d.clients ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      ctl.abort();
      clearTimeout(timer);
    };
  }, [plantId, search]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-background border rounded-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Vincular usina monitorada</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-b">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar por nome, CPF/CNPJ, UC, cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
            </div>
          ) : options.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma usina monitorada disponível{search ? " pra essa busca" : ""}.
            </div>
          ) : (
            options.map((c) => {
              const jaVinculado = c.plantId === plantId;
              return (
                <button
                  key={c.id}
                  disabled={jaVinculado || savingId === c.id}
                  onClick={() => onPick(c.id)}
                  className="w-full text-left px-4 py-2.5 border-b last:border-0 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{c.nome}</div>
                      <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                        {c.plataformaMonitoramento && <span>[{c.plataformaMonitoramento}]</span>}
                        {c.codigoUc && <span>UC {c.codigoUc}</span>}
                        {c.cidade && <span>{c.cidade}/{c.uf ?? ""}</span>}
                        {c.cpfCnpj && <span>{c.cpfCnpj}</span>}
                      </div>
                      {c.proprietario?.nome && (
                        <div className="text-xs text-muted-foreground">
                          Prop.: {c.proprietario.nome}
                        </div>
                      )}
                    </div>
                    {jaVinculado && (
                      <span className="text-xs text-green-600 font-medium whitespace-nowrap">
                        Já vinculado
                      </span>
                    )}
                    {savingId === c.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
