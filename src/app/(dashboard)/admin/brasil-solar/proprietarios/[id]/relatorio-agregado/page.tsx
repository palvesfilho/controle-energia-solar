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
  AlertTriangle,
  FileDown,
  Sun,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ExportarTabela } from "@/components/ui/exportar-tabela";
import { brand } from "@/lib/brand-colors";
import { formatCodigoUc } from "@/lib/uc-codigo";

interface BeneficiariaRow {
  ucId: string;
  codigoUc: string;
  nome: string;
  percentual: number;
  consumoRedeKwh: number | null;
  energiaCompensadaKwh: number | null;
  economiaMensalRs: number | null;
  faturadoRs: number | null;
  contaSemSolarRs: number | null;
}

interface MonthRow {
  ano: number;
  mes: number;
  janela: { inicio: string | null; fim: string | null; fonte: string };
  consumoRedeKwhTotal: number | null;
  energiaCompensadaKwhTotal: number | null;
  economiaMensalRs: number | null;
  economiaAcumuladaRs: number;
  faturadoRs: number | null;
  contaSemSolarRsTotal: number | null;
  saldoCreditosBeneficiariasTotal: number | null;
  geracaoInversorKwh: number | null;
  injetadaMedidorKwh: number | null;
  saldoCreditosTitular: number | null;
  beneficiarias: BeneficiariaRow[];
}

interface ApiResponse {
  proprietario: { id: string; nome: string; cidade: string | null; uf: string | null };
  titular: { ucId: string; codigoUc: string; distribuidora: string | null } | null;
  beneficiarias: { ucId: string; codigoUc: string; nome: string; percentual: number }[];
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
  economiaMediaMensalRs: number;
  retornoTotalPct: number;
  meses: MonthRow[];
  /** Conclusão "Situação do rateio" que fecha o relatório. `null` = não apurada. */
  situacao: unknown | null;
  /** Preenchido EXATAMENTE quando `situacao` é `null` — ver relatório por UC. */
  situacaoIndisponivel: {
    motivo: "SEM_USINA_MONITORADA" | "SEM_GERACAO_MEDIDA" | "SEM_HISTORICO";
    titulo: string;
    texto: string;
    acaoInterna: string;
  } | null;
}

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const MESES_LONGO = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Dias do ciclo de leitura da fatura — janela em que a geração é apurada. */
function diasJanela(m: MonthRow): number | null {
  if (m.janela.fonte !== "CICLO_LEITURA" || !m.janela.inicio || !m.janela.fim)
    return null;
  const dias = Math.round(
    (new Date(m.janela.fim).getTime() - new Date(m.janela.inicio).getTime()) /
      86_400_000,
  );
  return dias > 0 ? dias : null;
}

function formatBRL(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatKwh(v: number | null) {
  return v == null
    ? "—"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " kWh";
}

export default function RelatorioAgregadoPage() {
  const params = useParams();
  const proprietarioId = params.id as string;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mesSelecionadoKey, setMesSelecionadoKey] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/brasil-solar/proprietarios/${proprietarioId}/relatorio-agregado`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as ApiResponse;
      })
      .then((d) => {
        setData(d);
        if (d.meses.length > 0) {
          const ultimo = d.meses[d.meses.length - 1];
          setMesSelecionadoKey(`${ultimo.ano}-${ultimo.mes}`);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [proprietarioId]);

  if (loading) {
    return <p className="p-8 text-sm text-muted-foreground">Carregando...</p>;
  }
  if (error || !data) {
    return <p className="p-8 text-sm text-red-600">Erro: {error}</p>;
  }

  const mesSelecionado =
    data.meses.find((m) => `${m.ano}-${m.mes}` === mesSelecionadoKey) ??
    (data.meses.length > 0 ? data.meses[data.meses.length - 1] : null);

  const semMonitoramento = data.usinasMonitoradas.length === 0;
  const semFaturaTitular =
    !mesSelecionado ||
    (mesSelecionado.injetadaMedidorKwh == null &&
      mesSelecionado.saldoCreditosTitular == null);

  const economiaTotal =
    data.meses.length > 0
      ? data.meses[data.meses.length - 1].economiaAcumuladaRs
      : 0;

  const totaisBenef = mesSelecionado
    ? mesSelecionado.beneficiarias.reduce(
        (acc, b) => ({
          consumoRedeKwh: (acc.consumoRedeKwh ?? 0) + (b.consumoRedeKwh ?? 0),
          energiaCompensadaKwh:
            (acc.energiaCompensadaKwh ?? 0) + (b.energiaCompensadaKwh ?? 0),
          economiaMensalRs:
            (acc.economiaMensalRs ?? 0) + (b.economiaMensalRs ?? 0),
          faturadoRs: (acc.faturadoRs ?? 0) + (b.faturadoRs ?? 0),
          contaSemSolarRs:
            (acc.contaSemSolarRs ?? 0) + (b.contaSemSolarRs ?? 0),
        }),
        {
          consumoRedeKwh: 0,
          energiaCompensadaKwh: 0,
          economiaMensalRs: 0,
          faturadoRs: 0,
          contaSemSolarRs: 0,
        },
      )
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin/brasil-solar/proprietarios"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para clientes
        </Link>
        <a
          href={
            mesSelecionado
              ? `/api/brasil-solar/proprietarios/${proprietarioId}/relatorio-agregado/pdf?ano=${mesSelecionado.ano}&mes=${mesSelecionado.mes}`
              : `/api/brasil-solar/proprietarios/${proprietarioId}/relatorio-agregado/pdf`
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

      <div
        className="rounded-xl p-5 text-white relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${brand.tealDark} 0%, ${brand.teal} 60%, ${brand.orange} 100%)`,
        }}
      >
        <div className="absolute -top-16 -right-12 h-48 w-48 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.10)" }} />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/80">
              Relatório consolidado
            </p>
            <h1 className="text-2xl font-bold">{data.proprietario.nome}</h1>
            <p className="text-sm text-white/85">
              {data.beneficiarias.length} beneficiária(s)
              {data.titular && ` · Titular UC ${formatCodigoUc(data.titular.codigoUc)}`}
              {data.titular?.distribuidora && ` · ${data.titular.distribuidora}`}
              {!semMonitoramento &&
                ` · ${data.potenciaTotalKwp.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kWp`}
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

      {semMonitoramento && (
        <div
          className="rounded-lg border p-3 flex items-start gap-2"
          style={{ borderColor: brand.orange, backgroundColor: "#FFF6EE" }}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: brand.orange }} />
          <div className="text-xs">
            <p className="font-semibold" style={{ color: brand.orange }}>
              Monitoramento da usina ainda não configurado
            </p>
            <p className="text-muted-foreground mt-0.5">
              Os campos de geração do inversor e retorno do investimento estão indisponíveis. Os valores
              de economia consideram apenas os créditos compensados — a economia real tende a ser maior.
            </p>
          </div>
        </div>
      )}

      {/* Aviso de CONCLUSÃO AUSENTE — antes de exportar/enviar. Mesma regra do
          relatório por UC: a análise nunca some calada do documento. */}
      {data.situacaoIndisponivel && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
          <div className="text-xs">
            <p className="font-semibold text-amber-800">
              O relatório vai sair SEM a análise final — {data.situacaoIndisponivel.titulo}
            </p>
            <p className="text-amber-900/80 mt-0.5">
              {data.situacaoIndisponivel.acaoInterna}
            </p>
            <p className="text-muted-foreground mt-1">
              <span className="font-medium">O cliente lerá, no lugar da análise:</span>{" "}
              {data.situacaoIndisponivel.texto}
            </p>
          </div>
        </div>
      )}

      {mesSelecionado && (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide mt-2" style={{ color: brand.tealDark }}>
            Resultado consolidado de {MESES_LONGO[mesSelecionado.mes - 1]}/{mesSelecionado.ano}
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="Compensado total"
              value={formatKwh(mesSelecionado.energiaCompensadaKwhTotal)}
              sublabel={`soma das ${data.beneficiarias.length} beneficiárias`}
              icon={<Activity className="h-4 w-4" />}
              color={brand.teal}
            />
            <KpiCard
              label="Economia mensal"
              value={formatBRL(mesSelecionado.economiaMensalRs)}
              sublabel={semMonitoramento ? "créditos compensados" : "consolidado"}
              icon={<TrendingUp className="h-4 w-4" />}
              color={brand.teal}
            />
            <KpiCard
              label="Fatura RGE total"
              value={formatBRL(mesSelecionado.faturadoRs)}
              sublabel="soma das beneficiárias"
              icon={<Wallet className="h-4 w-4" />}
              color={brand.tealDark}
            />
            <KpiCard
              label="Sem energia solar"
              value={formatBRL(mesSelecionado.contaSemSolarRsTotal)}
              sublabel="quanto pagariam sem a usina"
              icon={<Sun className="h-4 w-4" />}
              color={brand.orange}
            />
            <KpiCard
              label="Consumo total"
              value={formatKwh(mesSelecionado.consumoRedeKwhTotal)}
              sublabel="rede (kWh)"
              icon={<Zap className="h-4 w-4" />}
              color={brand.orange}
            />
            {!semMonitoramento && (
              <KpiCard
                label="Geração da usina"
                value={formatKwh(mesSelecionado.geracaoInversorKwh)}
                sublabel="do inversor"
                icon={<Sun className="h-4 w-4" />}
                color={brand.teal}
              />
            )}
          </div>

          <h2 className="text-sm font-semibold uppercase tracking-wide mt-4" style={{ color: brand.tealDark }}>
            Usina (UC titular{data.titular ? ` ${formatCodigoUc(data.titular.codigoUc)}` : ""})
          </h2>
          {semFaturaTitular && (
            <p className="text-xs text-muted-foreground italic">
              Fatura da UC titular ainda não cadastrada — dados de injeção e saldo de créditos serão
              preenchidos quando ela for enviada ao sistema.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <KpiCard
              label="Energia gerada"
              value={formatKwh(mesSelecionado.geracaoInversorKwh)}
              sublabel="inversor — total do período"
              icon={<Sun className="h-4 w-4" />}
              color={brand.teal}
            />
            <KpiCard
              label="Energia injetada na rede"
              value={formatKwh(mesSelecionado.injetadaMedidorKwh)}
              sublabel="fatura da titular"
              icon={<Activity className="h-4 w-4" />}
              color={brand.tealDark}
            />
            <KpiCard
              label="Saldo de créditos"
              value={formatKwh(mesSelecionado.saldoCreditosTitular)}
              sublabel="GD acumulado na titular"
              icon={<Wallet className="h-4 w-4" />}
              color={brand.orange}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: brand.tealDark }}>
              Distribuição entre beneficiárias — {MESES_LONGO[mesSelecionado.mes - 1]}/{mesSelecionado.ano}
            </h2>
            <ExportarTabela
              tabela="bs-agregado-beneficiarias"
              nome="distribuicao-beneficiarias"
              aba="Beneficiárias"
              size="xs"
            />
          </div>
          <Card>
            <CardContent className="p-4 overflow-x-auto">
              <table className="w-full text-xs" data-tabela="bs-agregado-beneficiarias">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2 px-2">UC</th>
                    <th className="text-right py-2 px-2">Rateio</th>
                    <th className="text-right py-2 px-2">Consumo</th>
                    <th className="text-right py-2 px-2">Compensado</th>
                    <th className="text-right py-2 px-2">Economia</th>
                    <th className="text-right py-2 px-2">Fatura RGE</th>
                    <th className="text-right py-2 px-2">Sem solar</th>
                  </tr>
                </thead>
                <tbody>
                  {mesSelecionado.beneficiarias.map((b) => (
                    <tr key={b.ucId} className="border-b last:border-0">
                      <td className="py-2 px-2">
                        <div className="font-medium">{b.nome}</div>
                        <div className="text-[10px] text-muted-foreground">UC {formatCodigoUc(b.codigoUc)}</div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{b.percentual.toFixed(0)}%</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatKwh(b.consumoRedeKwh)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatKwh(b.energiaCompensadaKwh)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: brand.teal }}>
                        {formatBRL(b.economiaMensalRs)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatBRL(b.faturadoRs)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: brand.orange }}>
                        {formatBRL(b.contaSemSolarRs)}
                      </td>
                    </tr>
                  ))}
                  {totaisBenef && (
                    <tr className="bg-muted/40 font-semibold">
                      <td className="py-2 px-2">TOTAL</td>
                      <td className="py-2 px-2 text-right tabular-nums">100%</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatKwh(totaisBenef.consumoRedeKwh)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatKwh(totaisBenef.energiaCompensadaKwh)}</td>
                      <td className="py-2 px-2 text-right tabular-nums" style={{ color: brand.teal }}>
                        {formatBRL(totaisBenef.economiaMensalRs)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatBRL(totaisBenef.faturadoRs)}</td>
                      <td className="py-2 px-2 text-right tabular-nums" style={{ color: brand.orange }}>
                        {formatBRL(totaisBenef.contaSemSolarRs)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      <h2 className="text-sm font-semibold uppercase tracking-wide mt-4" style={{ color: brand.tealDark }}>
        {semMonitoramento
          ? "Economia acumulada (créditos compensados)"
          : "Acumulado desde a operação"}
      </h2>
      <div className="grid gap-3 md:grid-cols-4">
        {!semMonitoramento && (
          <KpiCard
            label="Investimento total"
            value={formatBRL(data.investimentoTotal)}
            icon={<Wallet className="h-4 w-4" />}
            color={brand.tealDark}
          />
        )}
        <KpiCard
          label="Economia Total"
          value={formatBRL(economiaTotal)}
          sublabel={`${data.meses.length} mês(es) com fatura`}
          icon={<TrendingUp className="h-4 w-4" />}
          color={brand.teal}
        />
        <KpiCard
          label="Economia média"
          value={formatBRL(data.economiaMediaMensalRs)}
          sublabel="por mês"
          icon={<Activity className="h-4 w-4" />}
          color={brand.orange}
        />
        {!semMonitoramento && (
          <KpiCard
            label="Retorno Total"
            value={`${data.retornoTotalPct.toFixed(2)}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            color={brand.orange}
          />
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: brand.tealDark }}>
              Histórico consolidado por mês
            </h2>
            <ExportarTabela
              tabela="bs-agregado-historico"
              nome="historico-consolidado"
              aba="Histórico"
              size="xs"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-tabela="bs-agregado-historico">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-2 px-2">Mês</th>
                  <th
                    className="text-right py-2 px-2"
                    title="Geração da usina no intervalo entre a leitura anterior e a leitura atual da fatura"
                  >
                    Geração mensal
                  </th>
                  <th className="text-right py-2 px-2" title="Soma do consumo das beneficiárias (sem consumo instantâneo — beneficiárias não têm geração própria)">Consumo total</th>
                  <th className="text-right py-2 px-2">Compensado</th>
                  <th className="text-right py-2 px-2">Economia</th>
                  <th className="text-right py-2 px-2">Fatura RGE</th>
                  <th className="text-right py-2 px-2">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {[...data.meses].reverse().map((m) => (
                  <tr key={`${m.ano}-${m.mes}`} className="border-b last:border-0">
                    <td className="py-2 px-2 font-medium">
                      {MES_ABREV[m.mes - 1]}/{m.ano}
                      {diasJanela(m) != null && (
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {diasJanela(m)} dias
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: brand.teal }}>
                      {formatKwh(m.geracaoInversorKwh)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatKwh(m.consumoRedeKwhTotal)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatKwh(m.energiaCompensadaKwhTotal)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: brand.teal }}>
                      {formatBRL(m.economiaMensalRs)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatBRL(m.faturadoRs)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: brand.tealDark }}>
                      {formatBRL(m.economiaAcumuladaRs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
