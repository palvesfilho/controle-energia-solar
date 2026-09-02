"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Eye, Trash2, ArrowUpDown, Users, UserCheck, UserX, Sun, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useFiltroTabela, type Faceta } from "@/lib/filtro-tabela";
import { FiltrosTabela } from "@/components/ui/filtros-tabela";
import { FiltroColuna } from "@/components/ui/filtro-coluna";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const FRASE_CONFIRMACAO = "quero mesmo excluir investidor";

interface InvestorData {
  id: string;
  phone: string | null;
  document: string | null;
  user: { id: string; email: string; name: string; active: boolean };
  plants: { plant: { id: string; name: string } }[];
}

type SortKey = "name" | "email" | "usinas" | "status";
type SortDir = "asc" | "desc";

/** Fora do componente para a identidade do array não mudar a cada render. */
const FACETAS: Faceta<InvestorData>[] = [
  {
    chave: "usina",
    label: "Usina",
    // Investidor com mais de uma usina aparece em qualquer uma delas.
    valor: (i) => i.plants.map((p) => p.plant.name),
  },
  {
    chave: "status",
    label: "Status",
    valor: (i) => (i.user.active ? "Ativo" : "Inativo"),
  },
];

export default function InvestidoresPage() {
  const [investors, setInvestors] = useState<InvestorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const [confirmTarget, setConfirmTarget] = useState<InvestorData | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fraseBate = confirmText.trim().toLowerCase() === FRASE_CONFIRMACAO;

  function abrirConfirmacao(inv: InvestorData) {
    setConfirmTarget(inv);
    setConfirmText("");
  }

  function fecharConfirmacao() {
    if (deleting) return;
    setConfirmTarget(null);
    setConfirmText("");
  }

  async function confirmarExclusao() {
    if (!confirmTarget || !fraseBate) return;
    setDeleting(true);
    const inv = confirmTarget;
    try {
      const res = await fetch(`/api/investors/${inv.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data.details)) {
          toast.error("Não é possível excluir", {
            description: `Vínculos existentes: ${data.details.join(", ")}`,
          });
        } else {
          toast.error(data.error ?? "Falha ao excluir investidor");
        }
        return;
      }

      toast.success(`${inv.user.name} excluído`);
      setInvestors((prev) => prev.filter((i) => i.id !== inv.id));
      setConfirmTarget(null);
      setConfirmText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    fetch("/api/investors")
      .then((res) => res.json())
      .then(setInvestors)
      .finally(() => setLoading(false));
  }, []);

  const filtro = useFiltroTabela(investors, {
    sincronizarUrl: true,
    busca: (inv) => [inv.user.name, inv.user.email, inv.phone, inv.document],
    facetas: FACETAS,
  });

  const filtered = useMemo(() => {
    const rows = [...filtro.filtrados];

    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "name":
          return a.user.name.localeCompare(b.user.name) * dir;
        case "email":
          return a.user.email.localeCompare(b.user.email) * dir;
        case "usinas":
          return (a.plants.length - b.plants.length) * dir;
        case "status":
          return (Number(a.user.active) - Number(b.user.active)) * dir;
      }
    });
    return rows;
  }, [filtro.filtrados, sort]);

  // Os cards descrevem a lista que está embaixo deles — contam sobre `filtered`.
  // O "N de M" acima da tabela é da própria barra de filtros.
  const statsFiltrados = useMemo(
    () => ({
      total: filtered.length,
      ativos: filtered.filter((i) => i.user.active).length,
      inativos: filtered.filter((i) => !i.user.active).length,
      comUsinas: filtered.filter((i) => i.plants.length > 0).length,
    }),
    [filtered],
  );

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investidores</h1>
          <p className="text-sm text-muted-foreground">Gerencie os investidores cadastrados</p>
        </div>
        <Link
          href="/admin/investidores/novo"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Investidor
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total" value={statsFiltrados.total} accent="blue" />
        <StatCard icon={<UserCheck className="h-4 w-4" />} label="Ativos" value={statsFiltrados.ativos} accent="emerald" />
        <StatCard icon={<UserX className="h-4 w-4" />} label="Inativos" value={statsFiltrados.inativos} accent="zinc" />
        <StatCard icon={<Sun className="h-4 w-4" />} label="Com usinas" value={statsFiltrados.comUsinas} accent="amber" />
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <FiltrosTabela
            filtro={filtro}
            placeholder="Buscar por nome, email, telefone ou documento..."
            substantivo="investidores"
            exportar={{ tabela: "investidores", nome: "investidores", aba: "Investidores" }}
          />

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {investors.length === 0 ? "Nenhum investidor cadastrado." : "Nenhum resultado para os filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-tabela="investidores">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortHeader label="Nome" active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
                    <SortHeader label="Email" active={sort.key === "email"} dir={sort.dir} onClick={() => toggleSort("email")} />
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Telefone</th>
                    <SortHeader
                      label="Usinas"
                      active={sort.key === "usinas"}
                      dir={sort.dir}
                      onClick={() => toggleSort("usinas")}
                      filtro={<FiltroColuna filtro={filtro} chave="usina" />}
                    />
                    <SortHeader
                      label="Status"
                      align="center"
                      active={sort.key === "status"}
                      dir={sort.dir}
                      onClick={() => toggleSort("status")}
                      filtro={<FiltroColuna filtro={filtro} chave="status" />}
                    />
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">
                        <Link
                          href={`/admin/investidores/${inv.id}/editar`}
                          title="Editar"
                          className="text-left hover:text-primary hover:underline underline-offset-2 transition-colors"
                        >
                          {inv.user.name}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{inv.user.email}</td>
                      <td className="py-2.5 px-3">{inv.phone ?? "-"}</td>
                      <td className="py-2.5 px-3">
                        {inv.plants.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Sun className="h-3 w-3 text-amber-500" />
                            {inv.plants.length}{" "}
                            <span className="text-muted-foreground truncate max-w-[200px]">
                              ·{" "}
                              {inv.plants.map((p, i) => (
                                <span key={p.plant.id}>
                                  {i > 0 && ", "}
                                  <Link
                                    href={`/admin/usinas/${p.plant.id}`}
                                    title="Abrir / editar usina"
                                    className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                                  >
                                    {p.plant.name}
                                  </Link>
                                </span>
                              ))}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Nenhuma</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={inv.user.active ? "default" : "secondary"}
                          className={inv.user.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                        >
                          {inv.user.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/admin/investidores/${inv.id}`}
                            title="Ver detalhes"
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            href={`/admin/investidores/${inv.id}/editar`}
                            title="Editar"
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => abrirConfirmacao(inv)}
                            title="Excluir"
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmTarget !== null} onOpenChange={(open) => !open && fecharConfirmacao()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-center text-lg">
              Excluir investidor?
            </DialogTitle>
            <DialogDescription className="text-center">
              Você está prestes a excluir{" "}
              <span className="font-semibold text-foreground">
                {confirmTarget?.user.name}
              </span>{" "}
              <span className="text-muted-foreground">({confirmTarget?.user.email})</span>.
              <br />
              <span className="text-red-600 font-medium">Esta ação é permanente e não pode ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-2">
            <label className="block text-sm font-medium">
              Para confirmar, digite a frase abaixo:
            </label>
            <div className="rounded-md bg-muted px-3 py-2 text-sm font-mono select-all">
              {FRASE_CONFIRMACAO}
            </div>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Digite a frase exata aqui"
              autoFocus
              disabled={deleting}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
            />
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <button
              type="button"
              onClick={fecharConfirmacao}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarExclusao}
              disabled={!fraseBate || deleting}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? "Excluindo..." : "Excluir definitivamente"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
  filtro,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "center";
  /** Funil da coluna. Fica FORA do botao de ordenar: clicar nele nao ordena. */
  filtro?: ReactNode;
}) {
  return (
    <th className={`py-2 px-3 font-medium text-xs uppercase tracking-wide ${align === "center" ? "text-center" : "text-left"}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"} ${active && dir === "desc" ? "rotate-180" : ""} transition-transform`} />
      </button>
      {filtro}
    </th>
  );
}

const ACCENT_CLASSES = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: keyof typeof ACCENT_CLASSES;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${ACCENT_CLASSES[accent]}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
