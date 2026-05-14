import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from "@react-pdf/renderer";
import type { DemonstrativoData, HistoricoMes } from "@/lib/demonstrativo";

// Paleta espelha src/lib/brand-colors.ts e a capa do PDF do investidor.
// Aliases legacy (green*, blue*) preservados para minimizar churn no resto do arquivo.
const C = {
  teal: "#2E9B87",
  tealMid: "#3BAE99",
  tealDark: "#1B5E54",
  tealSoft: "#D7ECE8",
  orange: "#EA6E2C",
  orangeLight: "#F39350",
  orangeSoft: "#FCE5D5",
  // Aliases (mantêm compatibilidade com nomes antigos em todo o stylesheet)
  green: "#2E9B87",
  greenDark: "#1B5E54",
  greenLight: "#D7ECE8",
  blue: "#EA6E2C",
  blueDark: "#1B5E54",
  blueLight: "#D7ECE8",
  red: "#ef4444",
  gray: "#6b7280",
  grayLight: "#f3f4f6",
  grayMid: "#d1d5db",
  grayBorder: "#e5e7eb",
  dark: "#111827",
  white: "#ffffff",
};

const s = StyleSheet.create({
  page: { paddingTop: 14, paddingHorizontal: 22, paddingBottom: 22, fontSize: 9, color: C.dark, fontFamily: "Helvetica", backgroundColor: C.white },

  // Faixa superior com gradiente teal→orange (mesma identidade da capa do PDF do investidor)
  topBarWrap: { height: 6, marginBottom: 10, marginHorizontal: -22 },

  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: "flex-end" },
  clienteNome: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.dark },
  clienteDoc: { fontSize: 8, color: C.gray, marginTop: 1 },
  clienteEndereco: { fontSize: 8, color: C.gray, marginTop: 1 },
  brandName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.greenDark },
  brandInfo: { fontSize: 7, color: C.gray, textAlign: "right" },

  // A PAGAR
  pagarRow: {
    flexDirection: "row",
    backgroundColor: C.greenDark,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },
  pagarLeft: { flexDirection: "column" },
  pagarLabel: { color: C.greenLight, fontSize: 9, letterSpacing: 1, fontFamily: "Helvetica-Bold" },
  pagarValue: { color: C.white, fontSize: 24, fontFamily: "Helvetica-Bold", marginTop: 2 },
  pagarMeta: { flexDirection: "column", alignItems: "flex-end" },
  pagarMetaLbl: { color: C.greenLight, fontSize: 7, letterSpacing: 0.5 },
  pagarMetaVal: { color: C.white, fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 },

  // UC strip
  ucStrip: {
    flexDirection: "row",
    backgroundColor: C.grayLight,
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
    gap: 8,
  },
  ucCell: { flex: 1, flexDirection: "column" },
  ucCellLast: { flex: 1, flexDirection: "column", alignItems: "flex-end" },
  ucLbl: { fontSize: 6.5, color: C.gray, textTransform: "uppercase", letterSpacing: 0.5 },
  ucVal: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.dark, marginTop: 1 },
  ucDescontoBadge: {
    backgroundColor: C.greenDark,
    color: C.white,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },

  // Conteudo central: grafico + cards
  mainRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  chartBox: {
    flex: 2,
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 6,
    padding: 8,
  },
  chartTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.dark, marginBottom: 6 },
  chartArea: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 4 },
  chartCol: { flex: 1, alignItems: "center" },
  chartBarsWrap: { flexDirection: "row", alignItems: "flex-end", height: 105, gap: 1 },
  chartBar: { width: 5 },
  chartBarConsumed: { backgroundColor: C.orange },
  chartBarCompensated: { backgroundColor: C.green },
  chartLbl: { fontSize: 6.5, color: C.gray, marginTop: 2 },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { fontSize: 7, color: C.gray },

  // Cards laterais
  sideCol: { flex: 1, flexDirection: "column", gap: 6 },
  sideCard: {
    borderRadius: 6,
    padding: 8,
    flex: 1,
    justifyContent: "center",
  },
  // Entrega: tom levemente mais frio/sólido que o card "12 meses" pra hierarquia visual.
  sideCardEntrega: { backgroundColor: C.tealMid, borderWidth: 1, borderColor: C.tealDark },
  sideCardMes: { backgroundColor: C.tealDark },
  sideCard12: { backgroundColor: C.tealSoft, borderWidth: 1, borderColor: C.teal },
  sideCardTotal: { backgroundColor: C.orangeSoft, borderWidth: 1, borderColor: C.orange },
  sideLbl: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, textTransform: "uppercase" },
  sideLblLight: { color: C.tealSoft },
  sideLblDark: { color: C.dark },
  sideLblBlue: { color: C.white }, // card Entrega agora é tealMid (sólido) → label branco
  sideLblOrange: { color: "#9a3412" },
  sideVal: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sideValLight: { color: C.white },
  sideValDark: { color: C.dark },
  sideHint: { fontSize: 7, marginTop: 1 },
  sideHintLight: { color: C.greenLight },
  sideHintDark: { color: C.gray },

  // Blocos inferiores (3 colunas)
  infoCards: { flexDirection: "row", gap: 8, marginBottom: 10 },
  infoCard: {
    flex: 1,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: C.grayBorder,
    backgroundColor: C.grayLight,
  },
  infoCardTitle: { fontSize: 7, color: C.gray, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  infoCardValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.dark, marginTop: 2 },
  infoCardDivider: { borderTopWidth: 1, borderTopColor: C.grayMid, marginVertical: 6 },

  // Rodape pagamento
  payRow: { flexDirection: "row", gap: 8 },
  payCol: { flex: 2, flexDirection: "column", gap: 6 },
  avisoBox: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#f59e0b",
    borderRadius: 4,
    padding: 6,
  },
  avisoText: { fontSize: 7.5, color: "#78350f" },
  nossoNumBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: C.grayLight,
    borderRadius: 4,
    padding: 6,
  },
  nossoNumLbl: { fontSize: 7, color: C.gray, fontFamily: "Helvetica-Bold" },
  nossoNumVal: { fontSize: 10, color: C.dark, fontFamily: "Helvetica-Bold" },
  barcodeBox: { backgroundColor: C.white, borderWidth: 1, borderColor: C.grayBorder, borderRadius: 4, padding: 6, alignItems: "center" },
  barcodeImg: { height: 32, width: "100%" },
  barcodeDigits: { fontSize: 8, marginTop: 2, letterSpacing: 0.5 },
  // Rótulo de cada boleto (Layout A: dois empilhados / Layout B: seção dedicada)
  boletoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
    paddingHorizontal: 2,
  },
  boletoHeaderLbl: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.gray, letterSpacing: 0.5 },
  boletoHeaderVal: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.dark },
  // Seção do boleto RGE (Layout B)
  rgeSection: {
    borderWidth: 1,
    borderColor: "#fbbf24",
    backgroundColor: "#fffbeb",
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  rgeSectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#78350f",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  rgeInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  rgeInfoCell: { flexDirection: "column" },
  rgeInfoLbl: { fontSize: 6.5, color: "#78350f", textTransform: "uppercase", letterSpacing: 0.5 },
  rgeInfoVal: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.dark, marginTop: 1 },
  pixBox: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.grayBorder, borderRadius: 4, padding: 6, alignItems: "center", justifyContent: "center" },
  pixImg: { width: 92, height: 92 },
  pixLbl: { fontSize: 7, color: C.gray, marginTop: 2, fontFamily: "Helvetica-Bold" },
  pixPlaceholder: { width: 92, height: 92, backgroundColor: C.grayLight, borderRadius: 4 },
});

function brl(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function brlNoSymbol(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tarifa(v: number | null | undefined, dec = 5): string {
  if (v == null) return "—";
  return `R$ ${v.toFixed(dec).replace(".", ",")} /kWh`;
}

function kwh(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kWh`;
}

function BarChart({ historico }: { historico: HistoricoMes[] }) {
  const maxKwh = Math.max(1, ...historico.map((h) => Math.max(h.consumoKwh, h.compensadoKwh)));
  return (
    <View>
      <View style={s.chartArea}>
        {historico.map((h) => {
          const hConsum = (h.consumoKwh / maxKwh) * 100;
          const hComp = (h.compensadoKwh / maxKwh) * 100;
          return (
            <View key={`${h.ano}-${h.mes}`} style={s.chartCol}>
              <View style={s.chartBarsWrap}>
                <View style={[s.chartBar, s.chartBarConsumed, { height: Math.max(1, hConsum) }]} />
                <View style={[s.chartBar, s.chartBarCompensated, { height: Math.max(1, hComp) }]} />
              </View>
              <Text style={s.chartLbl}>{h.label}</Text>
            </View>
          );
        })}
      </View>
      <View style={s.legendRow}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: C.orange }]} />
          <Text style={s.legendText}>Consumo (kWh)</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: C.green }]} />
          <Text style={s.legendText}>Crédito (kWh)</Text>
        </View>
      </View>
    </View>
  );
}

export type DemonstrativoLayout = "a" | "b";

export function DemonstrativoPDF({
  data,
  layout = "a",
}: {
  data: DemonstrativoData;
  layout?: DemonstrativoLayout;
}) {
  const enderecoCompleto = data.endereco ?? "—";
  const temPix = !!data.pixQrCodePng;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* FAIXA SUPERIOR — gradiente teal→orange (identidade da marca) */}
        <View style={s.topBarWrap}>
          <Svg width="595" height="6" viewBox="0 0 595 6" preserveAspectRatio="none">
            <Defs>
              <LinearGradient
                id="brandBar"
                x1="0"
                y1="0"
                x2="595"
                y2="0"
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={C.teal} />
                <Stop offset="0.55" stopColor={C.tealMid} />
                <Stop offset="1" stopColor={C.orange} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="595" height="6" fill="url(#brandBar)" />
          </Svg>
        </View>

        {/* HEADER */}
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <Text style={s.clienteNome}>{data.clienteNome}</Text>
            {data.cpfCnpj && <Text style={s.clienteDoc}>CNPJ/CPF: {data.cpfCnpj}</Text>}
            <Text style={s.clienteEndereco}>{enderecoCompleto}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.brandName}>Rede Brasil Solar</Text>
            <Text style={s.brandInfo}>Aluguel de usinas fotovoltaicas</Text>
            <Text style={s.brandInfo}>sac@redebrasilsolar.com.br</Text>
          </View>
        </View>

        {/* A PAGAR */}
        <View style={s.pagarRow}>
          <View style={s.pagarLeft}>
            <Text style={s.pagarLabel}>A PAGAR</Text>
            <Text style={s.pagarValue}>{brl(data.valorAluguel)}</Text>
          </View>
          <View style={s.pagarMeta}>
            <Text style={s.pagarMetaLbl}>VENCIMENTO</Text>
            <Text style={s.pagarMetaVal}>{data.vencimento ?? "—"}</Text>
            <Text style={s.pagarMetaLbl}>EMISSÃO</Text>
            <Text style={s.pagarMetaVal}>{data.emissao}</Text>
          </View>
        </View>

        {/* UC STRIP */}
        <View style={s.ucStrip}>
          <View style={s.ucCell}>
            <Text style={s.ucLbl}>UNID. CONSUMIDORA</Text>
            <Text style={s.ucVal}>{data.codigoUc}</Text>
          </View>
          <View style={s.ucCell}>
            <Text style={s.ucLbl}>DOCUMENTO</Text>
            <Text style={s.ucVal}>{data.documentoCobranca ?? "—"}</Text>
          </View>
          <View style={s.ucCell}>
            <Text style={s.ucLbl}>MÊS DE REFERÊNCIA</Text>
            <Text style={s.ucVal}>{data.mesLabel}</Text>
          </View>
          {data.bandeiraTarifaria && (
            <View style={s.ucCell}>
              <Text style={s.ucLbl}>BANDEIRA</Text>
              <Text style={s.ucVal}>{data.bandeiraTarifaria}</Text>
            </View>
          )}
          <View style={s.ucCellLast}>
            <Text style={s.ucLbl}>DESCONTO TOTAL</Text>
            <Text style={s.ucDescontoBadge}>{data.descontoPercent.toFixed(0)}%</Text>
          </View>
        </View>

        {/* MAIN ROW: gráfico + cards laterais */}
        <View style={s.mainRow}>
          <View style={s.chartBox}>
            <Text style={s.chartTitle}>Consumo e crédito recebido — últimos 12 meses</Text>
            {data.historico.length > 0 ? (
              <BarChart historico={data.historico.slice(-12)} />
            ) : (
              <View style={{ height: 120, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ fontSize: 8, color: C.gray }}>Sem histórico disponível</Text>
              </View>
            )}
          </View>

          <View style={s.sideCol}>
            <View style={[s.sideCard, s.sideCardEntrega]}>
              <Text style={[s.sideLbl, s.sideLblBlue]}>ENTREGA NO MÊS</Text>
              <Text style={[s.sideVal, s.sideValLight]}>{data.entregaPercentMes.toFixed(0)}%</Text>
              <Text style={[s.sideHint, s.sideHintLight]}>{brl(data.creditoRecebidoReais)}</Text>
            </View>
            <View style={[s.sideCard, s.sideCardMes]}>
              <Text style={[s.sideLbl, s.sideLblLight]}>DESCONTO NO MÊS</Text>
              <Text style={[s.sideVal, s.sideValLight]}>{brl(data.economiaMes)}</Text>
            </View>
            <View style={[s.sideCard, s.sideCard12]}>
              <Text style={[s.sideLbl, s.sideLblDark]}>DESCONTO ÚLT. 12 MESES</Text>
              <Text style={[s.sideVal, s.sideValDark]}>{brl(data.desconto12Meses)}</Text>
            </View>
            <View style={[s.sideCard, s.sideCardTotal]}>
              <Text style={[s.sideLbl, s.sideLblOrange]}>TOTAL ACUMULADO</Text>
              <Text style={[s.sideVal, s.sideValDark]}>{brl(data.economiaAcumulada)}</Text>
            </View>
          </View>
        </View>

        {/* 3 CARDS INFERIORES */}
        <View style={s.infoCards}>
          <View style={s.infoCard}>
            <Text style={s.infoCardTitle}>CRÉDITO RECEBIDO</Text>
            <Text style={s.infoCardValue}>{brl(data.creditoRecebidoReais)}</Text>
            <View style={s.infoCardDivider} />
            <Text style={s.infoCardTitle}>CONSUMO</Text>
            <Text style={s.infoCardValue}>{kwh(data.consumoKwhMes)}</Text>
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoCardTitle}>CRÉDITO RECEBIDO</Text>
            <Text style={s.infoCardValue}>{kwh(data.compensadoKwhMes)}</Text>
            <View style={s.infoCardDivider} />
            <Text style={s.infoCardTitle}>kWh NA CONCESSIONÁRIA</Text>
            <Text style={s.infoCardValue}>{tarifa(data.tarifaSemDesconto, 4)}</Text>
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoCardTitle}>SEU DESCONTO É {data.descontoPercent.toFixed(0)}%</Text>
            <Text style={s.infoCardValue}>
              {data.tarifaSemDesconto != null && data.tarifaComDesconto != null
                ? tarifa(data.tarifaSemDesconto - data.tarifaComDesconto, 5)
                : "—"}
            </Text>
            <View style={s.infoCardDivider} />
            <Text style={s.infoCardTitle}>DESCONTO EM ENERGIA</Text>
            <Text style={s.infoCardValue}>{brl(data.economiaMes)}</Text>
          </View>
        </View>

        {/* BOLETO RGE (Layout B apenas — seção dedicada acima do rodapé) */}
        {layout === "b" && data.codigoBarrasRgePng && (
          <View style={s.rgeSection}>
            <Text style={s.rgeSectionTitle}>
              FATURA DA CONCESSIONÁRIA (RGE) — pagar diretamente à distribuidora
            </Text>
            <View style={s.rgeInfoRow}>
              <View style={s.rgeInfoCell}>
                <Text style={s.rgeInfoLbl}>Valor</Text>
                <Text style={s.rgeInfoVal}>{brl(data.valorFaturaRge)}</Text>
              </View>
              <View style={s.rgeInfoCell}>
                <Text style={s.rgeInfoLbl}>Vencimento</Text>
                <Text style={s.rgeInfoVal}>{data.vencimentoRge ?? "—"}</Text>
              </View>
            </View>
            <View style={s.barcodeBox}>
              <Image style={s.barcodeImg} src={data.codigoBarrasRgePng} />
              <Text style={s.barcodeDigits}>{data.codigoBarrasRgeDigits}</Text>
            </View>
          </View>
        )}

        {/* RODAPÉ PAGAMENTO */}
        <View style={s.payRow}>
          <View style={s.payCol}>
            <View style={s.avisoBox}>
              <Text style={s.avisoText}>
                Evite a suspensão do seu benefício mantendo em dia os pagamentos desta fatura.
                Após o vencimento, incidirão encargos conforme contrato.
              </Text>
            </View>
            <View style={s.nossoNumBox}>
              <Text style={s.nossoNumLbl}>NOSSO NÚMERO</Text>
              <Text style={s.nossoNumVal}>{data.documentoCobranca ?? "—"}</Text>
            </View>

            {/* Layout A: boleto RGE empilhado acima do boleto Dommo */}
            {layout === "a" && data.codigoBarrasRgePng && (
              <View>
                <View style={s.boletoHeader}>
                  <Text style={s.boletoHeaderLbl}>BOLETO RGE (CONCESSIONÁRIA)</Text>
                  <Text style={s.boletoHeaderVal}>
                    {brl(data.valorFaturaRge)} · venc. {data.vencimentoRge ?? "—"}
                  </Text>
                </View>
                <View style={s.barcodeBox}>
                  <Image style={s.barcodeImg} src={data.codigoBarrasRgePng} />
                  <Text style={s.barcodeDigits}>{data.codigoBarrasRgeDigits}</Text>
                </View>
              </View>
            )}

            {/* Boleto Dommo (Asaas) */}
            {layout === "a" && (
              <View style={s.boletoHeader}>
                <Text style={s.boletoHeaderLbl}>BOLETO DOMMO (ASAAS)</Text>
                <Text style={s.boletoHeaderVal}>
                  {brl(data.valorAluguel)} · venc. {data.vencimento ?? "—"}
                </Text>
              </View>
            )}
            {data.codigoBarrasPng ? (
              <View style={s.barcodeBox}>
                <Image style={s.barcodeImg} src={data.codigoBarrasPng} />
                <Text style={s.barcodeDigits}>{data.linhaDigitavel}</Text>
              </View>
            ) : (
              <View style={[s.barcodeBox, { backgroundColor: C.grayLight }]}>
                <Text style={{ fontSize: 8, color: C.gray }}>
                  Emita a cobrança no Asaas para gerar o código de barras.
                </Text>
              </View>
            )}
          </View>
          {temPix && (
            <View style={s.pixBox}>
              <Image style={s.pixImg} src={data.pixQrCodePng!} />
              <Text style={s.pixLbl}>PIX</Text>
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
