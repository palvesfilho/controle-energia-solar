"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardCheck, Check, X, Search } from "lucide-react";

interface ObraPendente {
  id: string;
  nome: string;
  cliente: string | null;
  local: string | null;
  createdAt: string;
  brasilSolarProprietarioId: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

export default function AprovacaoObrasPage() {
  const [obras, setObras] = useState<ObraPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch("/api/obras?aprovacao=PENDENTE")
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          let detail = text.slice(0, 300) || "(resposta vazia)";
          try {
            const j = JSON.parse(text);
            detail = [j.error, j.hint].filter(Boolean).join(" — ") || detail;
          } catch {}
          throw new Error(`HTTP ${res.status}: ${detail}`);
        }
        return res.json();
      })
      .then((data) => setObras(Array.isArray(data) ? data : []))
      .catch((err: Error) => {
        console.error("Erro ao carregar obras pendentes:", err);
        toast.error(`Erro ao carregar obras pendentes: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function decidir(obraId: string, aprovacao: "ACEITA" | "RECUSADA") {
    setActing(obraId);
    try {
      const res = await fetch(`/api/obras/${obraId}/aprovacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aprovacao }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      toast.success(
        aprovacao === "ACEITA"
          ? "Obra aceita e enviada ao cronograma."
          : "Obra recusada."
      );
      setObras((prev) => prev.filter((o) => o.id !== obraId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao atualizar: ${msg}`);
    } finally {
      setActing(null);
    }
  }

  const term = search.trim().toLowerCase();
  const filtered = term
    ? obras.filter(
        (o) =>
          o.nome.toLowerCase().includes(term) ||
          (o.cliente ?? "").toLowerCase().includes(term) ||
          (o.local ?? "").toLowerCase().includes(term)
      )
    : obras;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Aprovação de Obras</h1>
          <p className="text-sm text-muted-foreground">
            Obras geradas automaticamente quando um novo proprietário é cadastrado. Aceite para enviar ao cronograma.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, cliente, local…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Carregando…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {obras.length === 0
              ? "Nenhuma obra aguardando aprovação."
              : "Nenhuma obra encontrada para esta busca."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((obra) => (
            <Card key={obra.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{obra.nome}</h3>
                      <Badge variant="outline">Pendente</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {obra.cliente && <span>Cliente: {obra.cliente}</span>}
                      {obra.local && <span> · Local: {obra.local}</span>}
                      <span> · Criada em {formatDate(obra.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting === obra.id}
                      onClick={() => decidir(obra.id, "RECUSADA")}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Recusar
                    </Button>
                    <Button
                      size="sm"
                      disabled={acting === obra.id}
                      onClick={() => decidir(obra.id, "ACEITA")}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Aceitar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
