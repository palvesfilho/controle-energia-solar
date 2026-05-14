import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Rect,
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

const C = {
  teal: "#2E9B87",
  tealMid: "#3BAE99",
  tealDark: "#1B5E54",
  orange: "#EA6E2C",
  orangeLight: "#F39350",
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
    height: 120,
    borderRadius: 8,
    marginBottom: 14,
    overflow: "hidden",
  },
  heroBg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  heroContent: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    padding: 16,
    color: C.white,
    flexDirection: "column",
    justifyContent: "space-between",
  },
  heroEyebrow: {
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#FFFFFFCC",
  },
  heroTitle: { fontSize: 18, fontWeight: 700 },
  heroSub: { fontSize: 9, color: "#FFFFFFE6" },
  heroFooter: { fontSize: 8, color: "#FFFFFFCC" },

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

/**
 * Mini barras geração x consumo. Layout simples — 12 pares de barras.
 */
function GeneractionConsumptionBars({ data }: { data: RelatorioData }) {
  const meses = data.meses;
  if (meses.length === 0) return null;

  const W = 540;
  const H = 150;
  const padL = 30;
  const padR = 8;
  // Mais espaço no topo pra os labels das barras não cortarem
  const padT = 22;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxKwh = Math.max(
    ...meses.map((m) => Math.max(m.geracaoInversorKwh ?? 0, m.consumoTotalKwh ?? 0)),
    1,
  );
  const groupW = innerW / meses.length;
  const barW = (groupW - 4) / 2;
  const fmt = (v: number) =>
    Math.round(v).toLocaleString("pt-BR");

  return (
    <Svg style={{ width: "100%", height: H }} viewBox={`0 0 ${W} ${H}`}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <SvgLine
          key={i}
          x1={padL}
          y1={padT + innerH * p}
          x2={W - padR}
          y2={padT + innerH * p}
          stroke={C.grayBorder}
          strokeWidth={0.4}
        />
      ))}
      {meses.map((m, i) => {
        const groupX = padL + i * groupW + 2;
        const ger = m.geracaoInversorKwh ?? 0;
        const cons = m.consumoTotalKwh ?? 0;
        const gerH = (ger / maxKwh) * innerH;
        const consH = (cons / maxKwh) * innerH;
        const gerY = padT + innerH - gerH;
        const consY = padT + innerH - consH;
        return (
          <View key={i}>
            <Rect
              x={groupX}
              y={gerY}
              width={barW}
              height={gerH}
              fill={C.teal}
            />
            <Rect
              x={groupX + barW}
              y={consY}
              width={barW}
              height={consH}
              fill={C.orange}
            />
            {/* Valores em kWh em cima de cada barra */}
            {ger > 0 && (
              <Text
                x={groupX + barW / 2 - 8}
                y={gerY - 2}
                style={{ fontSize: 6, fill: C.tealDark, fontWeight: 700 }}
              >
                {fmt(ger)}
              </Text>
            )}
            {cons > 0 && (
              <Text
                x={groupX + barW + barW / 2 - 8}
                y={consY - 2}
                style={{ fontSize: 6, fill: C.orange, fontWeight: 700 }}
              >
                {fmt(cons)}
              </Text>
            )}
            <Text
              x={groupX + barW - 6}
              y={H - 6}
              style={{ fontSize: 6, fill: C.gray }}
            >
              {MES_ABREV[m.mes - 1]}
            </Text>
          </View>
        );
      })}
      {/* Legenda */}
      <Rect x={padL} y={padT - 6} width={6} height={6} fill={C.teal} />
      <Text x={padL + 9} y={padT - 1} style={{ fontSize: 7, fill: C.black }}>
        Geração
      </Text>
      <Rect x={padL + 50} y={padT - 6} width={6} height={6} fill={C.orange} />
      <Text x={padL + 59} y={padT - 1} style={{ fontSize: 7, fill: C.black }}>
        Consumo
      </Text>
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

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Hero */}
        <View style={s.hero}>
          <HeroBackground />
          <View style={s.heroContent}>
            <View>
              <Text style={s.heroEyebrow}>
                Relatório mensal · {labelMes}
              </Text>
              <Text style={s.heroTitle}>{data.uc.nome}</Text>
              <Text style={s.heroSub}>
                {data.proprietario.nome} · UC {data.uc.codigoUc}
                {data.uc.distribuidora ? ` · ${data.uc.distribuidora}` : ""}
              </Text>
            </View>
            <Text style={s.heroFooter}>
              {data.usinasMonitoradas.length} usina(s) ·{" "}
              {data.potenciaTotalKwp.toLocaleString("pt-BR", {
                maximumFractionDigits: 2,
              })}{" "}
              kWp instalados · Emissão {emissao}
            </Text>
          </View>
        </View>

        {/* KPIs do mês de referência (7 cards) */}
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
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Geração</Text>
                <Text style={[s.kpiValue, { color: C.teal, fontSize: 12 }]}>
                  {formatKwh(mes.geracaoInversorKwh)}
                </Text>
              </View>
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
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Consumo Total</Text>
                <Text style={[s.kpiValue, { color: C.orange, fontSize: 12 }]}>
                  {formatKwh(mes.consumoTotalKwh)}
                </Text>
                {mes.consumoRedeKwh != null &&
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
                <Text style={s.kpiLabel}>Economia mensal</Text>
                <Text style={[s.kpiValue, { color: C.teal, fontSize: 12 }]}>
                  {mes.economiaMensalRs != null
                    ? formatBRL(mes.economiaMensalRs)
                    : "—"}
                </Text>
                {mes.economiaInstantaneaRs != null &&
                  mes.economiaInstantaneaRs > 0 && (
                    <Text style={s.kpiSub}>
                      {formatBRL(mes.economiaCompensadaRs ?? 0)} comp +{" "}
                      {formatBRL(mes.economiaInstantaneaRs)} inst
                    </Text>
                  )}
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Fatura concessionária</Text>
                <Text
                  style={[s.kpiValue, { color: C.tealDark, fontSize: 12 }]}
                >
                  {mes.faturadoRs != null ? formatBRL(mes.faturadoRs) : "—"}
                </Text>
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Retorno do mês</Text>
                <Text style={[s.kpiValue, { color: C.orange, fontSize: 12 }]}>
                  {mes.retornoPct != null
                    ? `${mes.retornoPct.toFixed(2)}%`
                    : "—"}
                </Text>
                <Text style={s.kpiSub}>do investimento</Text>
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Créditos acumulados</Text>
                <Text style={[s.kpiValue, { color: C.teal, fontSize: 12 }]}>
                  {formatKwh(mes.saldoCreditosKwh)}
                </Text>
                <Text style={s.kpiSub}>Saldo GD na fatura</Text>
              </View>
            </View>
          </>
        )}

        <Text style={s.sectionTitle}>Acumulado desde a operação</Text>

        {/* KPIs */}
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Investimento total</Text>
            <Text style={[s.kpiValue, { color: C.tealDark }]}>
              {formatBRL(data.investimentoTotal)}
            </Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Economia Total</Text>
            <Text style={[s.kpiValue, { color: C.teal }]}>
              {formatBRL(economiaTotal)}
            </Text>
            <Text style={s.kpiSub}>{data.meses.length} mês(es) com fatura</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Retorno Total</Text>
            <Text style={[s.kpiValue, { color: C.orange }]}>
              {data.retornoTotalPct.toFixed(2)}%
            </Text>
            <Text style={s.kpiSub}>
              Média {formatBRL(data.economiaMediaMensalRs)}/mês
            </Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>
              {data.paybackQuitado ? "Payback" : "Payback previsto"}
            </Text>
            <Text
              style={[
                s.kpiValue,
                { color: data.paybackQuitado ? C.teal : C.orange },
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
        </View>

        {/* Geração x Consumo */}
        <Text style={s.sectionTitle}>Geração × Consumo (kWh)</Text>
        <View style={s.sectionCard}>
          <GeneractionConsumptionBars data={data} />
        </View>

        {/* Usinas vinculadas */}
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

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>
            {data.proprietario.nome} · UC {data.uc.codigoUc}
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
