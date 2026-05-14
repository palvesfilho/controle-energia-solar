"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  Sun,
  Zap,
  Wallet,
  TrendingUp,
  Activity,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Save,
  PencilLine,
  FileText,
  FileDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface MesData {
  ano: number;
  mes: number;
  janela: { inicio: string | null; fim: string | null; fonte: string };
  geracaoInversorKwh: number | null;
  injetadaMedidorKwh: number | null;
  consumoRedeKwh: number | null;
  consumoInstantaneoKwh: number | null;
  consumoTotalKwh: number | null;
  saldoCreditosKwh: number | null;
  energiaCompensadaKwh: number | null;
  tarifaTotal: number | null;
  tarifaCompletaComTributos: number | null;
  economiaCompensadaRs: number | null;
  economiaInstantaneaRs: number | null;
  economiaMensalRs: number | null;
  economiaAcumuladaRs: number;
  saldoPaybackRs: number;
  faturadoRs: number | null;
  desempenhoPct: number | null;
  retornoPct: number | null;
  anomalia: string | null;
  inversoresErros: string[];
}

interface BillData {
  id: string;
  pdfUrl: string | null;
  consumoKwh: number | null;
  energiaCompensada: number | null;
  energiaInjetadaMedidorKwh: number | null;
  valorTotal: number | null;
  tarifaTE: number | null;
  tarifaTUSD: number | null;
  dataLeituraAnterior: string | null;
  dataLeituraAtual: string | null;
}

interface ApiResponse {
  proprietario: { id: string; nome: string };
  uc: { id: string; codigoUc: string; nome: string; distribuidora: string | null };
  usinasMonitoradas: {
    id: string;
    nome: string;
    potenciaInstalada: number | null;
    investimento: number | null;
    plataforma: string | null;
  }[];
  investimentoTotal: number;
  potenciaTotalKwp: number;
  geracaoEsperadaMensalKwh: number;
  geracaoEsperadaAnualKwh: number;
  economiaMediaMensalRs: number;
  retornoTotalPct: number;
  paybackRestanteMeses: number;
  paybackQuitacaoPrevista: { ano: number; mes: number } | null;
  paybackQuitado: boolean;
  mes: MesData | null;
  bill: BillData | null;
  mesesDisponiveis: { ano: number; mes: number }[];
}

const MESES_LONGO = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatBRL(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatKwh(v: number | null, frac = 1) {
  return v == null
    ? "—"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: frac }) + " kWh";
}
function formatPct(v: number | null) {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export default function RelatorioMesPage() {
  const params = useParams();
  const proprietarioId = params.id as string;
  const ucId = params.ucId as string;
  const ano = Number(params.ano);
  const mes = Number(params.mes);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(
      `/api/brasil-solar/proprietarios/${proprietarioId}/relatorios/${ucId}/mes/${ano}/${mes}`,
    )
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as ApiResponse;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [proprietarioId, ucId, ano, mes, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando relatório...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8 space-y-2">
        <p className="text-sm text-red-600">Erro: {error}</p>
        <Link
          href="/admin/brasil-solar/relatorios"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>
    );
  }

  const m = data.mes;

  const idx = data.mesesDisponiveis.findIndex((x) => x.ano === ano && x.mes === mes);
  const prev = idx > 0 ? data.mesesDisponiveis[idx - 1] : null;
  const next =
    idx >= 0 && idx < data.mesesDisponiveis.length - 1 ? data.mesesDisponiveis[idx + 1] : null;

  // Sem mês calculado: pode ser que a fatura não esteja entre as últimas 12,
  // ou ainda não exista no banco. Mostra um placeholder + edição manual.
  if (!m) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Link
            href="/admin/brasil-solar/relatorios"
            className="mt-1 rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {data.uc.nome} — {MESES_LONGO[mes - 1]}/{ano}
            </h1>
            <p className="text-sm text-muted-foreground">
              UC {data.uc.codigoUc} · Nenhum dado calculável ainda para este mês.
            </p>
          </div>
        </div>
        {data.bill ? (
          <BillEditor
            bill={data.bill}
            onChanged={reload}
          />
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Nenhuma fatura cadastrada para {String(mes).padStart(2, "0")}/{ano}. Faça o
              upload manual do PDF na tela de Faturas de Energia.
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/admin/brasil-solar/relatorios"
          className="mt-1 rounded p-1 text-muted-foreground hover:bg-muted"
          title="Voltar para visão geral"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {data.uc.nome} — {MESES_LONGO[m.mes - 1]}/{m.ano}
          </h1>
          <p className="text-sm text-muted-foreground">
            UC {data.uc.codigoUc} · {data.uc.distribuidora ?? "—"} · Proprietário:{" "}
            <Link
              href={`/admin/brasil-solar/proprietarios/${data.proprietario.id}`}
              className="text-primary hover:underline"
            >
              {data.proprietario.nome}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {prev && (
            <Link
              href={`/admin/brasil-solar/proprietarios/${proprietarioId}/relatorios/${ucId}/${prev.ano}/${prev.mes}`}
              className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs hover:bg-muted"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {MESES_LONGO[prev.mes - 1].slice(0, 3)}/{String(prev.ano).slice(2)}
            </Link>
          )}
          {next && (
            <Link
              href={`/admin/brasil-solar/proprietarios/${proprietarioId}/relatorios/${ucId}/${next.ano}/${next.mes}`}
              className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs hover:bg-muted"
            >
              {MESES_LONGO[next.mes - 1].slice(0, 3)}/{String(next.ano).slice(2)}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
          <a
            href={`/api/brasil-solar/proprietarios/${proprietarioId}/relatorios/${ucId}/pdf?ano=${ano}&mes=${mes}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            title="Baixar PDF do relatório"
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF
          </a>
        </div>
      </div>

      {/* Anomalia */}
      {m.anomalia && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Anomalia detectada</p>
            <p className="mt-0.5">{m.anomalia}</p>
          </div>
        </div>
      )}

      {/* Janela */}
      <Card>
        <CardContent className="flex items-center gap-3 p-3 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <span className="text-muted-foreground">Ciclo de leitura: </span>
            <span className="font-medium">
              {m.janela.inicio
                ? new Date(m.janela.inicio).toLocaleDateString("pt-BR")
                : "—"}{" "}
              →{" "}
              {m.janela.fim ? new Date(m.janela.fim).toLocaleDateString("pt-BR") : "—"}
            </span>
            {m.janela.fonte === "MES_CALENDARIO" && (
              <span className="ml-2 text-xs text-amber-600">(usando mês calendário — sem datas de leitura)</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Investimento: {formatBRL(data.investimentoTotal)} · {data.potenciaTotalKwp} kWp
          </div>
        </CardContent>
      </Card>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<Sun className="h-4 w-4" />}
          label="Geração inversor"
          value={formatKwh(m.geracaoInversorKwh)}
          color="emerald"
        />
        <Kpi
          icon={<Activity className="h-4 w-4" />}
          label="Desempenho"
          value={formatPct(m.desempenhoPct)}
          color="sky"
          hint={data.geracaoEsperadaMensalKwh > 0 ? `Esperado: ${formatKwh(data.geracaoEsperadaMensalKwh)}` : "Sem prognóstico"}
        />
        <Kpi
          icon={<Zap className="h-4 w-4" />}
          label="Consumo total"
          value={formatKwh(m.consumoTotalKwh)}
          color="amber"
          hint={`Rede: ${formatKwh(m.consumoRedeKwh)} · Instantâneo: ${formatKwh(m.consumoInstantaneoKwh)}`}
        />
        <Kpi
          icon={<Wallet className="h-4 w-4" />}
          label="Economia mensal"
          value={formatBRL(m.economiaMensalRs)}
          color="violet"
          hint={`Fatura concessionária: ${formatBRL(m.faturadoRs)}`}
        />
      </div>

      {/* Detalhamento */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <h3 className="font-semibold">Energia (kWh)</h3>
            <Row label="Geração do inversor" value={formatKwh(m.geracaoInversorKwh)} />
            <Row label="Injetada no medidor" value={formatKwh(m.injetadaMedidorKwh)} />
            <Row
              label="Consumo instantâneo (autoconsumo)"
              value={formatKwh(m.consumoInstantaneoKwh)}
              hint="geração − injetada"
            />
            <Row label="Energia compensada" value={formatKwh(m.energiaCompensadaKwh)} />
            <Row label="Consumo da rede" value={formatKwh(m.consumoRedeKwh)} />
            <Row
              label="Consumo total real"
              value={formatKwh(m.consumoTotalKwh)}
              hint="rede + autoconsumo"
              bold
            />
            <Row label="Saldo de créditos GD" value={formatKwh(m.saldoCreditosKwh)} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <h3 className="font-semibold">Economia (R$)</h3>
            <Row label="Tarifa TE+TUSD" value={m.tarifaTotal == null ? "—" : `R$ ${m.tarifaTotal.toFixed(4)}/kWh`} />
            <Row
              label="Tarifa completa (com tributos)"
              value={
                m.tarifaCompletaComTributos == null
                  ? "—"
                  : `R$ ${m.tarifaCompletaComTributos.toFixed(4)}/kWh`
              }
            />
            <Row label="Economia compensada" value={formatBRL(m.economiaCompensadaRs)} />
            <Row label="Economia instantânea" value={formatBRL(m.economiaInstantaneaRs)} />
            <Row label="Economia do mês" value={formatBRL(m.economiaMensalRs)} bold />
            <Row label="Retorno do mês" value={formatPct(m.retornoPct)} />
            <Row label="Fatura concessionária" value={formatBRL(m.faturadoRs)} />
          </CardContent>
        </Card>
      </div>

      {/* Acumulados */}
      <Card>
        <CardContent className="p-4 space-y-2 text-sm">
          <h3 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Acumulado até este mês
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Row label="Economia acumulada" value={formatBRL(m.economiaAcumuladaRs)} />
            <Row label="Saldo do payback" value={formatBRL(m.saldoPaybackRs)} />
            <Row
              label="Payback previsto"
              value={
                data.paybackQuitado
                  ? "Quitado"
                  : data.paybackQuitacaoPrevista
                    ? `${MESES_LONGO[data.paybackQuitacaoPrevista.mes - 1]}/${data.paybackQuitacaoPrevista.ano}`
                    : "—"
              }
            />
            <Row label="Retorno total" value={formatPct(data.retornoTotalPct)} />
          </div>
        </CardContent>
      </Card>

      {/* Edição manual de fatura */}
      {data.bill && <BillEditor bill={data.bill} onChanged={reload} />}

      {/* Usinas */}
      <Card>
        <CardContent className="p-4 space-y-2 text-sm">
          <h3 className="font-semibold">Usinas monitoradas ({data.usinasMonitoradas.length})</h3>
          <ul className="space-y-1 text-muted-foreground">
            {data.usinasMonitoradas.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2">
                <span>
                  {u.nome} ·{" "}
                  <span className="text-foreground">{u.potenciaInstalada ?? "?"} kWp</span> ·{" "}
                  {u.plataforma ?? "—"}
                </span>
                <span className="text-xs">{formatBRL(u.investimento)}</span>
              </li>
            ))}
          </ul>
          {m.inversoresErros.length > 0 && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              <p className="font-medium">Erros do monitoramento neste mês:</p>
              <ul className="list-disc pl-4">
                {m.inversoresErros.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  color,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "emerald" | "sky" | "amber" | "violet";
  hint?: string;
}) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    sky: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  }[color];
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${cls}`}>
            {icon}
          </span>
          <span className="uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-2 text-xl font-bold">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  hint,
  bold,
}: {
  label: string;
  value: string;
  hint?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-muted/50 pb-1 last:border-0 last:pb-0">
      <div className="flex flex-col">
        <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
        {hint && <span className="text-xs text-muted-foreground/70">{hint}</span>}
      </div>
      <span className={bold ? "font-bold" : ""}>{value}</span>
    </div>
  );
}

function BillEditor({ bill, onChanged }: { bill: BillData; onChanged: () => void }) {
  const [consumoKwh, setConsumoKwh] = useState(bill.consumoKwh?.toString() ?? "");
  const [energiaCompensada, setEnergiaCompensada] = useState(
    bill.energiaCompensada?.toString() ?? "",
  );
  const [energiaInjetada, setEnergiaInjetada] = useState(
    bill.energiaInjetadaMedidorKwh?.toString() ?? "",
  );
  const [valorTotal, setValorTotal] = useState(bill.valorTotal?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [reparseing, setReparseing] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const dirty =
    (consumoKwh || "") !== (bill.consumoKwh?.toString() ?? "") ||
    (energiaCompensada || "") !== (bill.energiaCompensada?.toString() ?? "") ||
    (energiaInjetada || "") !== (bill.energiaInjetadaMedidorKwh?.toString() ?? "") ||
    (valorTotal || "") !== (bill.valorTotal?.toString() ?? "");

  function parse(v: string): number | null {
    const t = v.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  async function salvar() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/faturas-energia/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumoKwh: parse(consumoKwh),
          energiaCompensada: parse(energiaCompensada),
          energiaInjetadaMedidorKwh: parse(energiaInjetada),
          valorTotal: parse(valorTotal),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setFeedback({ kind: "ok", text: "Fatura atualizada." });
      onChanged();
    } catch (e) {
      setFeedback({
        kind: "err",
        text: e instanceof Error ? e.message : "Falha ao salvar",
      });
    } finally {
      setSaving(false);
    }
  }

  async function reextrair() {
    if (!bill.pdfUrl) return;
    setReparseing(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/faturas-energia/${bill.id}/reparse`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setFeedback({ kind: "ok", text: "PDF re-extraído com sucesso." });
      onChanged();
    } catch (e) {
      setFeedback({
        kind: "err",
        text: e instanceof Error ? e.message : "Falha ao re-extrair",
      });
    } finally {
      setReparseing(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PencilLine className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Manutenção da fatura</h3>
          <span className="ml-auto text-xs text-muted-foreground font-mono">{bill.id}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Edite os campos abaixo se o parser não preencheu corretamente, ou re-extraia direto do PDF
          original (se disponível).
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Consumo (kWh)" value={consumoKwh} onChange={setConsumoKwh} />
          <Field
            label="Energia compensada (kWh)"
            value={energiaCompensada}
            onChange={setEnergiaCompensada}
          />
          <Field
            label="Energia injetada — medidor (kWh)"
            hint="Leitura física da grandeza 'Energia Injetada'. Usada no cálculo do consumo instantâneo."
            value={energiaInjetada}
            onChange={setEnergiaInjetada}
          />
          <Field label="Valor total (R$)" value={valorTotal} onChange={setValorTotal} />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={salvar}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar alterações
          </button>
          {bill.pdfUrl && (
            <>
              <button
                type="button"
                onClick={reextrair}
                disabled={reparseing}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {reparseing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Re-extrair do PDF
              </button>
              <a
                href={bill.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                <FileText className="h-3.5 w-3.5" />
                Ver PDF
              </a>
            </>
          )}
          {feedback && (
            <span
              className={`text-xs ${
                feedback.kind === "ok" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {feedback.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
      />
      {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
    </label>
  );
}
