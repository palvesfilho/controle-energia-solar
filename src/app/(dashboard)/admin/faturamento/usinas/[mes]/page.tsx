"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, FileText, Loader2, Minus, Search, ShieldCheck, XCircle } from "lucide-react";
import { formatMonthYear, formatBRL } from "@/lib/formatters";

interface Row {
  plant: {
    id: string;
    name: string;
    numeroUsina: string | null;
    cpfCnpj: string | null;
    distribuidora: string | null;
  };
  billing: {
    id: string;
    valorTotal: number | null;
    relatorioGeradoUrl: string | null;
    notaFiscalUrl: string | null;
    reciboTerraUrl: string | null;
    reciboAluguelUrl: string | null;
    comprovantePagamentoUrl: string | null;
  } | null;
  status: string;
  validacao: {
    status: string | null;
    diffPct: number | null;
    em: string | null;
  } | null;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDENTE: { label: "Pendente", className: "bg-slate-400 hover:bg-slate-500" },
  AGUARDANDO_DOCUMENTOS: { label: "Aguardando docs", className: "bg-amber-500 hover:bg-amber-600" },
  AGUARDANDO_PAGAMENTO: { label: "Aguardando pagamento", className: "bg-blue-500 hover:bg-blue-600" },
  PAGO: { label: "Pago", className: "bg-emerald-500 hover:bg-emerald-600" },
};

type ValidationStatus = "OK" | "ALERTA" | "SEM_FATURA" | "SEM_INVERSOR";

interface ValidationState {
  status: ValidationStatus | "LOADING" | "ERROR";
  diffPct: number | null;
  message?: string;
}

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

function parseMes(mes: string): { ano: number; mesNum: number } | null {
  const m = mes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return { ano: Number(m[1]), mesNum: Number(m[2]) };
}

export default function FaturamentoMesPage() {
  const params = useParams();
  const mesParam = params.mes as string;
  const parsed = parseMes(mesParam);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [validations, setValidations] = useState<Record<string, ValidationState>>({});

  useEffect(() => {
    if (!parsed) {
      setLoading(false);
      return;
    }
    fetch(`/api/billing/plants?ano=${parsed.ano}&mes=${parsed.mesNum}`)
      .then((r) => r.json())
      .then((data: Row[]) => {
        const arr = Array.isArray(data) ? data : [];
        setRows(arr);
        // Pré-popula o estado de validação com o que está salvo no banco.
        const initial: Record<string, ValidationState> = {};
        for (const r of arr) {
          if (r.validacao?.status) {
            initial[r.plant.id] = {
              status: r.validacao.status as ValidationStatus,
              diffPct: r.validacao.diffPct ?? null,
            };
          }
        }
        setValidations(initial);
      })
      .finally(() => setLoading(false));
  }, [parsed?.ano, parsed?.mesNum]);

  const handleOpen = async (plantId: string) => {
    if (!parsed) return;
    setOpening(plantId);
    try {
      const res = await fetch("/api/billing/plants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId, ano: parsed.ano, mes: parsed.mesNum }),
      });
      const billing = await res.json();
      window.location.href = `/admin/faturamento/usinas/${mesParam}/${billing.id}`;
    } catch {
      setOpening(null);
    }
  };

  const handleValidate = async (plantId: string) => {
    if (!parsed) return;
    setValidations((v) => ({ ...v, [plantId]: { status: "LOADING", diffPct: null } }));
    try {
      const res = await fetch(
        `/api/plants/${plantId}/validate-bill?ano=${parsed.ano}&mes=${parsed.mesNum}`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setValidations((v) => ({
          ...v,
          [plantId]: { status: "ERROR", diffPct: null, message: err?.error ?? "Erro ao validar" },
        }));
        return;
      }
      const data = await res.json();
      setValidations((v) => ({
        ...v,
        [plantId]: {
          status: data?.totais?.status as ValidationStatus,
          diffPct: data?.totais?.diffPct ?? null,
        },
      }));
    } catch (e) {
      setValidations((v) => ({
        ...v,
        [plantId]: {
          status: "ERROR",
          diffPct: null,
          message: e instanceof Error ? e.message : "Erro de rede",
        },
      }));
    }
  };

  if (!parsed) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Mês inválido</div>;
  }

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.plant.name.toLowerCase().includes(q) ||
      (r.plant.numeroUsina?.toLowerCase().includes(q) ?? false) ||
      (r.plant.cpfCnpj?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-4">
      <Link
        href="/admin/faturamento/usinas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">
          Faturamento — {formatMonthYear(parsed.mesNum, parsed.ano)}
        </h1>
        <p className="text-sm text-muted-foreground">
          Selecione uma usina para gerar/abrir o faturamento do mês
        </p>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar usina..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${selectClass} w-full pl-8`}
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
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Distribuidora</th>
                    <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Valor</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Status</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Validar Fatura</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const st = STATUS_LABELS[r.status] ?? STATUS_LABELS.PENDENTE;
                    return (
                      <tr key={r.plant.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-medium">{r.plant.name}</div>
                          {r.plant.numeroUsina && (
                            <div className="text-xs text-muted-foreground">Nº {r.plant.numeroUsina}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{r.plant.distribuidora ?? "-"}</td>
                        <td className="py-2.5 px-3 text-right">
                          {r.billing?.valorTotal != null ? formatBRL(r.billing.valorTotal) : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge className={`${st.className} text-white`}>{st.label}</Badge>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <ValidationCell
                            state={validations[r.plant.id]}
                            onValidate={() => handleValidate(r.plant.id)}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.billing ? (
                            <Link
                              href={`/admin/faturamento/usinas/${mesParam}/${r.billing.id}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors text-xs"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Abrir
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled={opening === r.plant.id}
                              onClick={() => handleOpen(r.plant.id)}
                              className="inline-flex items-center px-3 py-1 text-xs font-medium border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
                            >
                              {opening === r.plant.id ? "Abrindo..." : "Gerar"}
                            </button>
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

function ValidationCell({
  state,
  onValidate,
}: {
  state: ValidationState | undefined;
  onValidate: () => void;
}) {
  if (!state) {
    return (
      <button
        type="button"
        onClick={onValidate}
        title="Validar fatura"
        className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-muted transition-colors"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        Validar
      </button>
    );
  }

  if (state.status === "LOADING") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Validando...
      </span>
    );
  }

  const diffSuffix =
    state.diffPct != null ? ` (${state.diffPct > 0 ? "+" : ""}${state.diffPct.toFixed(1)}%)` : "";

  if (state.status === "OK") {
    return (
      <button
        type="button"
        onClick={onValidate}
        title={`Geração bate com medidor${diffSuffix}. Clique para revalidar.`}
        className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700"
      >
        <CheckCircle2 className="h-5 w-5" />
      </button>
    );
  }

  if (state.status === "ALERTA") {
    return (
      <button
        type="button"
        onClick={onValidate}
        title={`Divergência entre inversores e medidor${diffSuffix}. Clique para revalidar.`}
        className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"
      >
        <XCircle className="h-5 w-5" />
      </button>
    );
  }

  if (state.status === "SEM_FATURA") {
    return (
      <button
        type="button"
        onClick={onValidate}
        title="Sem fatura importada neste mês. Clique para revalidar."
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <Minus className="h-5 w-5" />
      </button>
    );
  }

  if (state.status === "SEM_INVERSOR") {
    return (
      <button
        type="button"
        onClick={onValidate}
        title="Nenhuma planta fotovoltaica vinculada. Clique para revalidar."
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <Minus className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onValidate}
      title={state.message ?? "Erro ao validar. Clique para tentar novamente."}
      className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"
    >
      <XCircle className="h-5 w-5" />
    </button>
  );
}
