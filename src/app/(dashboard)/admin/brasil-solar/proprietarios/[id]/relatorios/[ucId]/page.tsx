"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Zap,
  Activity,
  Wallet,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  FileDown,
  Sun,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { brand } from "@/lib/brand-colors";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

interface MonthRow {
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
  meses: MonthRow[];
}

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatKwh(v: number | null) {
  return v == null
    ? "—"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " kWh";
}

const MESES_LONGO = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function RelatorioDetalhePage() {
  const params = useParams();
  const proprietarioId = params.id as string;
  const ucId = params.ucId as string;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mesSelecionadoKey, setMesSelecionadoKey] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `/api/brasil-solar/proprietarios/${proprietarioId}/relatorios/${ucId}`,
    )
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as ApiResponse;
      })
      .then((d) => {
        setData(d);
        // default = mês mais recente disponível
        if (d.meses.length > 0) {
          const ultimo = d.meses[d.meses.length - 1];
          setMesSelecionadoKey(`${ultimo.ano}-${ultimo.mes}`);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [proprietarioId, ucId]);

  if (loading) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        Carregando relatório (pode levar alguns segundos)...
      </p>
    );
  }
  if (error || !data) {
    return <p className="p-8 text-sm text-red-600">Erro: {error}</p>;
  }

  const chartData = data.meses.map((m) => ({
    label: `${MES_ABREV[m.mes - 1]}/${String(m.ano).slice(2)}`,
    geracao: m.geracaoInversorKwh ?? 0,
    consumo: m.consumoTotalKwh ?? m.consumoRedeKwh ?? 0,
    economiaAcumulada: m.economiaAcumuladaRs,
    saldoPayback: m.saldoPaybackRs,
    selected: `${m.ano}-${m.mes}` === mesSelecionadoKey,
  }));

  const mesSelecionado =
    data.meses.find((m) => `${m.ano}-${m.mes}` === mesSelecionadoKey) ??
    (data.meses.length > 0 ? data.meses[data.meses.length - 1] : null);
  const mesesAnteriores = mesSelecionado
    ? data.meses.filter(
        (m) =>
          m.ano < mesSelecionado.ano ||
          (m.ano === mesSelecionado.ano && m.mes < mesSelecionado.mes),
      )
    : data.meses;

  const ultimoSaldo =
    data.meses.length > 0
      ? data.meses[data.meses.length - 1].saldoPaybackRs
      : data.investimentoTotal;
  const economiaTotal =
    data.meses.length > 0
      ? data.meses[data.meses.length - 1].economiaAcumuladaRs
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/admin/brasil-solar/proprietarios/${proprietarioId}/relatorios`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para lista de UCs
        </Link>
        <a
          href={
            mesSelecionado
              ? `/api/brasil-solar/proprietarios/${proprietarioId}/relatorios/${ucId}/pdf?ano=${mesSelecionado.ano}&mes=${mesSelecionado.mes}`
              : `/api/brasil-solar/proprietarios/${proprietarioId}/relatorios/${ucId}/pdf`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: brand.teal }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = brand.tealDark)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = brand.teal)
          }
        >
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </a>
      </div>

      {/* Hero header com selector de mês */}
      <div
        className="rounded-xl p-5 text-white relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${brand.tealDark} 0%, ${brand.teal} 60%, ${brand.orange} 100%)`,
        }}
      >
        <div
          className="absolute -top-16 -right-12 h-48 w-48 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
        />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/80">
              Relatório mensal — {data.proprietario.nome}
            </p>
            <h1 className="text-2xl font-bold">{data.uc.nome}</h1>
            <p className="text-sm text-white/85">
              UC {data.uc.codigoUc}
              {data.uc.distribuidora && ` · ${data.uc.distribuidora}`} ·{" "}
              {data.usinasMonitoradas.length} usina(s) monitorada(s) ·{" "}
              {data.potenciaTotalKwp.toLocaleString("pt-BR", {
                maximumFractionDigits: 2,
              })}{" "}
              kWp
            </p>
          </div>
          {data.meses.length > 0 && (
            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2">
              <label className="text-xs uppercase tracking-wide text-white/80">
                Mês de referência
              </label>
              <select
                value={mesSelecionadoKey ?? ""}
                onChange={(e) => setMesSelecionadoKey(e.target.value)}
                className="bg-white/90 text-foreground text-sm font-medium rounded px-2 py-1 outline-none"
              >
                {[...data.meses].reverse().map((m) => (
                  <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>
                    {MESES_LONGO[m.mes - 1]}/{m.ano}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* KPIs DO MÊS SELECIONADO */}
      {mesSelecionado && (
        <>
          <div className="flex items-center gap-2 mt-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: brand.tealDark }}>
              Resultado de {MESES_LONGO[mesSelecionado.mes - 1]}/{mesSelecionado.ano}
            </h2>
            {mesSelecionado.anomalia && (
              <span
                title={mesSelecionado.anomalia}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 rounded px-2 py-0.5"
              >
                <AlertTriangle className="h-3 w-3" />
                Atenção: anomalia detectada
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
            <KpiCard
              label="Geração"
              value={formatKwh(mesSelecionado.geracaoInversorKwh)}
              icon={<Sun className="h-4 w-4" />}
              color={brand.teal}
            />
            <KpiCard
              label="Desempenho"
              value={
                mesSelecionado.desempenhoPct != null
                  ? `${mesSelecionado.desempenhoPct.toFixed(0)}%`
                  : "—"
              }
              sublabel={
                data.geracaoEsperadaMensalKwh > 0
                  ? `Esperado: ${formatKwh(data.geracaoEsperadaMensalKwh)}`
                  : undefined
              }
              icon={<Activity className="h-4 w-4" />}
              color={brand.tealDark}
            />
            <KpiCard
              label="Consumo Total"
              value={formatKwh(mesSelecionado.consumoTotalKwh)}
              sublabel={
                mesSelecionado.consumoRedeKwh != null && mesSelecionado.consumoInstantaneoKwh != null
                  ? `${mesSelecionado.consumoRedeKwh.toFixed(0)} rede + ${mesSelecionado.consumoInstantaneoKwh.toFixed(0)} inst.`
                  : undefined
              }
              icon={<Zap className="h-4 w-4" />}
              color={brand.orange}
            />
            <KpiCard
              label="Economia mensal"
              value={
                mesSelecionado.economiaMensalRs != null
                  ? formatBRL(mesSelecionado.economiaMensalRs)
                  : "—"
              }
              sublabel={
                mesSelecionado.economiaInstantaneaRs != null && mesSelecionado.economiaInstantaneaRs > 0
                  ? `${formatBRL(mesSelecionado.economiaCompensadaRs ?? 0)} comp + ${formatBRL(mesSelecionado.economiaInstantaneaRs)} inst`
                  : undefined
              }
              icon={<TrendingUp className="h-4 w-4" />}
              color={brand.teal}
            />
            <KpiCard
              label="Fatura concessionária"
              value={
                mesSelecionado.faturadoRs != null
                  ? formatBRL(mesSelecionado.faturadoRs)
                  : "—"
              }
              icon={<Wallet className="h-4 w-4" />}
              color={brand.tealDark}
            />
            <KpiCard
              label="Retorno do mês"
              value={
                mesSelecionado.retornoPct != null
                  ? `${mesSelecionado.retornoPct.toFixed(2)}%`
                  : "—"
              }
              sublabel={`do investimento`}
              icon={<TrendingUp className="h-4 w-4" />}
              color={brand.orange}
            />
            <KpiCard
              label="Créditos acumulados"
              value={formatKwh(mesSelecionado.saldoCreditosKwh)}
              sublabel="Saldo GD na fatura"
              icon={<Wallet className="h-4 w-4" />}
              color={brand.teal}
            />
          </div>
        </>
      )}

      {/* Acumulados */}
      <div className="flex items-center gap-2 mt-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: brand.tealDark }}>
          Acumulado desde a operação
        </h2>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard
          label="Investimento total"
          value={formatBRL(data.investimentoTotal)}
          icon={<Wallet className="h-4 w-4" />}
          color={brand.tealDark}
        />
        <KpiCard
          label="Economia Total"
          value={formatBRL(economiaTotal)}
          sublabel={`${mesesAnteriores.length + 1} mês(es) com fatura`}
          icon={<TrendingUp className="h-4 w-4" />}
          color={brand.teal}
        />
        <KpiCard
          label="Retorno Total"
          value={`${data.retornoTotalPct.toFixed(2)}%`}
          sublabel={`Média: ${formatBRL(data.economiaMediaMensalRs)}/mês`}
          icon={<Activity className="h-4 w-4" />}
          color={brand.orange}
        />
        <KpiCard
          label={data.paybackQuitado ? "Payback quitado" : "Payback previsto"}
          value={
            data.paybackQuitado
              ? "✓"
              : data.paybackQuitacaoPrevista
                ? `${MESES_LONGO[data.paybackQuitacaoPrevista.mes - 1]}/${data.paybackQuitacaoPrevista.ano}`
                : "—"
          }
          sublabel={
            data.paybackQuitado
              ? "Investimento já recuperado"
              : `Saldo: ${formatBRL(Math.max(0, ultimoSaldo))}`
          }
          icon={
            data.paybackQuitado ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Calendar className="h-4 w-4" />
            )
          }
          color={data.paybackQuitado ? brand.teal : brand.orange}
        />
      </div>

      {/* Gráfico geração x consumo */}
      <Card>
        <CardContent className="p-4">
          <h2
            className="text-sm font-semibold uppercase tracking-wide mb-3"
            style={{ color: brand.tealDark }}
          >
            Geração × Consumo (kWh)
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 24, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) =>
                    `${Number(v).toLocaleString("pt-BR")} kWh`
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="geracao" name="Geração" fill={brand.teal}>
                  <LabelList
                    dataKey="geracao"
                    position="top"
                    style={{ fontSize: 10, fill: brand.tealDark, fontWeight: 600 }}
                    formatter={(v) => {
                      const n = Number(v);
                      return n > 0 ? Math.round(n).toLocaleString("pt-BR") : "";
                    }}
                  />
                </Bar>
                <Bar dataKey="consumo" name="Consumo" fill={brand.orange}>
                  <LabelList
                    dataKey="consumo"
                    position="top"
                    style={{ fontSize: 10, fill: brand.orange, fontWeight: 600 }}
                    formatter={(v) => {
                      const n = Number(v);
                      return n > 0 ? Math.round(n).toLocaleString("pt-BR") : "";
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico payback acumulado */}
      <Card>
        <CardContent className="p-4">
          <h2
            className="text-sm font-semibold uppercase tracking-wide mb-3"
            style={{ color: brand.tealDark }}
          >
            Economia acumulada × Investimento (R$)
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    `R$ ${(v / 1000).toFixed(0)}k`
                  }
                />
                <Tooltip formatter={(v) => formatBRL(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine
                  y={data.investimentoTotal}
                  stroke={brand.tealDark}
                  strokeDasharray="4 4"
                  label={{
                    value: "Investimento",
                    position: "insideTopRight",
                    fill: brand.tealDark,
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="economiaAcumulada"
                  name="Economia acumulada"
                  stroke={brand.teal}
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {!data.paybackQuitado && data.economiaMediaMensalRs > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Estimativa: o investimento se paga em{" "}
              <strong>
                {data.paybackQuitacaoPrevista
                  ? `${MESES_LONGO[data.paybackQuitacaoPrevista.mes - 1]}/${data.paybackQuitacaoPrevista.ano}`
                  : `~${data.paybackRestanteMeses} meses`}
              </strong>
              , partindo da economia média atual de{" "}
              {formatBRL(data.economiaMediaMensalRs)}/mês.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabela mês a mês */}
      <Card>
        <CardContent className="p-4">
          <h2
            className="text-sm font-semibold uppercase tracking-wide mb-3"
            style={{ color: brand.tealDark }}
          >
            Meses anteriores
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-2 px-2">Mês</th>
                  <th className="text-left py-2 px-2">Período</th>
                  <th className="text-right py-2 px-2">Geração</th>
                  <th className="text-right py-2 px-2" title="Energia injetada na rede (lida pelo medidor)">Injetada</th>
                  <th className="text-right py-2 px-2" title="Geração − Injeção (consumo direto da própria geração)">Cons. instantâneo</th>
                  <th className="text-right py-2 px-2" title="Consumo da rede + autoconsumo instantâneo">Consumo total</th>
                  <th className="text-right py-2 px-2" title="kWh compensados pelos créditos GD">Compensado</th>
                  <th className="text-right py-2 px-2">Economia mensal</th>
                  <th className="text-right py-2 px-2">Fatura concessionária</th>
                  <th className="text-right py-2 px-2">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {mesesAnteriores.map((m) => (
                  <tr key={`${m.ano}-${m.mes}`} className="border-b last:border-0">
                    <td className="py-2 px-2 font-medium">
                      {MES_ABREV[m.mes - 1]}/{m.ano}
                      {m.anomalia && (
                        <span
                          title={m.anomalia}
                          className="inline-flex ml-1 text-red-600"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {m.janela.inicio && m.janela.fim ? (
                        <>
                          {new Date(m.janela.inicio).toLocaleDateString("pt-BR")} →{" "}
                          {new Date(m.janela.fim).toLocaleDateString("pt-BR")}
                          {m.janela.fonte === "MES_CALENDARIO" && (
                            <span
                              title="Período baseado em mês calendário (sem datas de leitura na fatura)"
                              className="ml-1 text-amber-600"
                            >
                              <AlertTriangle className="inline h-3 w-3" />
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatKwh(m.geracaoInversorKwh)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatKwh(m.injetadaMedidorKwh)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {m.consumoInstantaneoKwh != null
                        ? formatKwh(m.consumoInstantaneoKwh)
                        : m.anomalia
                          ? <span className="text-red-600">—</span>
                          : "—"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">
                      {formatKwh(m.consumoTotalKwh)}
                      {m.consumoTotalKwh != null && m.consumoRedeKwh != null && m.consumoInstantaneoKwh != null && (
                        <div className="text-[10px] text-muted-foreground">
                          ({m.consumoRedeKwh} rede + {m.consumoInstantaneoKwh.toFixed(0)} inst.)
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatKwh(m.energiaCompensadaKwh)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">
                      {m.economiaMensalRs != null
                        ? formatBRL(m.economiaMensalRs)
                        : "—"}
                      {m.economiaInstantaneaRs != null && m.economiaInstantaneaRs > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          ({formatBRL(m.economiaCompensadaRs ?? 0)} comp + {formatBRL(m.economiaInstantaneaRs)} inst)
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {m.faturadoRs != null ? formatBRL(m.faturadoRs) : "—"}
                    </td>
                    <td
                      className="py-2 px-2 text-right tabular-nums font-semibold"
                      style={{ color: brand.tealDark }}
                    >
                      {formatBRL(m.economiaAcumuladaRs)}
                    </td>
                  </tr>
                ))}
                {mesesAnteriores.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {data.meses.length === 0
                        ? "Nenhuma fatura disponível para esta UC."
                        : "Nenhum mês anterior disponível. Suba faturas RGE dos meses anteriores para ver o histórico."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Lista de usinas monitoradas */}
      <Card>
        <CardContent className="p-4">
          <h2
            className="text-sm font-semibold uppercase tracking-wide mb-3"
            style={{ color: brand.tealDark }}
          >
            Usinas monitoradas vinculadas a esta UC
          </h2>
          <div className="space-y-1.5 text-sm">
            {data.usinasMonitoradas.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between py-1.5 border-b last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" style={{ color: brand.orange }} />
                  <span className="font-medium">{u.nome}</span>
                  {u.plataforma && (
                    <span className="text-xs text-muted-foreground">
                      · {u.plataforma}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {u.potenciaInstalada != null && (
                    <span>
                      {u.potenciaInstalada.toLocaleString("pt-BR", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      kWp
                    </span>
                  )}
                  {u.investimento != null && u.investimento > 0 && (
                    <span> · {formatBRL(u.investimento)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sublabel,
  icon,
  color,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span style={{ color }}>{icon}</span>
          {label}
        </div>
        <div className="mt-1 text-xl font-bold" style={{ color }}>
          {value}
        </div>
        {sublabel && (
          <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}
