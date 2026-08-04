"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Zap, TrendingUp, Loader2 } from "lucide-react";
import type {
  PortalClienteData,
  PortalCurvaDia,
  PortalSerieGeracao,
  PortalStatusMonitoramento,
} from "@/lib/portal-cliente-data";

const TEAL = "#2E9B87";
const ORANGE = "#EA6E2C";
const ORANGE_DEEP = "#C2551C";
// Verde-petróleo dos relatórios do cliente (relatório BS / demonstrativo).
const GREEN = "#2E9B87";
const GREEN_DEEP = "#1B5E54";
// Âmbar: período com geração INFORMADA (lançamento manual), não medida pela
// plataforma de monitoramento. Cor distinta de propósito — o cliente tem que
// conseguir separar o que foi medido do que foi declarado.
const INFORMADO = "#D9A02B";
const INK = "#1F1F1F";
const INK_SOFT = "#59604F";
const INK_FAINT = "#8A938D";
const BORDER = "#E1EAE7";

// Escala com valores "redondos" no eixo Y (evita números quebrados)
function niceTicks(rawMax: number, count = 4) {
  const rough = Math.max(rawMax, 1) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { niceMax: step * count, step, count };
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const kwh = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const tarifaBrl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES_LONGO = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Dashboard de geração do portal do cliente.
 *
 * `proprietarioId`: quando definido, os gráficos interativos buscam pelos
 * endpoints admin de prévia (`/api/admin/brasil-solar/portal-preview/geracao/*`),
 * usados pela "Visão do cliente" do pós-venda. Sem ele, usam os endpoints do
 * cliente, que resolvem o proprietário pelo usuário logado.
 */
export function PortalClienteDashboard({
  data,
  proprietarioId,
}: {
  data: PortalClienteData;
  proprietarioId?: string;
}) {
  if (!data.temDados) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center" style={{ borderColor: BORDER }}>
        <p className="text-sm" style={{ color: INK_SOFT }}>
          Ainda não temos dados de geração das suas usinas. Assim que a coleta
          começar, seus números aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          rail={ORANGE}
          icon={<Zap className="h-4 w-4" style={{ color: ORANGE_DEEP }} />}
          label={`Geração · ${data.refLabel ?? "—"}`}
          value={kwh(data.refKwh)}
          unit="kWh"
          foot={`Média diária ${data.refMediaDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kWh`}
        />
        <Kpi
          label={`Economia · ${data.refLabel ?? "—"}`}
          value={brl(data.refEconomia)}
          tag="estimada"
          foot={`tarifa ${tarifaBrl(data.tarifaRef)}/kWh${data.tarifaRefFonte ? ` · ref. ${data.tarifaRefFonte}` : ""}`}
        />
        <Kpi
          rail={TEAL}
          icon={<TrendingUp className="h-4 w-4" style={{ color: TEAL }} />}
          label="Geração · 12 meses"
          value={kwh(data.geracao12m)}
          unit="kWh"
          foot="produção acumulada"
        />
        <Kpi
          label="Economia · 12 meses"
          value={brl(data.economia12m)}
          tag="estimada"
          foot={`≈ ${brl(Math.round(data.economia12m / 12))} por mês`}
        />
      </div>

      {/* 1º — Geração diária: curva intradiária (kW × hora) do dia escolhido
          (padrão: hoje), com indicador online/offline e seletor de data. */}
      <GeracaoDiariaCard
        curvaInicial={data.curvaDia}
        statusInicial={data.statusMonitoramento}
        hojeYmd={data.hojeYmd}
        proprietarioId={proprietarioId}
      />

      {/* 2º — Geração Mensal: ano inteiro (barra por mês) ou mês (barra por dia). */}
      <GeracaoMensalCard
        serieInicial={data.serieMensal}
        anosDisponiveis={data.anosDisponiveis}
        proprietarioId={proprietarioId}
      />

      {/* 3º — Geração × Consumo (mesmas cores do relatório do cliente) */}
      {data.porMes.some((m) => m.consumoKwh != null) && (
        <Card title="Geração × Consumo" hint="kWh · últimos meses">
          <GeracaoConsumoChart data={data} />
          <Legend
            items={[
              { color: GREEN, label: "Geração" },
              { color: ORANGE, label: "Consumo" },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

function Kpi({
  rail, icon, label, value, unit, tag, foot,
}: {
  rail?: string;
  icon?: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  tag?: string;
  foot?: string;
}) {
  return (
    <div
      className="relative bg-white border rounded-2xl p-4 overflow-hidden"
      style={{ borderColor: BORDER }}
    >
      {rail && (
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: rail }} />
      )}
      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: INK_SOFT }}>
        {icon}
        {label}
        {tag && (
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ color: ORANGE_DEEP, background: "#FDE9D7" }}
          >
            {tag}
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums leading-none" style={{ color: INK }}>
        {value}
        {unit && <span className="text-sm font-semibold ml-1" style={{ color: INK_SOFT }}>{unit}</span>}
      </div>
      {foot && <div className="mt-2 text-xs" style={{ color: INK_FAINT }}>{foot}</div>}
    </div>
  );
}

function Card({
  title, hint, badge, right, children,
}: {
  title: string;
  hint?: string;
  /** Selo colado no título (ex.: online/offline). */
  badge?: React.ReactNode;
  /** Controles no canto direito do cabeçalho (ex.: seletores de período). */
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-2xl p-5" style={{ borderColor: BORDER }}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-semibold" style={{ color: INK }}>{title}</h2>
          {badge}
          {hint && <span className="text-xs" style={{ color: INK_FAINT }}>{hint}</span>}
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
      {children}
    </div>
  );
}

/** Selo de comunicação da usina ao lado do título "Geração diária". */
function StatusBadge({ status }: { status: PortalStatusMonitoramento }) {
  const cfg = {
    ONLINE: { texto: "Online", cor: "#166534", fundo: "#DCFCE7", ponto: "#16A34A" },
    REPOUSO: { texto: "Em repouso", cor: "#7C4A03", fundo: "#FEF3C7", ponto: "#D97706" },
    OFFLINE: { texto: "Offline", cor: "#991B1B", fundo: "#FEE2E2", ponto: "#DC2626" },
    SEM_DADOS: { texto: "Sem telemetria", cor: "#4B5563", fundo: "#F3F4F6", ponto: "#9CA3AF" },
  }[status.estado];

  const titulo =
    status.estado === "REPOUSO"
      ? "Fora do horário de geração — leituras voltam com o sol"
      : status.ultimaLeituraLabel
        ? `Última leitura: ${status.ultimaLeituraLabel}`
        : "Esta usina ainda não envia leituras instantâneas";

  return (
    <span
      title={titulo}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0"
      style={{ color: cfg.cor, background: cfg.fundo }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: cfg.ponto }} />
      {cfg.texto}
    </span>
  );
}

const selectCls =
  "text-xs font-medium rounded-lg border px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-[#2E9B87]/30";

/** Monta a URL do endpoint certo (cliente x prévia admin). */
function geracaoUrl(
  recurso: "dia" | "mensal",
  params: Record<string, string | number | undefined>,
  proprietarioId?: string,
) {
  const base = proprietarioId
    ? `/api/admin/brasil-solar/portal-preview/geracao/${recurso}`
    : `/api/portal-cliente/geracao/${recurso}`;
  const qs = Object.entries({ ...params, proprietarioId })
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

/** "YYYY-MM-DD" do dia anterior (sem fuso: aritmética em UTC sobre a data). */
function ontemYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Card "Geração diária": curva intradiária do dia selecionado (padrão hoje),
 * selo online/offline ao lado do título e seletor de data à direita.
 */
export function GeracaoDiariaCard({
  curvaInicial, statusInicial, hojeYmd, proprietarioId, totalMensal,
}: {
  curvaInicial: PortalCurvaDia;
  statusInicial: PortalStatusMonitoramento;
  hojeYmd: string;
  proprietarioId?: string;
  /** Total do mês corrente exibido no canto superior direito (free-tier). */
  totalMensal?: { label: string; kwh: number } | null;
}) {
  const [dataSel, setDataSel] = useState(curvaInicial.data);
  const [curva, setCurva] = useState(curvaInicial);
  const [status, setStatus] = useState(statusInicial);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // A carga inicial já veio do servidor. Ela é reaproveitada, exceto quando o
  // dia é hoje/ontem: aí buscamos de novo com `refresh=1` para o servidor
  // coletar na Sungrow o que o cron ainda não trouxe (a curva do dia atual vai
  // se formando ao longo do dia).
  const primeiraRenderizacao = useRef(true);

  useEffect(() => {
    const inicial = primeiraRenderizacao.current;
    primeiraRenderizacao.current = false;
    const recente = dataSel === hojeYmd || dataSel === ontemYmd(hojeYmd);
    if (inicial && !recente) return;

    let cancelado = false;
    setCarregando(true);
    setErro(null);
    fetch(geracaoUrl("dia", { data: dataSel, refresh: recente ? "1" : undefined }, proprietarioId))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
      .then((json: PortalCurvaDia & { statusMonitoramento: PortalStatusMonitoramento }) => {
        if (cancelado) return;
        setCurva(json);
        setStatus(json.statusMonitoramento);
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar esta data."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [dataSel, hojeYmd, proprietarioId]);

  const total =
    curva.totalKwh != null
      ? `${curva.totalKwh.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kWh no dia`
      : null;

  return (
    <Card
      title="Geração diária"
      badge={<StatusBadge status={status} />}
      hint={`potência (kW) · ${curva.label}`}
      right={
        <>
          {totalMensal && (
            <div className="text-right leading-tight mr-1 hidden sm:block">
              <div className="text-[11px]" style={{ color: INK_FAINT }}>
                Geração mensal · {totalMensal.label}
              </div>
              <div className="text-base font-bold tabular-nums" style={{ color: INK }}>
                {kwh(totalMensal.kwh)} kWh
              </div>
            </div>
          )}
          {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: INK_FAINT }} />}
          <label className="text-xs" style={{ color: INK_FAINT }} htmlFor="portal-data-dia">
            Data
          </label>
          <input
            id="portal-data-dia"
            type="date"
            className={selectCls}
            style={{ borderColor: BORDER, color: INK }}
            value={dataSel}
            max={hojeYmd}
            onChange={(e) => e.target.value && setDataSel(e.target.value)}
          />
        </>
      }
    >
      {curva.pontos.length > 0 ? (
        <>
          <IntradayChart pontos={curva.pontos} />
          <Legend
            items={[
              {
                color: GREEN,
                label: `Pico ${curva.picoKw.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kW${total ? ` · ${total}` : ""}`,
              },
            ]}
          />
        </>
      ) : (
        <EmptyChart
          texto={
            erro ??
            (total
              ? `Sem curva instantânea para ${curva.label} — geração registrada: ${total}.`
              : `Sem dados de geração para ${curva.label}.`)
          }
        />
      )}
    </Card>
  );
}

/**
 * Card "Geração Mensal": o cliente escolhe o ano (12 barras, uma por mês) ou um
 * mês específico do ano (uma barra por dia).
 */
export function GeracaoMensalCard({
  serieInicial, anosDisponiveis, proprietarioId,
}: {
  serieInicial: PortalSerieGeracao;
  anosDisponiveis: number[];
  proprietarioId?: string;
}) {
  const [ano, setAno] = useState(serieInicial.ano);
  const [mes, setMes] = useState<number | null>(serieInicial.mes);
  const [serie, setSerie] = useState(serieInicial);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiraRenderizacao = useRef(true);

  const buscar = useCallback(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    fetch(geracaoUrl("mensal", { ano, mes: mes ?? undefined }, proprietarioId))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
      .then((json: PortalSerieGeracao) => !cancelado && setSerie(json))
      .catch(() => !cancelado && setErro("Não foi possível carregar este período."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [ano, mes, proprietarioId]);

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    return buscar();
  }, [buscar]);

  const temDados = serie.pontos.some((p) => p.kwh > 0);
  const periodo = serie.mes ? `${MESES_LONGO[serie.mes - 1]} de ${serie.ano}` : String(serie.ano);

  return (
    <Card
      title="Geração Mensal"
      hint={`kWh · ${serie.mes ? "por dia" : "por mês"} · ${periodo}`}
      right={
        <>
          {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: INK_FAINT }} />}
          <select
            aria-label="Ano"
            className={selectCls}
            style={{ borderColor: BORDER, color: INK }}
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
          >
            {anosDisponiveis.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            aria-label="Mês"
            className={selectCls}
            style={{ borderColor: BORDER, color: INK }}
            value={mes ?? ""}
            onChange={(e) => setMes(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Ano inteiro</option>
            {MESES_LONGO.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </>
      }
    >
      {temDados ? (
        <>
          <BarsChart pontos={serie.pontos} denso={serie.mes != null} />
          <Legend
            items={[
              {
                color: GREEN_DEEP,
                label: `Total do período: ${kwh(serie.totalKwh)} kWh`,
              },
              // Só aparece quando há período informado — legenda de exceção não
              // polui o gráfico de quem tem monitoramento funcionando.
              ...(serie.manualKwh && serie.manualKwh > 0
                ? [
                    {
                      color: INFORMADO,
                      label: `Informado pela Brasil Solar: ${kwh(serie.manualKwh)} kWh`,
                    },
                  ]
                : []),
            ]}
          />
        </>
      ) : (
        <EmptyChart texto={erro ?? `Sem geração registrada em ${periodo}.`} />
      )}
    </Card>
  );
}

function EmptyChart({ texto }: { texto: string }) {
  return (
    <div
      className="mt-3 rounded-xl border border-dashed py-10 text-center text-sm"
      style={{ borderColor: BORDER, color: INK_FAINT }}
    >
      {texto}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex gap-4 mt-2.5 text-xs" style={{ color: INK_SOFT }}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Barras de kWh por período — serve tanto para o ano (12 barras, uma por mês)
 * quanto para um mês (uma barra por dia, `denso`). No modo denso os rótulos do
 * eixo X aparecem de 5 em 5 dias para não embolar.
 */
function BarsChart({
  pontos, denso,
}: {
  /** `manual` = período informado pela Brasil Solar, não medido pela plataforma. */
  pontos: { label: string; kwh: number; manual?: boolean }[];
  denso: boolean;
}) {
  const W = denso ? 900 : 640, H = denso ? 220 : 240;
  const padL = 44, padR = 12, padT = 14, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const rawMax = Math.max(denso ? 10 : 100, ...pontos.map((p) => p.kwh));
  const { niceMax, step, count } = niceTicks(rawMax, 4);
  const n = pontos.length || 1;
  const slot = iw / n;
  const bw = denso ? slot * 0.66 : Math.min(34, slot * 0.6);
  const maiorIdx = pontos.reduce((best, p, i) => (p.kwh > pontos[best].kwh ? i : best), 0);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Geração em kWh por período">
        {Array.from({ length: count + 1 }, (_, i) => {
          const val = step * i;
          const y = padT + ih - (val / niceMax) * ih;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={BORDER} strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fill={INK_FAINT} fontSize={11}>
                {kwh(val)}
              </text>
            </g>
          );
        })}
        {pontos.map((p, i) => {
          const h = (p.kwh / niceMax) * ih;
          const x = padL + slot * i + (slot - bw) / 2;
          const y = padT + ih - h;
          const destaque = p.kwh > 0 && i === maiorIdx;
          const mostraLabel = !denso || i === 0 || (i + 1) % 5 === 0;
          return (
            <g key={p.label + i}>
              <rect
                x={x}
                y={y}
                width={bw}
                height={Math.max(h, p.kwh > 0 ? 1.5 : 0)}
                rx={denso ? 3 : 4}
                fill={p.manual ? INFORMADO : destaque ? GREEN_DEEP : GREEN}
                opacity={p.kwh > 0 ? 1 : 0.25}
              />
              {mostraLabel && (
                <text
                  x={x + bw / 2}
                  y={H - 10}
                  textAnchor="middle"
                  fill={destaque ? INK : INK_FAINT}
                  fontSize={10}
                  fontWeight={destaque ? 700 : 400}
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function IntradayChart({ pontos }: { pontos: { hora: string; kw: number }[] }) {
  const W = 900, H = 220, padL = 40, padR = 12, padT = 14, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const pts = pontos;
  const rawMax = Math.max(1, ...pts.map((p) => p.kw));
  const { niceMax, step, count } = niceTicks(rawMax, 4);
  const n = pts.length;
  const px = (i: number) => padL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const py = (kw: number) => padT + ih - (kw / niceMax) * ih;

  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p.kw).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${px(n - 1).toFixed(1)},${padT + ih} L${px(0).toFixed(1)},${padT + ih} Z`;

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Curva de geração diária em kW">
        {Array.from({ length: count + 1 }, (_, i) => {
          const val = step * i;
          const y = padT + ih - (val / niceMax) * ih;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={BORDER} strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fill={INK_FAINT} fontSize={11}>
                {val.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              </text>
            </g>
          );
        })}
        <path d={area} fill={GREEN} fillOpacity={0.16} />
        <path d={line} fill="none" stroke={GREEN} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => {
          const [hh, mm] = p.hora.split(":");
          if (mm !== "00" || Number(hh) % 3 !== 0) return null;
          return (
            <text key={i} x={px(i)} y={H - 8} textAnchor="middle" fill={INK_FAINT} fontSize={10}>
              {hh}h
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function GeracaoConsumoChart({ data }: { data: PortalClienteData }) {
  const W = 640, H = 240, padL = 44, padR = 12, padT = 14, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const meses = data.porMes;
  const rawMax = Math.max(
    100,
    ...meses.map((m) => Math.max(m.kwh, m.consumoKwh ?? 0)),
  );
  const { niceMax, step, count } = niceTicks(rawMax, 4);
  const n = meses.length || 1;
  const slot = iw / n;
  const gap = Math.min(4, slot * 0.08);
  const bw = Math.min(15, (slot * 0.6 - gap) / 2);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Geração e consumo mensal em kWh">
        {Array.from({ length: count + 1 }, (_, i) => {
          const val = step * i;
          const y = padT + ih - (val / niceMax) * ih;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={BORDER} strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fill={INK_FAINT} fontSize={11}>
                {kwh(val)}
              </text>
            </g>
          );
        })}
        {meses.map((m, i) => {
          const groupCenter = padL + slot * i + slot / 2;
          const gerH = (m.kwh / niceMax) * ih;
          const gerX = groupCenter - gap / 2 - bw;
          const gerY = padT + ih - gerH;
          const hasCons = m.consumoKwh != null;
          const consH = hasCons ? (m.consumoKwh! / niceMax) * ih : 0;
          const consX = groupCenter + gap / 2;
          const consY = padT + ih - consH;
          return (
            <g key={`${m.ano}-${m.mes}`}>
              <rect x={gerX} y={gerY} width={bw} height={Math.max(gerH, 0)} rx={3} fill={GREEN} />
              {hasCons && (
                <rect x={consX} y={consY} width={bw} height={Math.max(consH, 0)} rx={3} fill={ORANGE} />
              )}
              <text x={groupCenter} y={H - 10} textAnchor="middle" fill={INK_FAINT} fontSize={10}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
