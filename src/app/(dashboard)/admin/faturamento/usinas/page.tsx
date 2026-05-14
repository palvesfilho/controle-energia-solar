"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { formatBRL, formatMonthYear } from "@/lib/formatters";

interface Pendencia {
  plantId: string;
  name: string;
  numeroUsina: string | null;
  investorNames: string[];
  proximoMes: { ano: number; mes: number } | null;
  qtdPendentes: number;
  totalDevidoPendente: number;
}

const inputClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

function formatInvestores(names: string[]): string {
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

export default function FaturamentoUsinasPage() {
  const router = useRouter();
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const [novoAno, setNovoAno] = useState(now.getFullYear());
  const [novoMes, setNovoMes] = useState(now.getMonth() + 1);

  useEffect(() => {
    fetch("/api/billing/plants/pendencias")
      .then((r) => r.json())
      .then((data: Pendencia[]) => setPendencias(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = pendencias.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.numeroUsina?.toLowerCase().includes(q) ?? false) ||
      p.investorNames.some((n) => n.toLowerCase().includes(q))
    );
  });

  const handleAbrirUsina = async (p: Pendencia) => {
    setOpening(p.plantId);
    try {
      // Se há mês pendente, vai direto. Caso contrário, abre o mês atual.
      const ano = p.proximoMes?.ano ?? now.getFullYear();
      const mes = p.proximoMes?.mes ?? now.getMonth() + 1;
      const mesParam = `${ano}-${String(mes).padStart(2, "0")}`;
      // Garante que o PlantBilling existe (cria placeholder se necessário) e
      // navega pro detalhe direto.
      const res = await fetch("/api/billing/plants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId: p.plantId, ano, mes }),
      });
      const billing = await res.json();
      router.push(`/admin/faturamento/usinas/${mesParam}/${billing.id}`);
    } catch {
      setOpening(null);
    }
  };

  return (
    <div className="space-y-4">
      <Link
        href="/admin/faturamento"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Faturamento de Usinas</h1>
        <p className="text-sm text-muted-foreground">
          Cada usina abaixo abre direto no próximo mês pendente de pagamento ao investidor
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Abrir mês específico</h2>
          <p className="text-xs text-muted-foreground">
            Use só se precisar revisar um mês passado/futuro fora do fluxo normal — a lista abaixo já leva você pro mês pendente.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mês</label>
              <select
                value={novoMes}
                onChange={(e) => setNovoMes(Number(e.target.value))}
                className={inputClass}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {formatMonthYear(m, novoAno).split(" ")[0]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ano</label>
              <input
                type="number"
                value={novoAno}
                onChange={(e) => setNovoAno(Number(e.target.value))}
                className={`${inputClass} w-24`}
              />
            </div>
            <Link
              href={`/admin/faturamento/usinas/${novoAno}-${String(novoMes).padStart(2, "0")}`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4" />
              Abrir mês
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar usina ou investidor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} w-full pl-8`}
            />
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma usina encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Usina</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Investidor</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Próximo mês pendente</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Pendentes</th>
                    <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">A pagar</th>
                    <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const isOpening = opening === p.plantId;
                    const semPendencia = !p.proximoMes;
                    return (
                      <tr
                        key={p.plantId}
                        onClick={() => !isOpening && handleAbrirUsina(p)}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-medium">{p.name}</div>
                          {p.numeroUsina && (
                            <div className="text-xs text-muted-foreground">Nº {p.numeroUsina}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {formatInvestores(p.investorNames)}
                        </td>
                        <td className="py-2.5 px-3">
                          {p.proximoMes ? (
                            <span className="font-medium">
                              {formatMonthYear(p.proximoMes.mes, p.proximoMes.ano)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">sem pendência</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {p.qtdPendentes > 0 ? (
                            <span
                              className={`inline-flex items-center justify-center rounded-full text-xs font-medium px-2 py-0.5 ${
                                p.qtdPendentes === 1
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {p.qtdPendentes}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {p.totalDevidoPendente > 0 ? (
                            <span className={semPendencia ? "text-muted-foreground" : "font-medium"}>
                              {formatBRL(p.totalDevidoPendente)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isOpening ? (
                            <Loader2 className="inline h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <ChevronRight className="inline h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
