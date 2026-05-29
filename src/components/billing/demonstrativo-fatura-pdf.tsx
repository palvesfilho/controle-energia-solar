import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Rect,
  Text as SvgText,
  Line,
} from "@react-pdf/renderer";
import type {
  DemonstrativoFaturaData,
  DemonstrativoFaturaBoleto,
} from "@/lib/demonstrativo-fatura";

// Paleta do handoff Brasil Solar
const C = {
  teal800: "#1B5E54",
  teal500: "#3BAE99",
  teal100: "#D7ECE8",
  teal50: "#ECF6F3",
  peach: "#FCE5D5",
  peachInk: "#7A3A14",
  peachLabel: "#A85427",
  orange: "#EA6E2C",
  orange2: "#C95A20",
  boletoRgeBg: "#FCECDF",
  boletoRgeBorder: "#F3D3BB",
  alertBg: "#FEF6D7",
  alertBorder: "#F0D97A",
  alertInk: "#6B4F0B",
  alertInkStrong: "#5A3F00",
  ink: "#111827",
  ink2: "#374151",
  muted: "#6B7280",
  muted2: "#9CA3AF",
  line: "#E5E7EB",
  line2: "#D1D5DB",
  white: "#FFFFFF",
  paper: "#FFFFFF",
};

// A4 retrato = 595 × 842 pontos no @react-pdf
const PAGE_W = 595;
const PAGE_H = 842;
const PAGE_PAD_H = 34;
const PAGE_PAD_T = 24;
const PAGE_PAD_B = 22;

const fmtBRL = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const fmtKwh = (v: number): string =>
  `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh`;

const fmtTarifa = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 });

const s = StyleSheet.create({
  page: {
    paddingTop: PAGE_PAD_T,
    paddingHorizontal: PAGE_PAD_H,
    paddingBottom: PAGE_PAD_B,
    fontSize: 8,
    color: C.ink,
    fontFamily: "Helvetica",
    backgroundColor: C.white,
    flexDirection: "column",
  },

  // Barra superior degradê (simulada com retângulo teal)
  topStripe: {
    height: 8,
    marginLeft: -PAGE_PAD_H,
    marginRight: -PAGE_PAD_H,
    marginTop: -PAGE_PAD_T,
    marginBottom: 10,
    backgroundColor: C.teal800,
  },

  // Topbar
  topbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    marginBottom: 8,
  },
  clienteNome: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink, textTransform: "uppercase" },
  clienteSub: { fontSize: 7.5, color: C.muted, marginTop: 1 },
  brandWrap: { alignItems: "flex-end" },
  brandNome: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.teal800 },
  brandSub: { fontSize: 6.5, color: C.muted, marginTop: 1 },

  // Hero
  hero: {
    backgroundColor: C.teal800,
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroLeft: { flexDirection: "column" },
  heroLbl: { color: "rgba(255,255,255,0.78)", fontSize: 7, letterSpacing: 1, fontFamily: "Helvetica-Bold" },
  heroAmount: { color: C.white, fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 3 },
  heroRight: { flexDirection: "row", gap: 18 },
  heroRightCol: { alignItems: "flex-end" },
  heroRightVal: { color: C.white, fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 1 },

  // Strip band (UC, mês, bandeira, desconto)
  stripband: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 5,
    padding: 8,
    marginBottom: 10,
  },
  stripcell: { flex: 1, paddingHorizontal: 8 },
  stripcellBorder: { borderLeftWidth: 1, borderLeftColor: C.line2 },
  striplbl: { fontSize: 6.5, color: C.muted, fontFamily: "Helvetica-Bold", marginBottom: 2, letterSpacing: 0.8 },
  stripval: { fontSize: 8.5, color: C.ink, fontFamily: "Helvetica-Bold" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.teal100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  pillDot: { width: 4, height: 4, borderRadius: 2, marginRight: 4 },
  pillText: { fontSize: 7.5, color: C.teal800, fontFamily: "Helvetica-Bold" },

  // Section title
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
    marginBottom: 5,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },

  // Cards 4
  cards4: { flexDirection: "row", gap: 6, marginBottom: 6 },
  card: {
    flex: 1,
    borderRadius: 6,
    padding: 8,
    minHeight: 55,
    justifyContent: "space-between",
  },
  cardLbl: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  cardVal: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 3 },
  cardSub: { fontSize: 6.5, marginTop: 2, opacity: 0.85 },

  // Split (energia + chart)
  split: { flexDirection: "row", gap: 10, marginTop: 6, marginBottom: 8 },
  splitCol: { flex: 1, flexDirection: "column" },
  splitColChart: { flex: 1.15 },

  // Stat (linhas de energia)
  statsWrap: { flexDirection: "column", gap: 5 },
  stat: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 5,
    padding: 7,
    flexDirection: "column",
  },
  statLbl: { fontSize: 6.5, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, marginBottom: 3 },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  statVal: { fontSize: 11, color: C.ink, fontFamily: "Helvetica-Bold" },
  statValAccent: { color: C.teal800 },
  statSub: { fontSize: 6.5, color: C.muted },

  // Chart card
  chartCard: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 6,
    padding: 8,
    flex: 1,
  },
  chartHd: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  chartTtl: { fontSize: 8, color: C.ink, fontFamily: "Helvetica-Bold" },
  chartLegend: { flexDirection: "row", alignItems: "center" },
  chartLegendSwatch: { width: 7, height: 7, borderRadius: 1, backgroundColor: C.orange, marginRight: 4 },
  chartLegendTxt: { fontSize: 7, color: C.ink2 },

  // Boletos
  boletoWrap: { flexDirection: "column", gap: 6 },
  boletoBase: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    flexDirection: "column",
  },
  boletoAssoc: { borderColor: C.teal500, backgroundColor: C.teal50 },
  boletoRge: { borderColor: C.orange, backgroundColor: C.boletoRgeBg },
  boletoRow1: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  boletoWho: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  boletoWhoAssoc: { color: C.teal800 },
  boletoWhoRge: { color: C.orange2 },
  boletoAmount: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  boletoAmountAssoc: { color: C.teal800 },
  boletoAmountRge: { color: C.orange2 },
  boletoMeta: { fontSize: 7, color: C.ink2, marginBottom: 4 },
  boletoMetaStrong: { fontFamily: "Helvetica-Bold", color: C.ink },
  barcodeArea: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 3,
    padding: 4,
  },
  barcodeAreaRge: { borderColor: C.boletoRgeBorder },
  barcodePng: { height: 28, width: "100%" },
  barcodeLine: {
    fontSize: 7,
    color: C.ink2,
    textAlign: "center",
    marginTop: 3,
  },
  barcodePlaceholder: {
    fontSize: 7,
    color: C.muted,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },

  // Alerta
  alert: {
    marginTop: 6,
    padding: 6,
    backgroundColor: C.alertBg,
    borderWidth: 1,
    borderColor: C.alertBorder,
    borderLeftWidth: 3,
    borderLeftColor: "#D4A52D",
    borderRadius: 4,
    fontSize: 7,
    color: C.alertInk,
  },
  alertStrong: { fontFamily: "Helvetica-Bold", color: C.alertInkStrong },

  // Footer
  footer: {
    marginTop: "auto",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.5,
    color: C.muted,
  },
});

// ─── Gráfico de barras horizontais (SVG @react-pdf) ───
function BarChart({ data }: { data: { m: string; consumo: number }[] }) {
  const W = 320;
  const padL = 38;
  const padR = 42;
  const padT = 14;
  const padB = 6;
  const rowH = 12;
  const gap = 2;
  const innerW = W - padL - padR;
  const innerH = data.length * rowH + (data.length - 1) * gap;
  const H = padT + innerH + padB;

  const maxV = Math.max(...data.map((d) => d.consumo), 1);
  const xMax = Math.max(Math.ceil(maxV / 2000) * 2000, 2000);
  const x = (v: number) => padL + (v / xMax) * innerW;

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {/* gridlines verticais (4 ticks) */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <Line
          key={i}
          x1={padL + t * innerW}
          x2={padL + t * innerW}
          y1={padT}
          y2={padT + innerH}
          stroke={C.line}
          strokeWidth={0.5}
          strokeDasharray={i === 0 ? "" : "1 2"}
        />
      ))}

      {data.map((d, i) => {
        const by = padT + i * (rowH + gap);
        const isLast = i === data.length - 1;
        const bw = Math.max(x(d.consumo) - padL, 0.5);
        return (
          <React.Fragment key={d.m}>
            <SvgText
              x={padL - 4}
              y={by + rowH / 2 + 2.5}
              textAnchor="end"
              fontSize={6.5}
              fill={isLast ? C.ink : C.ink2}
              fontFamily={isLast ? "Helvetica-Bold" : "Helvetica"}
            >
              {d.m}
            </SvgText>
            <Rect
              x={padL}
              y={by + 2}
              width={bw}
              height={rowH - 4}
              fill={isLast ? C.orange2 : C.orange}
              rx={1.5}
            />
            <SvgText
              x={x(d.consumo) + 3}
              y={by + rowH / 2 + 2.5}
              textAnchor="start"
              fontSize={6.5}
              fill={isLast ? C.orange2 : C.ink2}
              fontFamily={isLast ? "Helvetica-Bold" : "Helvetica"}
            >
              {d.consumo.toLocaleString("pt-BR")}
            </SvgText>
          </React.Fragment>
        );
      })}

      {/* baseline */}
      <Line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke={C.line2} strokeWidth={0.5} />
    </Svg>
  );
}

// ─── Boleto box ───
function BoletoBox({ b }: { b: DemonstrativoFaturaBoleto }) {
  const isAssoc = b.tipo === "associacao";
  const baseStyle = [s.boletoBase, isAssoc ? s.boletoAssoc : s.boletoRge];
  return (
    <View style={baseStyle}>
      <View style={s.boletoRow1}>
        <Text style={[s.boletoWho, isAssoc ? s.boletoWhoAssoc : s.boletoWhoRge]}>
          {b.titulo.toUpperCase()}
        </Text>
        <Text style={[s.boletoAmount, isAssoc ? s.boletoAmountAssoc : s.boletoAmountRge]}>
          {fmtBRL(b.valor)}
        </Text>
      </View>
      <Text style={s.boletoMeta}>
        Vencimento <Text style={s.boletoMetaStrong}>{b.vencimento}</Text> · {b.observacao}
      </Text>
      <View style={[s.barcodeArea, !isAssoc && s.barcodeAreaRge]}>
        {b.codigoBarrasPng ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={b.codigoBarrasPng} style={s.barcodePng} />
        ) : null}
        {b.codigoBarras ? (
          <Text style={s.barcodeLine}>{b.codigoBarras}</Text>
        ) : (
          <Text style={s.barcodePlaceholder}>
            {b.codigoBarrasPlaceholder ?? "Código de barras ainda não gerado."}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Documento principal ───
export function DemonstrativoFaturaPdf({ data }: { data: DemonstrativoFaturaData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.topStripe} />

        {/* TOPBAR */}
        <View style={s.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={s.clienteNome}>{data.cliente.nome}</Text>
            {data.cliente.cnpj ? <Text style={s.clienteSub}>CPF/CNPJ {data.cliente.cnpj}</Text> : null}
            {data.cliente.endereco ? <Text style={s.clienteSub}>{data.cliente.endereco}</Text> : null}
          </View>
          <View style={s.brandWrap}>
            <Text style={s.brandNome}>Associação de Energia Brasil Solar</Text>
            <Text style={s.brandSub}>Aluguel de usinas fotovoltaicas</Text>
            <Text style={s.brandSub}>sac@redebrasilsolar.com.br</Text>
          </View>
        </View>

        {/* HERO */}
        <View style={s.hero}>
          <View style={s.heroLeft}>
            <Text style={s.heroLbl}>A PAGAR · ASSOCIAÇÃO DE ENERGIA BRASIL SOLAR</Text>
            <Text style={s.heroAmount}>{fmtBRL(data.pagamento.valorAPagar)}</Text>
          </View>
          <View style={s.heroRight}>
            <View style={s.heroRightCol}>
              <Text style={s.heroLbl}>VENCIMENTO</Text>
              <Text style={s.heroRightVal}>{data.pagamento.vencimento}</Text>
            </View>
            <View style={s.heroRightCol}>
              <Text style={s.heroLbl}>EMISSÃO</Text>
              <Text style={s.heroRightVal}>{data.fatura.emissao}</Text>
            </View>
          </View>
        </View>

        {/* STRIPBAND */}
        <View style={s.stripband}>
          <View style={s.stripcell}>
            <Text style={s.striplbl}>UNID. CONSUMIDORA</Text>
            <Text style={s.stripval}>{data.cliente.unidadeConsumidora}</Text>
          </View>
          <View style={[s.stripcell, s.stripcellBorder]}>
            <Text style={s.striplbl}>MÊS DE REFERÊNCIA</Text>
            <Text style={s.stripval}>{data.fatura.mesReferencia}</Text>
          </View>
          <View style={[s.stripcell, s.stripcellBorder]}>
            <Text style={s.striplbl}>BANDEIRA</Text>
            <View style={s.pill}>
              <View
                style={[
                  s.pillDot,
                  {
                    backgroundColor: bandeiraColor(data.fatura.bandeira),
                  },
                ]}
              />
              <Text style={s.pillText}>{data.fatura.bandeira}</Text>
            </View>
          </View>
          <View style={[s.stripcell, s.stripcellBorder]}>
            <Text style={s.striplbl}>DESCONTO TOTAL</Text>
            <Text style={s.stripval}>{data.fatura.descontoTotalPercentual}%</Text>
          </View>
        </View>

        {/* RESUMO DO MÊS */}
        <Text style={s.sectionTitle}>RESUMO DO MÊS</Text>
        <View style={s.cards4}>
          <View style={[s.card, { backgroundColor: C.peach }]}>
            <Text style={[s.cardLbl, { color: C.peachLabel }]}>CUSTO TOTAL SEM DESCONTO</Text>
            <View>
              <Text style={[s.cardVal, { color: C.peachInk }]}>
                {fmtBRL(data.resumoDoMes.custoTotalSemDesconto.valor)}
              </Text>
              <Text style={[s.cardSub, { color: C.peachInk }]}>
                {data.resumoDoMes.custoTotalSemDesconto.obs}
              </Text>
            </View>
          </View>
          <View style={[s.card, { backgroundColor: C.teal800 }]}>
            <Text style={[s.cardLbl, { color: "rgba(255,255,255,0.78)" }]}>CUSTO DE ENERGIA C/ DESCONTO</Text>
            <View>
              <Text style={[s.cardVal, { color: C.white }]}>
                {fmtBRL(data.resumoDoMes.custoEnergiaComDesconto.valor)}
              </Text>
              <Text style={[s.cardSub, { color: C.white }]}>
                {data.resumoDoMes.custoEnergiaComDesconto.obs}
              </Text>
            </View>
          </View>
          <View style={[s.card, { backgroundColor: C.teal100 }]}>
            <Text style={[s.cardLbl, { color: C.teal800 }]}>ECONOMIA MENSAL</Text>
            <View>
              <Text style={[s.cardVal, { color: C.teal800 }]}>
                {fmtBRL(data.resumoDoMes.economiaMensal.valor)}
              </Text>
              <Text style={[s.cardSub, { color: C.teal800 }]}>
                {data.resumoDoMes.economiaMensal.obs}
              </Text>
            </View>
          </View>
          <View style={[s.card, { backgroundColor: C.teal800 }]}>
            <Text style={[s.cardLbl, { color: "rgba(255,255,255,0.78)" }]}>ECONOMIA TOTAL ACUMULADA</Text>
            <View>
              <Text style={[s.cardVal, { color: C.white }]}>
                {fmtBRL(data.resumoDoMes.economiaTotalAcumulada.valor)}
              </Text>
              <Text style={[s.cardSub, { color: C.white }]}>
                {data.resumoDoMes.economiaTotalAcumulada.obs}
              </Text>
            </View>
          </View>
        </View>

        {/* SPLIT: ENERGIA + CHART */}
        <View style={s.split}>
          <View style={s.splitCol}>
            <Text style={s.sectionTitle}>ENERGIA · VALORES DO MÊS</Text>
            <View style={s.statsWrap}>
              <View style={s.stat}>
                <Text style={s.statLbl}>CONSUMO TOTAL DE ENERGIA</Text>
                <View style={s.statRow}>
                  <Text style={s.statVal}>{fmtKwh(data.energia.consumoTotalDeEnergiaKwh)}</Text>
                  <Text style={s.statSub}>{data.energia.consumoObs}</Text>
                </View>
              </View>
              <View style={s.stat}>
                <Text style={s.statLbl}>CRÉDITO TOTAL RECEBIDO</Text>
                <View style={s.statRow}>
                  <Text style={[s.statVal, s.statValAccent]}>{fmtKwh(data.energia.creditoTotalRecebidoKwh)}</Text>
                  <Text style={s.statSub}>{data.energia.creditoRecebidoObs}</Text>
                </View>
              </View>
              <View style={s.stat}>
                <Text style={s.statLbl}>CRÉDITO TOTAL ACUMULADO</Text>
                <View style={s.statRow}>
                  <Text style={s.statVal}>{fmtKwh(data.energia.creditoTotalAcumuladoKwh)}</Text>
                  <Text style={s.statSub}>{data.energia.creditoAcumuladoObs}</Text>
                </View>
              </View>
              <View style={s.stat}>
                <Text style={s.statLbl}>CUSTO DO KWH NA CONCESSIONÁRIA</Text>
                <View style={s.statRow}>
                  <Text style={s.statVal}>{fmtTarifa(data.energia.custoKwhConcessionaria)}</Text>
                  <Text style={s.statSub}>{data.energia.custoKwhObs}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={[s.splitCol, s.splitColChart]}>
            <Text style={s.sectionTitle}>HISTÓRICO · ÚLTIMOS 12 MESES</Text>
            <View style={s.chartCard}>
              <View style={s.chartHd}>
                <Text style={s.chartTtl}>Consumo (kWh)</Text>
                <View style={s.chartLegend}>
                  <View style={s.chartLegendSwatch} />
                  <Text style={s.chartLegendTxt}>Consumo</Text>
                </View>
              </View>
              <BarChart data={data.historico12Meses} />
            </View>
          </View>
        </View>

        {/* BOLETOS */}
        <Text style={s.sectionTitle}>PAGAMENTOS DO PERÍODO</Text>
        <View style={s.boletoWrap}>
          {data.boletos.map((b, i) => (
            <BoletoBox key={i} b={b} />
          ))}
        </View>

        {/* ALERTA */}
        <View style={s.alert}>
          <Text>
            <Text style={s.alertStrong}>Atenção:</Text> Pague em dia esta fatura e garanta seus benefícios e
            evite a incidência de encargos conforme contrato.
          </Text>
        </View>

        {/* FOOTER */}
        <View style={s.footer}>
          <Text>Associação de Energia Brasil Solar · sac@redebrasilsolar.com.br</Text>
          <Text>
            Demonstrativo {data.cliente.unidadeConsumidora} · {data.fatura.mesReferencia} · Emitido{" "}
            {data.fatura.emissao}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

function bandeiraColor(b: string): string {
  const n = b.toLowerCase();
  if (n.includes("vermelha")) return "#DC2626";
  if (n.includes("amarela")) return "#F59E0B";
  return C.teal500;
}
