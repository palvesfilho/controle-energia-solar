import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// Reflete o shape do DreAgregado serializado.
export interface FechamentoPdfData {
  tipo: "mensal" | "trimestral" | "semestral" | "anual";
  ano: number;
  mes: number;
  periodoLabel: string;
  geradoEm: string;
  totais: {
    receitaAsaas: number;
    receitaGestao: number;
    receitaBruta: number;
    custoUsinas: number;
    custoInvestidorBruto: number;
    custoDireto: number;
    margemBruta: number;
    margemBrutaPct: number;
    custosFixosTotal: number;
    imposto: number;
    lucroLiquido: number;
    margemLiquidaPct: number;
    kwhInjetado: number;
    kwhCompensado: number;
  };
  meses: Array<{
    ano: number;
    mes: number;
    receitaBruta: number;
    custoDireto: number;
    custosFixosTotal: number;
    imposto: number;
    lucroLiquido: number;
  }>;
  rubricasUltimoMes: Array<{
    label: string;
    categoria: string | null;
    valor: number;
    confirmado: boolean;
  }>;
  inadimplencia: {
    total: number;
    qtdTotal: number;
    pctSobreReceita: number;
    faixas: Array<{ label: string; qtd: number; valor: number }>;
  };
  alertas: string[];
  taxRatePercentual: number | null;
}

const C = {
  teal: "#2E9B87",
  tealDark: "#1B5E54",
  orange: "#EA6E2C",
  creamLight: "#FFF5EC",
  white: "#ffffff",
  black: "#1F1F1F",
  gray: "#6B7280",
  grayLight: "#9CA3AF",
  grayBorder: "#E5E7EB",
  green: "#15803D",
  red: "#B91C1C",
  amber: "#92400E",
  amberBg: "#FEF3C7",
};

const MES_CURTO = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const s = StyleSheet.create({
  page: {
    fontSize: 9,
    color: C.black,
    fontFamily: "Helvetica",
    backgroundColor: C.white,
    padding: 32,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: C.teal,
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.tealDark,
  },
  subtitle: {
    fontSize: 9,
    color: C.gray,
    marginTop: 2,
  },
  badge: {
    backgroundColor: C.orange,
    color: C.white,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  // Indicadores
  indicadoresRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  indicador: {
    flex: 1,
    backgroundColor: C.creamLight,
    borderRadius: 4,
    padding: 8,
  },
  indicadorLbl: {
    fontSize: 7,
    color: C.gray,
    textTransform: "uppercase",
  },
  indicadorVal: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.tealDark,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.tealDark,
    marginTop: 8,
    marginBottom: 6,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
  },

  // DRE
  dreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  dreLabel: {
    fontSize: 9,
    color: C.black,
  },
  dreLabelIndent: {
    fontSize: 9,
    color: C.gray,
    paddingLeft: 14,
  },
  dreValor: {
    fontSize: 9,
    fontFamily: "Helvetica",
    color: C.black,
  },
  dreValorPos: { color: C.green, fontFamily: "Helvetica" },
  dreValorNeg: { color: C.red, fontFamily: "Helvetica" },
  dreTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.black,
    paddingTop: 4,
    marginTop: 3,
  },
  dreTotalLbl: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  dreTotalVal: { fontSize: 10, fontFamily: "Helvetica-Bold" },

  // Tabela mensal
  table: {
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  thead: {
    flexDirection: "row",
    backgroundColor: C.creamLight,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  th: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.gray,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.grayBorder,
  },
  td: {
    fontSize: 8.5,
    color: C.black,
  },
  trTotal: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: C.creamLight,
  },

  // Alertas
  alertBox: {
    backgroundColor: C.amberBg,
    borderRadius: 4,
    padding: 8,
    marginTop: 6,
  },
  alertItem: {
    fontSize: 8.5,
    color: C.amber,
    marginBottom: 2,
  },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.grayLight,
  },
});

function brl(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function num(v: number): string {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function pct(v: number): string {
  return `${v.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
}

export function FechamentoFinanceiroPDF({ data }: { data: FechamentoPdfData }) {
  const t = data.totais;
  const lucro = t.lucroLiquido;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Fechamento Financeiro</Text>
            <Text style={s.subtitle}>
              {data.periodoLabel} · regime de caixa · gerado em {data.geradoEm}
            </Text>
          </View>
          <View style={s.badge}>
            <Text>{data.tipo.toUpperCase()}</Text>
          </View>
        </View>

        {/* Indicadores */}
        <View style={s.indicadoresRow}>
          <View style={s.indicador}>
            <Text style={s.indicadorLbl}>Receita bruta</Text>
            <Text style={s.indicadorVal}>{brl(t.receitaBruta)}</Text>
          </View>
          <View style={s.indicador}>
            <Text style={s.indicadorLbl}>Custos totais</Text>
            <Text style={s.indicadorVal}>
              {brl(t.custoDireto + t.custosFixosTotal + t.imposto)}
            </Text>
          </View>
          <View style={s.indicador}>
            <Text style={s.indicadorLbl}>
              {lucro >= 0 ? "Lucro líquido" : "Prejuízo"}
            </Text>
            <Text
              style={[
                s.indicadorVal,
                { color: lucro >= 0 ? C.green : C.red },
              ]}
            >
              {brl(lucro)}
            </Text>
          </View>
          <View style={s.indicador}>
            <Text style={s.indicadorLbl}>Margem líquida</Text>
            <Text style={s.indicadorVal}>{pct(t.margemLiquidaPct)}</Text>
          </View>
        </View>

        {/* DRE */}
        <Text style={s.sectionTitle}>DRE — {data.periodoLabel}</Text>
        <View style={s.dreRow}>
          <Text style={s.dreLabelIndent}>Boletos Asaas pagos</Text>
          <Text style={[s.dreValor, s.dreValorPos]}>
            +{brl(t.receitaAsaas)}
          </Text>
        </View>
        <View style={s.dreRow}>
          <Text style={s.dreLabelIndent}>Receita de gestão de energia</Text>
          <Text style={[s.dreValor, s.dreValorPos]}>
            +{brl(t.receitaGestao)}
          </Text>
        </View>
        <View style={s.dreTotalRow}>
          <Text style={s.dreTotalLbl}>Receita bruta</Text>
          <Text style={s.dreTotalVal}>{brl(t.receitaBruta)}</Text>
        </View>

        <View style={[s.dreRow, { marginTop: 4 }]}>
          <Text style={s.dreLabelIndent}>Conta da usina (concessionária)</Text>
          <Text style={[s.dreValor, s.dreValorNeg]}>
            −{brl(t.custoUsinas)}
          </Text>
        </View>
        <View style={s.dreRow}>
          <Text style={s.dreLabelIndent}>Pagamento investidor (bruto)</Text>
          <Text style={[s.dreValor, s.dreValorNeg]}>
            −{brl(t.custoInvestidorBruto)}
          </Text>
        </View>
        <View style={s.dreTotalRow}>
          <Text style={s.dreTotalLbl}>Margem bruta ({pct(t.margemBrutaPct)})</Text>
          <Text style={[s.dreTotalVal, { color: t.margemBruta >= 0 ? C.green : C.red }]}>
            {brl(t.margemBruta)}
          </Text>
        </View>

        <View style={[s.dreRow, { marginTop: 4 }]}>
          <Text style={s.dreLabelIndent}>Custos fixos (rubricas)</Text>
          <Text style={[s.dreValor, s.dreValorNeg]}>
            −{brl(t.custosFixosTotal)}
          </Text>
        </View>
        <View style={s.dreRow}>
          <Text style={s.dreLabelIndent}>
            Imposto{" "}
            {data.taxRatePercentual !== null
              ? `(${data.taxRatePercentual}% sobre receita)`
              : "(sem alíquota vigente)"}
          </Text>
          <Text style={[s.dreValor, s.dreValorNeg]}>−{brl(t.imposto)}</Text>
        </View>
        <View style={s.dreTotalRow}>
          <Text style={s.dreTotalLbl}>
            {lucro >= 0 ? "Lucro líquido" : "Prejuízo do período"}
          </Text>
          <Text
            style={[
              s.dreTotalVal,
              { color: lucro >= 0 ? C.green : C.red },
            ]}
          >
            {brl(lucro)}
          </Text>
        </View>

        {/* Breakdown mensal (só pra trimestral+) */}
        {data.meses.length > 1 ? (
          <>
            <Text style={s.sectionTitle}>Breakdown mês a mês</Text>
            <View style={s.table}>
              <View style={s.thead}>
                <Text style={[s.th, { width: 50 }]}>Mês</Text>
                <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Receita</Text>
                <Text style={[s.th, { flex: 1, textAlign: "right" }]}>
                  Custo direto
                </Text>
                <Text style={[s.th, { flex: 1, textAlign: "right" }]}>
                  Custos fixos
                </Text>
                <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Imposto</Text>
                <Text style={[s.th, { flex: 1, textAlign: "right" }]}>
                  Lucro líquido
                </Text>
              </View>
              {data.meses.map((m) => (
                <View key={`${m.ano}-${m.mes}`} style={s.tr}>
                  <Text style={[s.td, { width: 50 }]}>
                    {MES_CURTO[m.mes - 1]}/{String(m.ano).slice(-2)}
                  </Text>
                  <Text style={[s.td, { flex: 1, textAlign: "right" }]}>
                    {brl(m.receitaBruta)}
                  </Text>
                  <Text style={[s.td, { flex: 1, textAlign: "right" }]}>
                    {brl(m.custoDireto)}
                  </Text>
                  <Text style={[s.td, { flex: 1, textAlign: "right" }]}>
                    {brl(m.custosFixosTotal)}
                  </Text>
                  <Text style={[s.td, { flex: 1, textAlign: "right" }]}>
                    {brl(m.imposto)}
                  </Text>
                  <Text
                    style={[
                      s.td,
                      { flex: 1, textAlign: "right" },
                      {
                        color: m.lucroLiquido >= 0 ? C.green : C.red,
                        fontFamily: "Helvetica-Bold",
                      },
                    ]}
                  >
                    {brl(m.lucroLiquido)}
                  </Text>
                </View>
              ))}
              <View style={s.trTotal}>
                <Text style={[s.td, { width: 50, fontFamily: "Helvetica-Bold" }]}>
                  Total
                </Text>
                <Text
                  style={[
                    s.td,
                    { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" },
                  ]}
                >
                  {brl(t.receitaBruta)}
                </Text>
                <Text
                  style={[
                    s.td,
                    { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" },
                  ]}
                >
                  {brl(t.custoDireto)}
                </Text>
                <Text
                  style={[
                    s.td,
                    { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" },
                  ]}
                >
                  {brl(t.custosFixosTotal)}
                </Text>
                <Text
                  style={[
                    s.td,
                    { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" },
                  ]}
                >
                  {brl(t.imposto)}
                </Text>
                <Text
                  style={[
                    s.td,
                    {
                      flex: 1,
                      textAlign: "right",
                      fontFamily: "Helvetica-Bold",
                      color: lucro >= 0 ? C.green : C.red,
                    },
                  ]}
                >
                  {brl(lucro)}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {/* Indicadores físicos */}
        <Text style={s.sectionTitle}>Indicadores físicos</Text>
        <View style={s.dreRow}>
          <Text style={s.dreLabel}>kWh injetado (referência)</Text>
          <Text style={s.dreValor}>{num(t.kwhInjetado)} kWh</Text>
        </View>
        <View style={s.dreRow}>
          <Text style={s.dreLabel}>kWh compensado (referência)</Text>
          <Text style={s.dreValor}>{num(t.kwhCompensado)} kWh</Text>
        </View>

        {/* Inadimplência */}
        {data.inadimplencia.qtdTotal > 0 ? (
          <>
            <Text style={s.sectionTitle}>
              Inadimplência atual ({data.inadimplencia.qtdTotal} fatura
              {data.inadimplencia.qtdTotal > 1 ? "s" : ""})
            </Text>
            <View style={s.table}>
              <View style={s.thead}>
                <Text style={[s.th, { flex: 1 }]}>Faixa</Text>
                <Text style={[s.th, { width: 60, textAlign: "right" }]}>Qtd</Text>
                <Text style={[s.th, { width: 110, textAlign: "right" }]}>Valor</Text>
              </View>
              {data.inadimplencia.faixas.map((f) => (
                <View key={f.label} style={s.tr}>
                  <Text style={[s.td, { flex: 1 }]}>{f.label}</Text>
                  <Text style={[s.td, { width: 60, textAlign: "right" }]}>
                    {f.qtd}
                  </Text>
                  <Text style={[s.td, { width: 110, textAlign: "right" }]}>
                    {brl(f.valor)}
                  </Text>
                </View>
              ))}
              <View style={s.trTotal}>
                <Text style={[s.td, { flex: 1, fontFamily: "Helvetica-Bold" }]}>
                  Total ({pct(data.inadimplencia.pctSobreReceita)} da receita)
                </Text>
                <Text
                  style={[
                    s.td,
                    {
                      width: 60,
                      textAlign: "right",
                      fontFamily: "Helvetica-Bold",
                    },
                  ]}
                >
                  {data.inadimplencia.qtdTotal}
                </Text>
                <Text
                  style={[
                    s.td,
                    {
                      width: 110,
                      textAlign: "right",
                      fontFamily: "Helvetica-Bold",
                    },
                  ]}
                >
                  {brl(data.inadimplencia.total)}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {/* Alertas */}
        {data.alertas.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Pontos de atenção</Text>
            <View style={s.alertBox}>
              {data.alertas.map((a, i) => (
                <Text key={i} style={s.alertItem}>
                  • {a}
                </Text>
              ))}
            </View>
          </>
        ) : null}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>Fechamento Financeiro — {data.periodoLabel}</Text>
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
