"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2, Upload, Zap } from "lucide-react";

interface Proprietario {
  id: string;
  nome: string;
  cpfCnpj: string | null;
}

interface Usina {
  id: string;
  nome: string;
  codigoUc: string | null;
  potenciaInstalada: number | null;
  plataformaMonitoramento: string | null;
}

interface Resultado {
  usina: {
    id: string;
    nome: string;
    codigoUc: string | null;
    potenciaInstalada: number | null;
    plataforma: string;
    monitoramentoPlantId: string;
    proprietario: { id: string; nome: string } | null;
  };
  fatura: {
    arquivo: string;
    codigoInstalacao: string | null;
    mesReferencia: number;
    anoReferencia: number;
    energiaInjetadaMedidorKwh: number | null;
    leituraAnterior: number | null;
    leituraAtual: number | null;
    constante: number | null;
  };
  inversor: {
    totalKwh: number | null;
    diasComLeitura: number | null;
    error: string | null;
  };
  comparacao: {
    injetadaKwh: number | null;
    inversorKwh: number | null;
    diffKwh: number | null;
    diffPct: number | null;
    tolerancePct: number;
    status: "OK" | "ALERTA" | "SEM_FATURA" | "SEM_INVERSOR";
  };
}

const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtKwh(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kWh`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} %`;
}

export default function ValidarInversorPage() {
  const [proprietarios, setProprietarios] = useState<Proprietario[]>([]);
  const [proprietarioId, setProprietarioId] = useState<string>("");
  const [usinas, setUsinas] = useState<Usina[]>([]);
  const [usinaId, setUsinaId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingUsinas, setLoadingUsinas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    fetch("/api/brasil-solar/proprietarios?all=true")
      .then((r) => r.json())
      .then((d) => setProprietarios(d.proprietarios ?? []))
      .catch(() => setError("Falha ao carregar proprietários"));
  }, []);

  useEffect(() => {
    if (!proprietarioId) {
      setUsinas([]);
      setUsinaId("");
      return;
    }
    setLoadingUsinas(true);
    setUsinaId("");
    fetch(`/api/brasil-solar?proprietarioId=${encodeURIComponent(proprietarioId)}&limit=100`)
      .then((r) => r.json())
      .then((d) => setUsinas(d.clients ?? []))
      .catch(() => setError("Falha ao carregar usinas"))
      .finally(() => setLoadingUsinas(false));
  }, [proprietarioId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!usinaId || !file) return;
    setLoading(true);
    setError(null);
    setResultado(null);
    try {
      const fd = new FormData();
      fd.append("brasilSolarClientId", usinaId);
      fd.append("file", file);
      const res = await fetch("/api/admin/validar-inversor", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro desconhecido");
      } else {
        setResultado(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  const usinaSelecionada = usinas.find((u) => u.id === usinaId);
  const podeEnviar = !!usinaId && !!file && !loading;

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-amber-500" /> Validar Inversor vs Fatura
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compara a energia injetada lida no medidor (fatura RGE) com a geração mensal do inversor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Selecionar usina</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Proprietário</label>
                <select
                  value={proprietarioId}
                  onChange={(e) => setProprietarioId(e.target.value)}
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-background"
                >
                  <option value="">— selecione —</option>
                  {proprietarios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {p.cpfCnpj ? ` · ${p.cpfCnpj}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Usina</label>
                <select
                  value={usinaId}
                  onChange={(e) => setUsinaId(e.target.value)}
                  disabled={!proprietarioId || loadingUsinas}
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-background disabled:opacity-50"
                >
                  <option value="">
                    {loadingUsinas ? "carregando..." : "— selecione —"}
                  </option>
                  {usinas.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                      {u.plataformaMonitoramento ? ` · ${u.plataformaMonitoramento}` : ""}
                      {u.codigoUc ? ` · UC ${u.codigoUc}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {usinaSelecionada && !usinaSelecionada.plataformaMonitoramento && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                Esta usina não tem plataforma de monitoramento configurada. Cadastre-a em{" "}
                <a href={`/admin/brasil-solar/${usinaSelecionada.id}/editar`} className="underline">
                  Brasil Solar → {usinaSelecionada.nome}
                </a>
                .
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1 block">2. Fatura (PDF da RGE)</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
              />
              {file && (
                <p className="text-xs text-muted-foreground mt-1">
                  {file.name} · {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!podeEnviar}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {loading ? "Processando..." : "Validar"}
            </button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <strong>Erro:</strong> {error}
          </div>
        </div>
      )}

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Resultado —{" "}
              <span className="font-normal text-muted-foreground">
                {MESES[resultado.fatura.mesReferencia]}/{resultado.fatura.anoReferencia}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="text-xs uppercase text-muted-foreground font-medium">Fatura (medidor)</div>
                <div className="text-2xl font-bold mt-1">
                  {fmtKwh(resultado.comparacao.injetadaKwh)}
                </div>
                <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                  <div>Leitura ant.: {resultado.fatura.leituraAnterior ?? "—"}</div>
                  <div>Leitura atual: {resultado.fatura.leituraAtual ?? "—"}</div>
                  <div>Constante: {resultado.fatura.constante ?? "—"}</div>
                  <div>UC: {resultado.fatura.codigoInstalacao ?? "—"}</div>
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Inversor ({resultado.usina.plataforma})
                </div>
                <div className="text-2xl font-bold mt-1">
                  {fmtKwh(resultado.comparacao.inversorKwh)}
                </div>
                <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                  <div>Dias com leitura: {resultado.inversor.diasComLeitura ?? "—"}</div>
                  <div>pvSystemId: {resultado.usina.monitoramentoPlantId}</div>
                  {resultado.inversor.error && (
                    <div className="text-red-600 mt-1">⚠ {resultado.inversor.error}</div>
                  )}
                </div>
              </div>
            </div>

            <div
              className={`rounded-lg border p-4 flex items-start gap-3 ${
                resultado.comparacao.status === "OK"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : resultado.comparacao.status === "ALERTA"
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-muted border-muted-foreground/20"
              }`}
            >
              {resultado.comparacao.status === "OK" ? (
                <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              )}
              <div className="flex-1">
                <div className="font-semibold text-sm">
                  {resultado.comparacao.status === "OK" && "Dentro da tolerância"}
                  {resultado.comparacao.status === "ALERTA" && "Fora da tolerância"}
                  {resultado.comparacao.status === "SEM_FATURA" &&
                    "Fatura sem leitura de energia injetada"}
                  {resultado.comparacao.status === "SEM_INVERSOR" &&
                    "Inversor sem dados para o período"}
                </div>
                {resultado.comparacao.diffKwh != null && (
                  <div className="text-sm mt-1">
                    Diferença: <strong>{fmtKwh(resultado.comparacao.diffKwh)}</strong> ·{" "}
                    <strong>{fmtPct(resultado.comparacao.diffPct)}</strong> (tolerância ±
                    {resultado.comparacao.tolerancePct}%)
                  </div>
                )}
              </div>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                JSON bruto (para o terminal)
              </summary>
              <pre className="mt-2 rounded bg-muted p-3 overflow-auto text-[11px]">
                {JSON.stringify(resultado, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
