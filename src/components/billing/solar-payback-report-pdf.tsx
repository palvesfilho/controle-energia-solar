import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Rect,
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line as SvgLine,
  Circle,
} from "@react-pdf/renderer";
import type {
  RelatorioData,
  RelatorioMonthRow,
} from "@/lib/brasil-solar-relatorio";
import { formatCodigoUc } from "@/lib/uc-codigo";

const C = {
  teal: "#2E9B87",
  tealMid: "#3BAE99",
  tealDark: "#1B5E54",
  orange: "#EA6E2C",
  orangeLight: "#F39350",
  orangeDark: "#B4501A",
  orangePale: "#F6C9A6",
  barTrack: "#F4F1EC",
  cream: "#FDE9D7",
  white: "#ffffff",
  black: "#1F1F1F",
  gray: "#6B7280",
  grayLight: "#9CA3AF",
  grayBorder: "#E5E7EB",
  bgSoft: "#F8FAFB",
  red: "#B91C1C",
};

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const MES_LONGO = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatKwh(v: number | null): string {
  return v == null
    ? "—"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " kWh";
}
function formatMesAno(d: { ano: number; mes: number } | null): string {
  if (!d) return "—";
  const m = MES_LONGO[d.mes - 1] ?? String(d.mes).padStart(2, "0");
  return `${m}/${d.ano}`;
}

const s = StyleSheet.create({
  page: {
    fontSize: 9,
    color: C.black,
    fontFamily: "Helvetica",
    backgroundColor: C.white,
    paddingTop: 24,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  // Hero
  hero: {
    position: "relative",
    height: 96,
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
  },
  heroBg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  heroContent: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    color: C.white,
    flexDirection: "row",
  },
  heroLeft: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "column",
    justifyContent: "center",
  },
  heroEyebrow: {
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#FFFFFFCC",
  },
  heroTitle: { fontSize: 16, fontWeight: 700, marginTop: 1 },
  heroSub: { fontSize: 10, color: "#FFFFFFF2", marginTop: 1 },
  heroMeta: { fontSize: 8, color: "#FFFFFFB3", marginTop: 4 },
  heroBadge: {
    width: 132,
    backgroundColor: "#FFFFFF24",
    borderLeftWidth: 1,
    borderLeftColor: "#FFFFFF40",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  heroBadgeLabel: {
    fontSize: 8,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#FFFFFFD9",
    marginBottom: 8,
    textAlign: "center",
  },
  heroBadgeValue: { fontSize: 18, fontWeight: 700, color: C.white },

  // KPIs (4-up)
  kpiRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 6,
    padding: 8,
  },
  kpiLabel: {
    fontSize: 7,
    color: C.gray,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiValue: { fontSize: 14, fontWeight: 700 },
  kpiSub: { fontSize: 7, color: C.gray, marginTop: 2 },

  // Section
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: C.tealDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },

  // Table
  tableHead: {
    flexDirection: "row",
    backgroundColor: C.bgSoft,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableHeadCell: {
    fontSize: 7,
    color: C.gray,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.grayBorder,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableCell: { fontSize: 8 },
  tableCellMuted: { fontSize: 8, color: C.gray },
  tableCellBold: { fontSize: 8, fontWeight: 700 },

  // Misc
  textMuted: { color: C.gray, fontSize: 8 },
  small: { fontSize: 8 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.gray,
  },
});

function HeroBackground() {
  return (
    <Svg style={s.heroBg} viewBox="0 0 100 30" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="bgGrad" x1="0" y1="0" x2="100" y2="30" gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor={C.tealDark} />
          <Stop offset={0.55} stopColor={C.teal} />
          <Stop offset={1} stopColor={C.orange} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="30" fill="url(#bgGrad)" />
      <Circle cx="92" cy="-2" r="14" fill={C.white} fillOpacity={0.10} />
      <Circle cx="-3" cy="32" r="18" fill={C.white} fillOpacity={0.06} />
    </Svg>
  );
}

/** Arredonda o topo (cantos superiores) de uma barra ancorada na base. */
function barTopPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
}

/** Arredonda a base (cantos inferiores) de uma barra que desce a partir do zero. */
function barBottomPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h - rr} Q ${x + w} ${y + h} ${x + w - rr} ${y + h} L ${x + rr} ${y + h} Q ${x} ${y + h} ${x} ${y + h - rr} Z`;
}

/** Arredonda o próximo múltiplo de `step` acima de `v` (escala "redonda"). */
function niceCeil(v: number, step: number) {
  return Math.max(step, Math.ceil(v / step) * step);
}

/**
 * Opção 1 — Barras agrupadas geração × consumo.
 * Eixo Y em kWh com grade discreta; cantos superiores arredondados; sem
 * rótulos por barra (os valores exatos ficam na tabela "Histórico por mês").
 */
function GeneractionConsumptionBars({ data }: { data: RelatorioData }) {
  // Gráfico = tendência dos últimos 12 meses (a tabela mostra o histórico todo).
  const meses = data.meses.slice(-12);
  if (meses.length === 0) return null;

  const W = 540;
  const H = 148;
  const padL = 36;
  const padR = 10;
  const padT = 22;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const rawMax = Math.max(
    ...meses.map((m) => Math.max(m.geracaoInversorKwh ?? 0, m.consumoTotalKwh ?? 0)),
    1,
  );
  const maxKwh = niceCeil(rawMax, 200);
  const groupW = innerW / meses.length;
  const pad = groupW * 0.16;
  const gap = 2;
  const barW = (groupW - pad * 2 - gap) / 2;
  const fmtTick = (v: number) => Math.round(v).toLocaleString("pt-BR");

  return (
    <Svg style={{ width: "100%", height: H }} viewBox={`0 0 ${W} ${H}`}>
      {/* Grade + escala Y */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
        const y = padT + innerH * (1 - p);
        return (
          <React.Fragment key={i}>
            <SvgLine
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke={C.grayBorder}
              strokeWidth={0.5}
            />
            <Text
              x={padL - 5}
              y={y + 2.5}
              style={{ fontSize: 7, fill: C.gray, fontWeight: 700, textAnchor: "end" }}
            >
              {fmtTick(maxKwh * p)}
            </Text>
          </React.Fragment>
        );
      })}
      {meses.map((m, i) => {
        const groupX = padL + i * groupW + pad;
        const ger = m.geracaoInversorKwh ?? 0;
        const cons = m.consumoTotalKwh ?? 0;
        const gerH = (ger / maxKwh) * innerH;
        const consH = (cons / maxKwh) * innerH;
        const gerY = padT + innerH - gerH;
        const consY = padT + innerH - consH;
        return (
          <React.Fragment key={i}>
            {ger > 0 && (
              <Path d={barTopPath(groupX, gerY, barW, gerH, 2)} fill={C.teal} />
            )}
            {cons > 0 && (
              <Path
                d={barTopPath(groupX + barW + gap, consY, barW, consH, 2)}
                fill={C.orange}
              />
            )}
            <Text
              x={groupX + (barW * 2 + gap) / 2}
              y={H - 7}
              style={{ fontSize: 7.5, fill: C.gray, fontWeight: 700, textAnchor: "middle" }}
            >
              {MES_ABREV[m.mes - 1]}
            </Text>
          </React.Fragment>
        );
      })}
      {/* Legenda */}
      <Rect x={padL} y={padT - 14} width={7} height={7} rx={1.5} fill={C.teal} />
      <Text x={padL + 10} y={padT - 8.5} style={{ fontSize: 7, fill: C.black }}>
        Geração
      </Text>
      <Rect x={padL + 52} y={padT - 14} width={7} height={7} rx={1.5} fill={C.orange} />
      <Text x={padL + 62} y={padT - 8.5} style={{ fontSize: 7, fill: C.black }}>
        Consumo total
      </Text>
    </Svg>
  );
}

/**
 * Opção 3 — Saldo do mês (geração − consumo), barras divergentes.
 * Para cima (teal) quando sobra energia → gera crédito; para baixo (laranja)
 * quando falta → usa a rede. Escala Y simétrica em torno do zero.
 */
function SaldoMensalBars({ data }: { data: RelatorioData }) {
  // Gráfico = tendência dos últimos 12 meses (a tabela mostra o histórico todo).
  const meses = data.meses.slice(-12);
  if (meses.length === 0) return null;

  const nets = meses.map(
    (m) => (m.geracaoInversorKwh ?? 0) - (m.consumoTotalKwh ?? 0),
  );

  const W = 540;
  const H = 150;
  const padL = 36;
  const padR = 12;
  const padT = 18;
  const padB = 18;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const bound = niceCeil(Math.max(...nets.map((n) => Math.abs(n)), 1), 100);
  const zeroY = padT + innerH / 2;
  const yFor = (v: number) => zeroY - (v / bound) * (innerH / 2);
  const groupW = innerW / meses.length;
  const barW = groupW * 0.52;
  const fmtNet = (v: number) =>
    (v > 0 ? "+" : v < 0 ? "-" : "") +
    Math.abs(Math.round(v)).toLocaleString("pt-BR");

  return (
    <Svg style={{ width: "100%", height: H }} viewBox={`0 0 ${W} ${H}`}>
      {/* Grade simétrica */}
      {[1, 0.5, 0, -0.5, -1].map((p, i) => {
        const y = zeroY - p * (innerH / 2);
        const zero = p === 0;
        return (
          <React.Fragment key={i}>
            <SvgLine
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke={zero ? C.grayLight : C.grayBorder}
              strokeWidth={zero ? 1 : 0.5}
            />
            <Text
              x={padL - 5}
              y={y + 2.5}
              style={{ fontSize: 7, fill: C.gray, fontWeight: 700, textAnchor: "end" }}
            >
              {fmtNet(bound * p)}
            </Text>
          </React.Fragment>
        );
      })}
      {/* Sentido do eixo Y: topo = gera crédito, base = usa a rede */}
      <Text
        x={padL + 3}
        y={padT - 7}
        style={{ fontSize: 7, fill: C.tealDark, fontWeight: 700, textAnchor: "start" }}
      >
        gera crédito
      </Text>
      <Text
        x={padL + 3}
        y={H - 4}
        style={{ fontSize: 7, fill: C.orange, fontWeight: 700, textAnchor: "start" }}
      >
        usa a rede
      </Text>
      {meses.map((m, i) => {
        const net = nets[i];
        const x = padL + i * groupW + (groupW - barW) / 2;
        const y = yFor(net);
        const h = Math.abs(y - zeroY);
        const up = net >= 0;
        return (
          <React.Fragment key={i}>
            <Path
              d={
                up
                  ? barTopPath(x, y, barW, h, 2)
                  : barBottomPath(x, zeroY, barW, h, 2)
              }
              fill={up ? C.teal : C.orange}
            />
            {Math.abs(net) > 0 && (
              <Text
                x={x + barW / 2}
                y={up ? y - 3 : y + 8}
                style={{
                  fontSize: 6.5,
                  fill: up ? C.tealDark : C.orange,
                  fontWeight: 700,
                  textAnchor: "middle",
                }}
              >
                {fmtNet(net)}
              </Text>
            )}
            <Text
              x={x + barW / 2}
              y={up ? zeroY + 10 : zeroY - 5}
              style={{ fontSize: 7.5, fill: C.gray, fontWeight: 700, textAnchor: "middle" }}
            >
              {MES_ABREV[m.mes - 1]}
            </Text>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export interface SolarPaybackReportPDFProps {
  data: RelatorioData;
  emissao: string;
  /** Mês de referência destacado (KPIs do mês). Default = último disponível. */
  mesRef?: RelatorioMonthRow | null;
}

export function SolarPaybackReportPDF({
  data,
  emissao,
  mesRef,
}: SolarPaybackReportPDFProps) {
  const mes =
    mesRef ?? (data.meses.length > 0 ? data.meses[data.meses.length - 1] : null);
  const labelMes = mes ? `${MES_LONGO[mes.mes - 1]}/${mes.ano}` : "—";
  const ultimoSaldo =
    data.meses.length > 0
      ? data.meses[data.meses.length - 1].saldoPaybackRs
      : data.investimentoTotal;
  const economiaTotal =
    data.meses.length > 0
      ? data.meses[data.meses.length - 1].economiaAcumuladaRs
      : 0;
  // Versão "lite": sem usina cadastrada não dá pra mostrar geração, desempenho
  // ou payback. Mantém o mesmo layout, oculta seções dependentes e avisa.
  const semMonitoramento = data.usinasMonitoradas.length === 0;

  // Em muitos cadastros o nome da UC é o próprio nome do proprietário — nesse
  // caso não repete a informação no cabeçalho.
  const nomeUcDuplicado =
    (data.uc.nome ?? "").trim().toLowerCase() ===
    (data.proprietario.nome ?? "").trim().toLowerCase();

  // Escala das barras "sem × com solar" da tabela (maior conta sem solar = 100%).
  const maxContaSemSolar = Math.max(
    ...data.meses.map((m) => m.contaSemSolarRs ?? 0),
    1,
  );
  // Totais do período (rodapé da tabela).
  const totais = data.meses.reduce(
    (a, m) => ({
      consumo: a.consumo + (m.consumoTotalKwh ?? 0),
      semSolar: a.semSolar + (m.contaSemSolarRs ?? 0),
      comSolar: a.comSolar + (m.faturadoRs ?? 0),
      economia: a.economia + (m.economiaMensalRs ?? 0),
    }),
    { consumo: 0, semSolar: 0, comSolar: 0, economia: 0 },
  );
  // Créditos é SALDO acumulado (não soma): no rodapé mostra o saldo final.
  const saldoCreditosFinal =
    data.meses.length > 0
      ? data.meses[data.meses.length - 1].saldoCreditosKwh
      : null;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Hero */}
        <View style={s.hero}>
          <HeroBackground />
          <View style={s.heroContent}>
            <View style={s.heroLeft}>
              <Text style={s.heroEyebrow}>
                Relatório mensal · {labelMes}
              </Text>
              <Text style={s.heroTitle}>{data.proprietario.nome}</Text>
              {!nomeUcDuplicado && (
                <Text style={s.heroSub}>{data.uc.nome}</Text>
              )}
              <Text style={s.heroMeta}>
                UC {formatCodigoUc(data.uc.codigoUc)}
                {data.uc.distribuidora ? ` · ${data.uc.distribuidora}` : ""}
                {!semMonitoramento
                  ? ` · ${data.usinasMonitoradas.length} usina(s) · ${data.potenciaTotalKwp.toLocaleString(
                      "pt-BR",
                      { maximumFractionDigits: 2 },
                    )} kWp`
                  : ""}
                {` · Emissão ${emissao}`}
              </Text>
            </View>
            {mes && mes.economiaMensalRs != null && (
              <View style={s.heroBadge}>
                <Text style={s.heroBadgeLabel}>Economia mensal</Text>
                <Text style={s.heroBadgeValue}>
                  {formatBRL(mes.economiaMensalRs)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {semMonitoramento && (
          <View
            style={{
              borderWidth: 1,
              borderColor: C.orange,
              backgroundColor: "#FFF6EE",
              borderRadius: 6,
              padding: 8,
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 8, color: C.orange, fontWeight: 700 }}>
              Monitoramento da usina ainda não configurado
            </Text>
            <Text style={{ fontSize: 8, color: C.black, marginTop: 2 }}>
              Os campos de geração, desempenho, autoconsumo instantâneo e
              retorno do investimento estão indisponíveis. Os valores de
              economia exibidos consideram apenas os créditos compensados na
              fatura — a economia real tende a ser maior.
            </Text>
          </View>
        )}

        {/* KPIs do mês de referência (8 cards, 4×2):
            Geração · Consumo · Créditos · Desempenho /
            Sem solar · Com solar · Economia no mês · Retorno do mês */}
        {mes && (
          <>
            <Text style={s.sectionTitle}>Resultado de {labelMes}</Text>
            {mes.anomalia && (
              <Text
                style={{
                  fontSize: 8,
                  color: C.red,
                  marginBottom: 6,
                  fontStyle: "italic",
                }}
              >
                ⚠ {mes.anomalia}
              </Text>
            )}
            <View style={[s.kpiRow, { flexWrap: "wrap" }]}>
              {/* Linha 1: Geração · Consumo · Créditos · Desempenho */}
              {!semMonitoramento && (
                <View
                  style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
                >
                  <Text style={s.kpiLabel}>Geração</Text>
                  <Text style={[s.kpiValue, { color: C.teal, fontSize: 12 }]}>
                    {formatKwh(mes.geracaoInversorKwh)}
                  </Text>
                </View>
              )}
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>
                  {semMonitoramento ? "Consumo da rede" : "Consumo"}
                </Text>
                <Text style={[s.kpiValue, { color: C.orange, fontSize: 12 }]}>
                  {formatKwh(
                    semMonitoramento ? mes.consumoRedeKwh : mes.consumoTotalKwh,
                  )}
                </Text>
                {!semMonitoramento &&
                  mes.consumoRedeKwh != null &&
                  mes.consumoInstantaneoKwh != null && (
                    <Text style={s.kpiSub}>
                      {Math.round(mes.consumoRedeKwh)} rede +{" "}
                      {Math.round(mes.consumoInstantaneoKwh)} inst.
                    </Text>
                  )}
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Créditos</Text>
                <Text style={[s.kpiValue, { color: C.tealDark, fontSize: 12 }]}>
                  {formatKwh(mes.saldoCreditosKwh)}
                </Text>
                <Text style={s.kpiSub}>energia acumulada (saldo GD)</Text>
              </View>
              {!semMonitoramento && (
                <View
                  style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
                >
                  <Text style={s.kpiLabel}>Desempenho</Text>
                  <Text
                    style={[s.kpiValue, { color: C.tealDark, fontSize: 12 }]}
                  >
                    {mes.desempenhoPct != null
                      ? `${mes.desempenhoPct.toFixed(0)}%`
                      : "—"}
                  </Text>
                  {data.geracaoEsperadaMensalKwh > 0 && (
                    <Text style={s.kpiSub}>
                      Esperado: {formatKwh(data.geracaoEsperadaMensalKwh)}
                    </Text>
                  )}
                </View>
              )}
              {/* Linha 2: Sem solar · Com solar · Economia no mês · Retorno do mês */}
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Sem solar</Text>
                <Text style={[s.kpiValue, { color: C.orange, fontSize: 12 }]}>
                  {mes.contaSemSolarRs != null
                    ? formatBRL(mes.contaSemSolarRs)
                    : "—"}
                </Text>
                <Text style={s.kpiSub}>quanto pagaria sem a usina</Text>
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Com solar</Text>
                <Text
                  style={[s.kpiValue, { color: C.tealDark, fontSize: 12 }]}
                >
                  {mes.faturadoRs != null ? formatBRL(mes.faturadoRs) : "—"}
                </Text>
                <Text style={s.kpiSub}>fatura da concessionária</Text>
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Economia no mês</Text>
                <Text style={[s.kpiValue, { color: C.teal, fontSize: 12 }]}>
                  {mes.economiaMensalRs != null
                    ? formatBRL(mes.economiaMensalRs)
                    : "—"}
                </Text>
                {!semMonitoramento &&
                  mes.economiaInstantaneaRs != null &&
                  mes.economiaInstantaneaRs > 0 && (
                    <Text style={s.kpiSub}>
                      {formatBRL(mes.economiaCompensadaRs ?? 0)} comp +{" "}
                      {formatBRL(mes.economiaInstantaneaRs)} inst
                    </Text>
                  )}
                {semMonitoramento && (
                  <Text style={s.kpiSub}>apenas créditos compensados</Text>
                )}
              </View>
              {!semMonitoramento && (
                <View
                  style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
                >
                  <Text style={s.kpiLabel}>Retorno do mês</Text>
                  <Text
                    style={[s.kpiValue, { color: C.orange, fontSize: 12 }]}
                  >
                    {mes.retornoPct != null
                      ? `${mes.retornoPct.toFixed(2)}%`
                      : "—"}
                  </Text>
                  <Text style={s.kpiSub}>do investimento</Text>
                </View>
              )}
            </View>
          </>
        )}

        <Text style={s.sectionTitle}>
          {semMonitoramento
            ? "Economia acumulada (créditos compensados)"
            : "Acumulado desde a operação"}
        </Text>

        {/* KPIs */}
        <View style={s.kpiRow}>
          {!semMonitoramento && (
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Investimento total</Text>
              <Text style={[s.kpiValue, { color: C.tealDark }]}>
                {formatBRL(data.investimentoTotal)}
              </Text>
            </View>
          )}
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Economia Total</Text>
            <Text style={[s.kpiValue, { color: C.teal }]}>
              {formatBRL(economiaTotal)}
            </Text>
            <Text style={s.kpiSub}>
              {data.mesesComFatura ?? data.meses.length} mês(es) desde a operação
            </Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Economia média</Text>
            <Text style={[s.kpiValue, { color: C.orange }]}>
              {formatBRL(data.economiaMediaMensalRs)}
            </Text>
            <Text style={s.kpiSub}>por mês</Text>
          </View>
          {!semMonitoramento && (
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Retorno Total</Text>
              <Text style={[s.kpiValue, { color: C.orange }]}>
                {data.retornoTotalPct.toFixed(2)}%
              </Text>
            </View>
          )}
          {!semMonitoramento && (
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>
                {data.paybackQuitado ? "Payback" : "Payback previsto"}
              </Text>
              <Text
                style={[
                  s.kpiValue,
                  // 11pt cabe o mês mais longo ("Fevereiro/2028") sem estourar.
                  { color: data.paybackQuitado ? C.teal : C.orange, fontSize: 11 },
                ]}
              >
                {data.paybackQuitado
                  ? "QUITADO"
                  : formatMesAno(data.paybackQuitacaoPrevista)}
              </Text>
              {!data.paybackQuitado && (
                <Text style={s.kpiSub}>
                  Saldo: {formatBRL(Math.max(0, ultimoSaldo))}
                </Text>
              )}
            </View>
          )}
        </View>

        {!semMonitoramento && (
          <>
            {/* Geração x Consumo */}
            <Text style={s.sectionTitle}>Geração × Consumo (kWh)</Text>
            <View style={s.sectionCard}>
              <GeneractionConsumptionBars data={data} />
            </View>

            {/* Saldo do mês (geração − consumo) */}
            <Text style={s.sectionTitle}>Saldo do mês (geração - consumo)</Text>
            <View style={s.sectionCard}>
              <SaldoMensalBars data={data} />
              <Text style={{ fontSize: 7, color: C.gray, marginTop: 4 }}>
                Barras para cima somam créditos de energia; para baixo indicam
                consumo coberto pela rede.
              </Text>
            </View>

            {/* Usinas vinculadas — mantém título junto do card ao paginar */}
            <View wrap={false}>
            <Text style={s.sectionTitle}>Usinas monitoradas</Text>
            <View style={s.sectionCard}>
              {data.usinasMonitoradas.map((u) => (
                <View
                  key={u.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 3,
                    borderBottomWidth: 0.5,
                    borderBottomColor: C.grayBorder,
                  }}
                >
                  <Text style={{ fontSize: 8, fontWeight: 700 }}>
                    {u.nome}
                    {u.plataforma ? (
                      <Text style={s.textMuted}> · {u.plataforma}</Text>
                    ) : null}
                  </Text>
                  <Text style={s.textMuted}>
                    {u.potenciaInstalada != null
                      ? `${u.potenciaInstalada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kWp`
                      : ""}
                    {u.investimento != null && u.investimento > 0
                      ? ` · ${formatBRL(u.investimento)}`
                      : ""}
                  </Text>
                </View>
              ))}
            </View>
            </View>
          </>
        )}

        {/* Tabela mês a mês — sempre, mas mostra colunas diferentes no modo lite */}
        {data.meses.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Histórico por mês</Text>
            <View style={s.sectionCard}>
              {/* Legenda das barras "sem × com solar" */}
              <View style={{ flexDirection: "row", gap: 14, marginBottom: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.orangePale }} />
                  <Text style={{ fontSize: 7, color: C.gray }}>Sem solar (conta cheia)</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.orange }} />
                  <Text style={{ fontSize: 7, color: C.gray }}>Com solar (o que paga)</Text>
                </View>
              </View>
              <View style={[s.tableHead, { borderBottomColor: C.orange, borderBottomWidth: 1.5 }]}>
                <Text style={[s.tableHeadCell, { flex: 1.1 }]}>Mês</Text>
                <Text style={[s.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>
                  Consumo total
                </Text>
                <Text style={[s.tableHeadCell, { flex: 1.2, textAlign: "right" }]}>
                  Créditos
                </Text>
                <Text style={[s.tableHeadCell, { flex: 2.6, paddingLeft: 6 }]}>
                  Sem / com solar
                </Text>
                <Text style={[s.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>
                  Economia
                </Text>
              </View>
              {/* Mais recente primeiro (última conta emitida → meses anteriores).
                  Cópia com reverse pra não mutar data.meses, usado no gráfico. */}
              {[...data.meses].reverse().map((m) => {
                const BARW = 96;
                const sem = m.contaSemSolarRs;
                const com = m.faturadoRs;
                const semW =
                  sem != null
                    ? Math.min(BARW, (sem / maxContaSemSolar) * BARW)
                    : 0;
                const comW =
                  com != null
                    ? Math.min(BARW, (com / maxContaSemSolar) * BARW)
                    : 0;
                return (
                  <View
                    key={`${m.ano}-${m.mes}`}
                    style={[s.tableRow, { borderBottomColor: C.orange, alignItems: "center" }]}
                  >
                    <Text style={[s.tableCell, { flex: 1.1 }]}>
                      {MES_ABREV[m.mes - 1]}/{m.ano}
                    </Text>
                    <Text style={[s.tableCell, { flex: 1.4, textAlign: "right" }]}>
                      {formatKwh(m.consumoTotalKwh)}
                    </Text>
                    <Text style={[s.tableCell, { flex: 1.2, textAlign: "right" }]}>
                      {formatKwh(m.saldoCreditosKwh)}
                    </Text>
                    <View style={{ flex: 2.6, flexDirection: "column", gap: 3, paddingLeft: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <View style={{ width: BARW, height: 7, backgroundColor: C.barTrack, borderRadius: 2 }}>
                          <View style={{ width: semW, height: 7, backgroundColor: C.orangePale, borderRadius: 2 }} />
                        </View>
                        <Text style={{ fontSize: 7, color: C.gray }}>
                          {sem != null ? formatBRL(sem) : "—"}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <View style={{ width: BARW, height: 7, backgroundColor: C.barTrack, borderRadius: 2 }}>
                          <View style={{ width: comW, height: 7, backgroundColor: C.orange, borderRadius: 2 }} />
                        </View>
                        <Text style={{ fontSize: 7, color: C.orangeDark, fontWeight: 700 }}>
                          {com != null ? formatBRL(com) : "—"}
                        </Text>
                      </View>
                    </View>
                    <Text style={[s.tableCellBold, { flex: 1.4, textAlign: "right", color: C.teal }]}>
                      {m.economiaMensalRs != null
                        ? formatBRL(m.economiaMensalRs)
                        : "—"}
                    </Text>
                  </View>
                );
              })}
              {/* Total do período */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 4,
                  paddingTop: 6,
                  borderTopWidth: 1.5,
                  borderTopColor: C.orange,
                }}
              >
                <Text style={[s.tableCellBold, { flex: 1.1 }]}>
                  {data.meses.length} meses
                </Text>
                <Text style={[s.tableCellBold, { flex: 1.4, textAlign: "right" }]}>
                  {formatKwh(totais.consumo)}
                </Text>
                <Text style={[s.tableCellBold, { flex: 1.2, textAlign: "right" }]}>
                  {formatKwh(saldoCreditosFinal)}
                </Text>
                <View style={{ flex: 2.6, flexDirection: "row", gap: 8, paddingLeft: 6 }}>
                  <Text style={{ fontSize: 7.5, color: C.gray }}>
                    sem {formatBRL(totais.semSolar)}
                  </Text>
                  <Text style={{ fontSize: 7.5, color: C.orangeDark, fontWeight: 700 }}>
                    com {formatBRL(totais.comSolar)}
                  </Text>
                </View>
                <Text style={[s.tableCellBold, { flex: 1.4, textAlign: "right", color: C.teal }]}>
                  {formatBRL(totais.economia)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>
            {data.proprietario.nome} · UC {formatCodigoUc(data.uc.codigoUc)}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
