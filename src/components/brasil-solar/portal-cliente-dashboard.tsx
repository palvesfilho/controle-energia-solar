"use client";

import { Zap, TrendingUp, Leaf, TreePine } from "lucide-react";
import type { PortalClienteData } from "@/lib/portal-cliente-data";

const TEAL = "#2E9B87";
const TEAL_DARK = "#1B5E54";
const ORANGE = "#EA6E2C";
const ORANGE_DEEP = "#C2551C";
const INK = "#1F1F1F";
const INK_SOFT = "#59604F";
const INK_FAINT = "#8A938D";
const BORDER = "#E1EAE7";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const kwh = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

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
          foot="tarifa ref. R$ 0,95/kWh"
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

      {/* Gráfico mês a mês */}
      <Card title="Geração mês a mês" hint="kWh · últimos meses">
        <MonthlyChart data={data} />
        <Legend items={[{ color: ORANGE, label: "Geração mensal" }]} />
      </Card>

      {/* Gráfico diário do mês de referência */}
      {data.refDias.length > 0 && (
        <Card title="Geração diária" hint={`kWh por dia · ${data.refLabel}`}>
          <DailyChart data={data} />
        </Card>
      )}

      {/* Impacto ambiental */}
      <Card title="Impacto ambiental" hint="12 meses">
        <div className="grid sm:grid-cols-2 gap-4 pt-1">
          <Eco
            bg="#E1F3E7"
            icon={<Leaf className="h-5 w-5" style={{ color: "#1E9B57" }} />}
            value={`${kwh(data.co2EvitadoKg)} kg`}
            label="de CO₂ que deixaram de ser emitidos"
          />
          <Eco
            bg="#E1F1EC"
            icon={<TreePine className="h-5 w-5" style={{ color: TEAL }} />}
            value={`≈ ${data.arvoresEquivalentes} árvores`}
            label="equivalente plantado por ano"
          />
        </div>
        <p className="text-xs mt-3" style={{ color: INK_FAINT }}>
          Estimativas com base na geração medida e no fator médio de emissão do
          sistema elétrico brasileiro.
        </p>
      </Card>
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

function Eco({ bg, icon, value, label }: { bg: string; icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: bg }}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold tabular-nums leading-none" style={{ color: INK }}>{value}</div>
        <div className="text-xs mt-1" style={{ color: INK_SOFT }}>{label}</div>
      </div>
    </div>
  );
}

function MonthlyChart({ data }: { data: PortalClienteData }) {
  const W = 640, H = 240, padL = 44, padR = 12, padT = 14, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const meses = data.porMes;
  const max = Math.max(100, ...meses.map((m) => m.kwh)) * 1.1;
  const ticks = 4;
  const n = meses.length || 1;
  const slot = iw / n;
  const bw = Math.min(34, slot * 0.6);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Geração mensal em kWh">
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const val = (max / ticks) * i;
          const y = padT + ih - (val / max) * ih;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={BORDER} strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fill={INK_FAINT} fontSize={11}>
                {Math.round(val)}
              </text>
            </g>
          );
        })}
        {meses.map((m, i) => {
          const h = (m.kwh / max) * ih;
          const x = padL + slot * i + (slot - bw) / 2;
          const y = padT + ih - h;
          const last = i === n - 1;
          return (
            <g key={`${m.ano}-${m.mes}`}>
              <rect x={x} y={y} width={bw} height={Math.max(h, 0)} rx={4} fill={last ? ORANGE_DEEP : ORANGE} opacity={last ? 1 : 0.9} />
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
  const W = 900, H = 200, padL = 34, padR = 10, padT = 12, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const dias = data.refDias;
  const max = Math.max(10, ...dias.map((d) => d.kwh)) * 1.1;
  const n = dias.length || 1;
  const slot = iw / n;
  const bw = slot * 0.66;
  const mediaDim = data.refMediaDia * 0.5;

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Geração diária em kWh">
        {[0, 0.5, 1].map((f) => {
          const y = padT + ih - f * ih;
          return <line key={f} x1={padL} y1={y} x2={W - padR} y2={y} stroke={BORDER} strokeWidth={1} />;
        })}
        {dias.map((d, i) => {
          const h = (d.kwh / max) * ih;
          const x = padL + slot * i + (slot - bw) / 2;
          const y = padT + ih - h;
          const dim = d.kwh < mediaDim;
          return (
            <g key={d.dia}>
              <rect x={x} y={y} width={bw} height={Math.max(h, 1.5)} rx={3} fill={ORANGE} opacity={dim ? 0.4 : 0.95} />
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
