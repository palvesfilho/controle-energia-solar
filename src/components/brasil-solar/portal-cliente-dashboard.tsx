"use client";

import { Zap, TrendingUp } from "lucide-react";
import type { PortalClienteData } from "@/lib/portal-cliente-data";

const TEAL = "#2E9B87";
const ORANGE = "#EA6E2C";
const ORANGE_DEEP = "#C2551C";
// Verde-petróleo dos relatórios do cliente (relatório BS / demonstrativo).
const GREEN = "#2E9B87";
const GREEN_DEEP = "#1B5E54";
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

export function PortalClienteDashboard({ data }: { data: PortalClienteData }) {
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

      {/* 1º — Geração diária: curva intradiária (kW × hora) do dia mais recente;
          se não houver dados intradiários, cai no gráfico de kWh por dia do mês. */}
      {data.curvaDia.length > 0 ? (
        <Card
          title="Geração diária"
          hint={`potência (kW) · ${data.curvaDiaLabel ?? ""}`}
        >
          <IntradayChart data={data} />
          <Legend items={[{ color: GREEN, label: `Pico ${data.curvaDiaPicoKw.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kW` }]} />
        </Card>
      ) : (
        data.refDias.length > 0 && (
          <Card title="Geração diária" hint={`kWh por dia · ${data.refLabel}`}>
            <DailyChart data={data} />
          </Card>
        )
      )}

      {/* 2º — Gráfico mês a mês */}
      <Card title="Geração mês a mês" hint="kWh · últimos meses">
        <MonthlyChart data={data} />
        <Legend items={[{ color: GREEN_DEEP, label: "Geração mensal" }]} />
      </Card>

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

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-2xl p-5" style={{ borderColor: BORDER }}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-base font-semibold" style={{ color: INK }}>{title}</h2>
        {hint && <span className="text-xs" style={{ color: INK_FAINT }}>{hint}</span>}
      </div>
      {children}
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

function MonthlyChart({ data }: { data: PortalClienteData }) {
  const W = 640, H = 240, padL = 44, padR = 12, padT = 14, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const meses = data.porMes;
  const rawMax = Math.max(100, ...meses.map((m) => m.kwh));
  const { niceMax, step, count } = niceTicks(rawMax, 4);
  const n = meses.length || 1;
  const slot = iw / n;
  const bw = Math.min(34, slot * 0.6);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Geração mensal em kWh">
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
          const h = (m.kwh / niceMax) * ih;
          const x = padL + slot * i + (slot - bw) / 2;
          const y = padT + ih - h;
          const last = i === n - 1;
          return (
            <g key={`${m.ano}-${m.mes}`}>
              <rect x={x} y={y} width={bw} height={Math.max(h, 0)} rx={4} fill={last ? GREEN_DEEP : GREEN} opacity={last ? 1 : 0.9} />
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" fill={last ? INK : INK_FAINT} fontSize={10} fontWeight={last ? 700 : 400}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DailyChart({ data }: { data: PortalClienteData }) {
  const W = 900, H = 200, padL = 40, padR = 10, padT = 12, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const dias = data.refDias;
  const rawMax = Math.max(10, ...dias.map((d) => d.kwh));
  const { niceMax, step, count } = niceTicks(rawMax, 4);
  const n = dias.length || 1;
  const slot = iw / n;
  const bw = slot * 0.66;
  const mediaDim = data.refMediaDia * 0.5;

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Geração diária em kWh">
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
        {dias.map((d, i) => {
          const h = (d.kwh / niceMax) * ih;
          const x = padL + slot * i + (slot - bw) / 2;
          const y = padT + ih - h;
          const dim = d.kwh < mediaDim;
          return (
            <g key={d.dia}>
              <rect x={x} y={y} width={bw} height={Math.max(h, 1.5)} rx={3} fill={GREEN} opacity={dim ? 0.4 : 0.95} />
              {(i === 0 || (i + 1) % 5 === 0) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" fill={INK_FAINT} fontSize={10}>
                  {d.dia}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function IntradayChart({ data }: { data: PortalClienteData }) {
  const W = 900, H = 220, padL = 40, padR = 12, padT = 14, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const pts = data.curvaDia;
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
