"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CalendarRange, Plus, Eye, Pencil, Search } from "lucide-react";

interface ObraRow {
  id: string;
  nome: string;
  cliente: string | null;
  responsavel: string | null;
  local: string | null;
  status: string;
  dataInicioPrevista: string | null;
  dataFimPrevista: string | null;
  progresso: number;
  _count: { tarefas: number };
  equipe: { id: string; nome: string; cor: string | null } | null;
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PLANEJAMENTO: { label: "Planejamento", variant: "outline" },
  EM_EXECUCAO: { label: "Em execução", variant: "default" },
  PAUSADA: { label: "Pausada", variant: "secondary" },
  CONCLUIDA: { label: "Concluída", variant: "secondary" },
  CANCELADA: { label: "Cancelada", variant: "destructive" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

export default function CronogramaObrasPage() {
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/obras")
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
        console.error("Erro ao carregar obras:", err);
        toast.error(`Erro ao carregar obras: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? obras.filter(
        (o) =>
          o.nome.toLowerCase().includes(term) ||
          (o.cliente ?? "").toLowerCase().includes(term) ||
          (o.responsavel ?? "").toLowerCase().includes(term) ||
          (o.local ?? "").toLowerCase().includes(term)
      )
    : obras;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white">
            <CalendarRange className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cronograma de Obras</h1>
            <p className="text-sm text-muted-foreground">
              Planejamento e execução das obras em formato Gantt com dependências
            </p>
          </div>
        </div>
        <Link href="/admin/obra/cronograma/nova" className={cn(buttonVariants())}>
          <Plus className="mr-2 h-4 w-4" />
          Nova obra
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, cliente, responsável, local…"
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
              ? "Nenhuma obra cadastrada ainda. Clique em \"Nova obra\" para começar."
              : "Nenhuma obra encontrada para esta busca."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((obra) => {
            const statusInfo = STATUS_LABEL[obra.status] ?? { label: obra.status, variant: "outline" as const };
            return (
              <Card key={obra.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {obra.equipe?.cor && (
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-full border border-border"
                            style={{ backgroundColor: obra.equipe.cor }}
                            title={`Equipe: ${obra.equipe.nome}`}
                            aria-label={`Equipe ${obra.equipe.nome}`}
                          />
                        )}
                        <h3 className="truncate font-semibold">{obra.nome}</h3>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {obra.cliente && <span>Cliente: {obra.cliente} · </span>}
                        {obra.responsavel && <span>Resp.: {obra.responsavel} · </span>}
                        {obra.equipe && <span>Equipe: {obra.equipe.nome} · </span>}
                        {obra.local && <span>Local: {obra.local}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Início previsto: {formatDate(obra.dataInicioPrevista)} · Fim previsto:{" "}
                        {formatDate(obra.dataFimPrevista)} · {obra._count.tarefas} tarefa
                        {obra._count.tarefas === 1 ? "" : "s"}
                      </div>
                      <div className="pt-2">
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progresso</span>
                          <span>{Math.round(obra.progresso)}%</span>
                        </div>
                        <Progress value={obra.progresso} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        href={`/admin/obra/cronograma/${obra.id}`}
                        aria-label="Ver detalhes"
                        className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/admin/obra/cronograma/${obra.id}/editar`}
                        aria-label="Editar"
                        className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
