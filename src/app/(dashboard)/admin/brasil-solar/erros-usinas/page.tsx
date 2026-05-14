"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Filter,
  HelpCircle,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ACAO_REQUERIDA_LABEL,
  ACOES_REQUERIDAS,
  type AcaoRequerida,
} from "@/lib/alertas-usinas";

interface AlertaItem {
  id: string;
  tipo: string;
  severidade: string;
  acaoRequerida: AcaoRequerida | null;
  codigoErroFabricante: string | null;
  titulo: string;
  descricao: string | null;
  status: string;
  createdAt: string;
  usina: {
    id: string;
    nome: string;
    cidade: string | null;
    uf: string | null;
    potenciaInstalada: number | null;
    ultimaLeitura: string | null;
    statusMonitoramento: string;
    latitude: number | null;
    longitude: number | null;
    inversorMarca: string | null;
    plataformaMonitoramento: string | null;
  };
}

interface KbAcao {
  id: string;
  ordem: number;
  descricao: string;
  acaoRequerida: AcaoRequerida | null;
}

interface KbCodigo {
  id: string;
  fabricante: string;
  codigo: string;
  titulo: string;
  descricao: string | null;
  severidadeSugerida: string | null;
  acoes: KbAcao[];
}

interface ApiResponse {
  alertas: AlertaItem[];
  total: number;
  counts: Record<string, number>;
}

const SEVERIDADE_ORDER = ["CRITICA", "ALTA", "MEDIA", "BAIXA"] as const;
type Severidade = (typeof SEVERIDADE_ORDER)[number];

const SEVERIDADE_META: Record<
  Severidade,
  {
    label: string;
    rowClass: string;
    chipClass: string;
    dotClass: string;
    bgSoft: string;
  }
> = {
  CRITICA: {
    label: "Crítico",
    rowClass: "border-l-red-500",
    chipClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    dotClass: "bg-red-500",
    bgSoft: "bg-red-50 dark:bg-red-900/10",
  },
  ALTA: {
    label: "Alto",
    rowClass: "border-l-orange-500",
    chipClass:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
    dotClass: "bg-orange-500",
    bgSoft: "bg-orange-50 dark:bg-orange-900/10",
  },
  MEDIA: {
    label: "Médio",
    rowClass: "border-l-amber-500",
    chipClass:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    dotClass: "bg-amber-500",
    bgSoft: "bg-amber-50 dark:bg-amber-900/10",
  },
  BAIXA: {
    label: "Baixo",
    rowClass: "border-l-sky-500",
    chipClass: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    dotClass: "bg-sky-500",
    bgSoft: "bg-sky-50 dark:bg-sky-900/10",
  },
};

const TIPO_LABEL: Record<string, string> = {
  OFFLINE: "Inversor desconectado",
  BAIXA_GERACAO: "Geração abaixo do esperado",
  TENSAO_FORA: "Tensão fora dos parâmetros",
  TEMPERATURA_INVERSOR: "Temperatura elevada",
  FREQUENCIA_REDE: "Frequência fora do nominal",
  ERRO_INVERSOR: "Erro do inversor",
  CONSUMO_ELEVADO: "Consumo elevado",
  FATURA_IRREGULAR: "Fatura irregular",
  MANUTENCAO: "Manutenção",
};

const ACAO_BADGE_CLASS: Record<AcaoRequerida, string> = {
  IR_EM_CAMPO:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-900/50",
  VERIFICAR_REMOTO:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-900/50",
  CONTATAR_CLIENTE:
    "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-900/50",
  CONTATAR_CONCESSIONARIA:
    "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-900/50",
  MONITORAR:
    "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const mo = Math.floor(d / 30);
  return `há ${mo} mês${mo > 1 ? "es" : ""}`;
}

const FABRICANTES_KB = ["FRONIUS", "SOLAREDGE", "SUNGROW", "HUAWEI"] as const;

function inferirFabricante(usina: AlertaItem["usina"]): string | null {
  const candidato = (
    usina.plataformaMonitoramento ?? usina.inversorMarca ?? ""
  ).toUpperCase();
  if (!candidato) return null;
  return FABRICANTES_KB.find((f) => candidato.includes(f)) ?? null;
}

export default function ErrosUsinasPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [severidadesAtivas, setSeveridadesAtivas] = useState<Set<Severidade>>(
    new Set(SEVERIDADE_ORDER),
  );
  const [tiposAtivos, setTiposAtivos] = useState<Set<string>>(new Set());
  const [acoesAtivas, setAcoesAtivas] = useState<Set<AcaoRequerida | "SEM_ACAO">>(
    new Set(),
  );

  const carregar = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/brasil-solar/alertas-usinas", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Falha ao carregar alertas");
      const d = (await res.json()) as ApiResponse;
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    carregar(false);
  }, []);

  const processarAlertas = async () => {
    setProcessando(true);
    try {
      const res = await fetch("/api/brasil-solar/sync/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Erro ao processar alertas");
        return;
      }
      const criados = d.alertsCreated ?? 0;
      const resolvidos = d.autoResolved
        ? Object.values(d.autoResolved).reduce(
            (acc: number, n: unknown) => acc + (typeof n === "number" ? n : 0),
            0,
          )
        : 0;
      toast.success("Alertas processados", {
        description: `${criados} novo(s) alerta(s) criado(s) · ${resolvidos} auto-resolvido(s)`,
      });
      await carregar(true);
    } catch {
      toast.error("Falha na conexão ao processar alertas");
    } finally {
      setProcessando(false);
    }
  };

  const tiposPresentes = useMemo(() => {
    const s = new Set<string>();
    data?.alertas.forEach((a) => s.add(a.tipo));
    return Array.from(s).sort();
  }, [data]);

  const filtrados = useMemo(() => {
    if (!data) return [] as AlertaItem[];
    const buscaNorm = busca.trim().toLowerCase();
    return data.alertas.filter((a) => {
      if (!severidadesAtivas.has(a.severidade as Severidade)) return false;
      if (tiposAtivos.size > 0 && !tiposAtivos.has(a.tipo)) return false;
      if (acoesAtivas.size > 0) {
        const key = a.acaoRequerida ?? "SEM_ACAO";
        if (!acoesAtivas.has(key)) return false;
      }
      if (buscaNorm) {
        const blob = `${a.usina.nome} ${a.usina.cidade ?? ""} ${a.usina.uf ?? ""} ${
          a.titulo
        } ${a.descricao ?? ""}`.toLowerCase();
        if (!blob.includes(buscaNorm)) return false;
      }
      return true;
    });
  }, [data, busca, severidadesAtivas, tiposAtivos, acoesAtivas]);

  const totalFiltrado = filtrados.length;
  const totalGeral = data?.total ?? 0;

  const grupos = useMemo(() => {
    const g: Record<Severidade, AlertaItem[]> = {
      CRITICA: [],
      ALTA: [],
      MEDIA: [],
      BAIXA: [],
    };
    for (const a of filtrados) {
      const s = a.severidade as Severidade;
      if (s in g) g[s].push(a);
    }
    return g;
  }, [filtrados]);

  const toggleSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const novo = new Set(set);
    if (novo.has(value)) novo.delete(value);
    else novo.add(value);
    return novo;
  };

  const limparFiltros = () => {
    setBusca("");
    setSeveridadesAtivas(new Set(SEVERIDADE_ORDER));
    setTiposAtivos(new Set());
    setAcoesAtivas(new Set());
  };

  const filtrosAtivos =
    busca.trim().length > 0 ||
    severidadesAtivas.size !== SEVERIDADE_ORDER.length ||
    tiposAtivos.size > 0 ||
    acoesAtivas.size > 0;

  const atualizarAlerta = async (
    id: string,
    payload: {
      acaoRequerida?: AcaoRequerida | null;
      status?: string;
      codigoErroFabricante?: string | null;
    },
    optimistic: (a: AlertaItem) => AlertaItem,
  ) => {
    if (!data) return;
    const original = data;
    const novosAlertas = data.alertas.map((a) => (a.id === id ? optimistic(a) : a));
    setData({ ...data, alertas: novosAlertas });
    try {
      const res = await fetch(`/api/brasil-solar/alertas-usinas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Falha ao atualizar");
      }
      // Se foi resolvido, remove da lista de "abertos" no próximo refresh.
      if (payload.status === "RESOLVIDO" || payload.status === "IGNORADO") {
        await carregar(true);
      }
    } catch (e) {
      setData(original);
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    }
  };

  const onChangeAcao = (id: string, acao: AcaoRequerida | null) => {
    atualizarAlerta(id, { acaoRequerida: acao }, (a) => ({
      ...a,
      acaoRequerida: acao,
    }));
  };

  const onChangeCodigoErro = (id: string, codigo: string | null) => {
    atualizarAlerta(id, { codigoErroFabricante: codigo }, (a) => ({
      ...a,
      codigoErroFabricante: codigo,
    }));
  };

  const onResolver = (id: string) => {
    if (!confirm("Marcar este alerta como resolvido?")) return;
    atualizarAlerta(id, { status: "RESOLVIDO" }, (a) => ({
      ...a,
      status: "RESOLVIDO",
    }));
    toast.success("Alerta marcado como resolvido");
  };

  const onMarcarEmAndamento = (id: string) => {
    atualizarAlerta(id, { status: "EM_ANDAMENTO" }, (a) => ({
      ...a,
      status: "EM_ANDAMENTO",
    }));
  };

  const counts = data?.counts ?? {};

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link
            href="/admin/brasil-solar/mapa"
            className="mt-1 text-muted-foreground hover:text-foreground"
            title="Voltar ao mapa"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-red-600 text-white">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Erros em usinas</h1>
            <p className="text-sm text-muted-foreground">
              Alertas em aberto detectados nas usinas monitoradas. Use os filtros pra
              direcionar pro time correto.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={processarAlertas}
            disabled={processando || refreshing}
            title="Re-roda a detecção de alertas em todas as usinas (OFFLINE, baixa geração, tensão, temperatura, erro de inversor). Roda automaticamente a cada hora."
          >
            {processando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            Processar alertas agora
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => carregar(true)}
            disabled={refreshing || processando}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
          <Link href="/admin/personalizacoes/alertas-usinas">
            <Button variant="outline" size="sm">
              <Settings2 className="h-4 w-4" />
              Personalizar
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SEVERIDADE_ORDER.map((s) => {
          const meta = SEVERIDADE_META[s];
          const c = counts[s] ?? 0;
          const ativa = severidadesAtivas.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSeveridadesAtivas((prev) => toggleSet(prev, s))}
              className={cn(
                "rounded-lg border p-4 text-left transition-all",
                ativa
                  ? `${meta.bgSoft} border-current/30`
                  : "bg-card opacity-50 hover:opacity-75",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClass)} />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {meta.label}
                </span>
              </div>
              <p className="mt-1 text-2xl font-bold">{c}</p>
              <p className="text-[10px] text-muted-foreground">
                {ativa ? "Mostrando" : "Oculto — clique pra mostrar"}
              </p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filtros
            {filtrosAtivos && (
              <Button
                size="sm"
                variant="ghost"
                onClick={limparFiltros}
                className="ml-auto h-7"
              >
                <X className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por usina, cidade ou descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          {tiposPresentes.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tipo</p>
              <div className="flex flex-wrap gap-1.5">
                {tiposPresentes.map((t) => {
                  const ativo = tiposAtivos.has(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTiposAtivos((prev) => toggleSet(prev, t))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        ativo
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background hover:bg-accent",
                      )}
                    >
                      {TIPO_LABEL[t] ?? t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Ação requerida
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ACOES_REQUERIDAS.map((acao) => {
                const ativo = acoesAtivas.has(acao);
                return (
                  <button
                    key={acao}
                    type="button"
                    onClick={() => setAcoesAtivas((prev) => toggleSet(prev, acao))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      ativo
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent",
                    )}
                  >
                    {ACAO_REQUERIDA_LABEL[acao]}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setAcoesAtivas((prev) => toggleSet(prev, "SEM_ACAO"))
                }
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  acoesAtivas.has("SEM_ACAO")
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent",
                )}
              >
                Sem ação definida
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {loading
            ? "Carregando..."
            : `${totalFiltrado} de ${totalGeral} alerta${totalGeral === 1 ? "" : "s"}`}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando alertas...
        </div>
      )}

      {!loading && !error && totalGeral === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 rounded-full bg-emerald-100 p-3 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-lg font-medium">Nenhum alerta em aberto</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Todas as usinas monitoradas estão dentro dos parâmetros configurados.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && totalGeral > 0 && totalFiltrado === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum alerta corresponde aos filtros atuais.
          </CardContent>
        </Card>
      )}

      {!loading && !error && totalFiltrado > 0 && (
        <div className="space-y-6">
          {SEVERIDADE_ORDER.map((sev) => {
            const itens = grupos[sev];
            if (itens.length === 0) return null;
            const meta = SEVERIDADE_META[sev];
            return (
              <section key={sev} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClass)} />
                  <h2 className="text-sm font-semibold">
                    {meta.label}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({itens.length})
                    </span>
                  </h2>
                </div>
                <div className="space-y-2">
                  {itens.map((a) => (
                    <AlertCard
                      key={a.id}
                      alerta={a}
                      meta={meta}
                      onChangeAcao={onChangeAcao}
                      onChangeCodigoErro={onChangeCodigoErro}
                      onResolver={onResolver}
                      onMarcarEmAndamento={onMarcarEmAndamento}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alerta,
  meta,
  onChangeAcao,
  onChangeCodigoErro,
  onResolver,
  onMarcarEmAndamento,
}: {
  alerta: AlertaItem;
  meta: (typeof SEVERIDADE_META)[Severidade];
  onChangeAcao: (id: string, acao: AcaoRequerida | null) => void;
  onChangeCodigoErro: (id: string, codigo: string | null) => void;
  onResolver: (id: string) => void;
  onMarcarEmAndamento: (id: string) => void;
}) {
  const acao = alerta.acaoRequerida;
  const tipoLabel = TIPO_LABEL[alerta.tipo] ?? alerta.tipo;
  const fabricante = inferirFabricante(alerta.usina);
  const [codigoInput, setCodigoInput] = useState(
    alerta.codigoErroFabricante ?? "",
  );
  const [kbCodigo, setKbCodigo] = useState<KbCodigo | null>(null);
  const [kbStatus, setKbStatus] = useState<
    "idle" | "loading" | "found" | "not_found" | "no_fabricante"
  >("idle");

  // Mantém input em sincronia com o estado vindo do servidor (refresh).
  useEffect(() => {
    setCodigoInput(alerta.codigoErroFabricante ?? "");
  }, [alerta.codigoErroFabricante]);

  // Lookup automático quando há código + fabricante.
  useEffect(() => {
    const codigo = (alerta.codigoErroFabricante ?? "").trim();
    if (!codigo) {
      setKbCodigo(null);
      setKbStatus("idle");
      return;
    }
    if (!fabricante) {
      setKbCodigo(null);
      setKbStatus("no_fabricante");
      return;
    }
    let abort = false;
    setKbStatus("loading");
    fetch(
      `/api/admin/codigos-erro-inversor/lookup?fabricante=${encodeURIComponent(
        fabricante,
      )}&codigo=${encodeURIComponent(codigo)}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("lookup falhou"))))
      .then((d: { codigo: KbCodigo | null }) => {
        if (abort) return;
        if (d.codigo) {
          setKbCodigo(d.codigo);
          setKbStatus("found");
        } else {
          setKbCodigo(null);
          setKbStatus("not_found");
        }
      })
      .catch(() => {
        if (!abort) setKbStatus("idle");
      });
    return () => {
      abort = true;
    };
  }, [alerta.codigoErroFabricante, fabricante]);

  const salvarCodigo = () => {
    const v = codigoInput.trim();
    const atual = alerta.codigoErroFabricante ?? "";
    if (v === atual) return;
    onChangeCodigoErro(alerta.id, v.length === 0 ? null : v);
  };

  return (
    <Card className={cn("border-l-4", meta.rowClass)}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{alerta.usina.nome}</span>
              {(alerta.usina.cidade || alerta.usina.uf) && (
                <span className="text-xs text-muted-foreground">
                  {alerta.usina.cidade}
                  {alerta.usina.cidade && alerta.usina.uf ? " / " : ""}
                  {alerta.usina.uf}
                </span>
              )}
              {alerta.usina.inversorMarca && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {alerta.usina.inversorMarca}
                </span>
              )}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  meta.chipClass,
                )}
              >
                {tipoLabel}
              </span>
              {alerta.status === "EM_ANDAMENTO" && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                  Em andamento
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm">{alerta.titulo}</p>
            {alerta.descricao && (
              <p className="mt-1 text-xs text-muted-foreground">{alerta.descricao}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Aberto {timeAgo(alerta.createdAt)}
              </span>
              {alerta.usina.potenciaInstalada != null && (
                <span>{alerta.usina.potenciaInstalada} kWp</span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Código de erro
              </span>
              <Input
                value={codigoInput}
                onChange={(e) => setCodigoInput(e.target.value)}
                onBlur={salvarCodigo}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                placeholder={fabricante ? "ex.: 103" : "fabricante desconhecido"}
                disabled={!fabricante}
                className="h-7 w-32 text-xs font-mono"
              />
              {fabricante && (
                <span className="text-[10px] text-muted-foreground">
                  {fabricante}
                </span>
              )}
              {kbStatus === "loading" && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              {kbStatus === "not_found" && (
                <span className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
                  <HelpCircle className="h-3 w-3" />
                  Código não cadastrado na base
                </span>
              )}
              {kbStatus === "no_fabricante" && (
                <span className="text-[10px] text-muted-foreground">
                  Cadastre a marca do inversor na usina pra usar o código
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Ação
              </span>
              <select
                value={acao ?? ""}
                onChange={(e) =>
                  onChangeAcao(
                    alerta.id,
                    (e.target.value || null) as AcaoRequerida | null,
                  )
                }
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  acao ? ACAO_BADGE_CLASS[acao] : "bg-background",
                )}
              >
                <option value="">— sem ação —</option>
                {ACOES_REQUERIDAS.map((a) => (
                  <option key={a} value={a}>
                    {ACAO_REQUERIDA_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Link href={`/admin/brasil-solar/${alerta.usina.id}`}>
                <Button size="sm" variant="outline">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir usina
                </Button>
              </Link>
              {alerta.usina.latitude != null && alerta.usina.longitude != null && (
                <Link
                  href={`/admin/brasil-solar/mapa?focus=${alerta.usina.id}`}
                >
                  <Button size="sm" variant="outline">
                    <MapPin className="h-3.5 w-3.5" />
                    Mapa
                  </Button>
                </Link>
              )}
              {alerta.status !== "EM_ANDAMENTO" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onMarcarEmAndamento(alerta.id)}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Em andamento
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => onResolver(alerta.id)}
                className="text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resolver
              </Button>
            </div>
          </div>
        </div>

        {kbStatus === "found" && kbCodigo && (
          <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-900/15">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-100">
              <BookOpen className="h-4 w-4" />
              {kbCodigo.fabricante} #{kbCodigo.codigo} — {kbCodigo.titulo}
            </div>
            {kbCodigo.descricao && (
              <p className="mt-1 text-xs text-blue-900/80 dark:text-blue-100/80">
                {kbCodigo.descricao}
              </p>
            )}
            {kbCodigo.acoes.length > 0 && (
              <ol className="mt-2 space-y-1.5">
                {kbCodigo.acoes.map((ac) => (
                  <li
                    key={ac.id}
                    className="flex gap-2 text-sm text-blue-950 dark:text-blue-50"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                      {ac.ordem}
                    </span>
                    <div className="flex-1">
                      <p>{ac.descricao}</p>
                      {ac.acaoRequerida && (
                        <span
                          className={cn(
                            "mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            ACAO_BADGE_CLASS[ac.acaoRequerida],
                          )}
                        >
                          {ACAO_REQUERIDA_LABEL[ac.acaoRequerida]}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
