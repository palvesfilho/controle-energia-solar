import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Circle,
  Rect,
  Defs,
  LinearGradient,
  Stop,
} from "@react-pdf/renderer";

export interface InvestorReportData {
  plantName: string;
  numeroUsina: string | null;
  investorName: string;
  investorDoc: string | null;
  mesLabel: string;
  emissao: string;
  reportNumero?: string | null;

  // Energia (kWh) — só do que foi efetivamente realizado (DISPONIVEL/PAGO)
  kwhInjetado: number | null;
  /** Compensado REMUNERÁVEL (= bruto − legado abatido). É o que o investidor recebe. */
  kwhCompensado: number;
  /** Compensado BRUTO (físico, antes do cap). Mostrado pra contexto. */
  kwhCompensadoBruto: number;
  kwhCredito: number | null;

  // Crédito legado: kWh compensados nas UCs ALÉM do cap (= injeção acumulada).
  // Veio de saldo pré-existente das UCs, não da injeção da usina. Sinaliza erro
  // de operação no início da usina e NÃO é remunerável ao investidor.
  kwhCreditoLegado: number;
  valorCreditoLegado: number;

  // Financeiro (R$) — só do realizado
  valorKwhContrato: number | null;
  valorBruto: number;
  gestaoFixaMensal: number | null;
  valorContaUcUsina: number | null;
  // Multas, negociacoes, gestao extra, outros — soma de valorAbatidoDebito
  // dos payables. Reflete amortizacao automatica de saldos negativos
  // anteriores (InvestorDebit) e ajustes diversos.
  valorAjustesGerais: number;
  // Quando bruto − custos < 0, a diferenca eh registrada como InvestorDebit
  // pra ser amortizada nas proximas remuneracoes. Valor a receber clampa em 0.
  valorSaldoCarregadoProximo: number;
  valorReceber: number;

  // Indica se é o PRIMEIRO relatório da usina (caso especial: agrega todas as
  // faturas pagas durante o gap pré-rateio).
  isPrimeiroRelatorio: boolean;
  // Faturas da usina que entraram no desconto. No regime normal: 1 item.
  // No primeiro relatório: N itens (mes a mes).
  faturasUsinaDescontadas: Array<{
    ano: number;
    mes: number;
    valor: number | null;
  }>;

  // Saldo represado por motivo (parcelas pendentes não entram no valor a receber)
  kwhRepresadoCompensacao: number;
  valorRepresadoCompensacao: number;
  kwhRepresadoInadimplencia: number;
  valorRepresadoInadimplencia: number;
  ucsRepresadasInadimplencia: Array<{
    codigoUc: string | null;
    nome: string | null;
    kwh: number;
    valor: number;
  }>;

  // Saldo acumulado de crédito (kWh) — injetado − compensado, somado mês a mês
  // desde a primeira fatura cadastrada até o mês de referência.
  saldoCreditoAnterior: number;
  saldoCreditoFinal: number;

  observacoes: string | null;
}

// Paleta Brasil Solar — espelha solar_fv.html do GERADOR_PROPOSTA
const C = {
  teal: "#2E9B87",
  tealMid: "#3BAE99",
  tealDark: "#1B5E54",
  orange: "#EA6E2C",
  orangeLight: "#F39350",
  cream: "#FDE9D7",
  creamLight: "#FFF5EC",
  white: "#ffffff",
  black: "#1F1F1F",
  gray: "#6B7280",
  grayBorder: "#E5E7EB",
  red: "#B91C1C",
  amber: "#92400E",
  amberBg: "#FEF3C7",
};

const s = StyleSheet.create({
  // ------- COMUM -------
  page: {
    fontSize: 10,
    color: C.black,
    fontFamily: "Helvetica",
    backgroundColor: C.white,
  },

  // ------- CAPA -------
  // Page sem padding pra capa (a Page padrão tem padding implícito)
  coverPage: {
    fontSize: 10,
    color: C.black,
    fontFamily: "Helvetica",
    backgroundColor: C.teal, // fallback caso o SVG falhe
    padding: 0,
  },
  // Container absolute que ocupa a página inteira, abriga o SVG do gradiente.
  coverBgWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  // Logo no topo esquerdo (≈20mm = 56pt)
  coverLogo: {
    position: "absolute",
    top: 56,
    left: 56,
    flexDirection: "row",
  },
  coverLogoLight: {
    fontSize: 22,
    fontFamily: "Helvetica",
    color: C.white,
    letterSpacing: 0.5,
  },
  coverLogoBold: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    letterSpacing: 0.5,
  },
  coverLogoOrange: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.orange,
    letterSpacing: 0.5,
  },
  // Bloco de conteúdo no rodapé (slogan + info), ≈40mm do bottom = 113pt
  coverContent: {
    position: "absolute",
    bottom: 113,
    left: 56,
    right: 56,
  },
  coverHeadline: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    lineHeight: 1.2,
    marginBottom: 70,
  },
  coverIdRow: {
    flexDirection: "row",
    paddingVertical: 5,
  },
  coverIdLbl: {
    width: 165,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  coverIdVal: {
    flex: 1,
    fontSize: 13,
    color: C.white,
  },
  coverFooter: {
    position: "absolute",
    bottom: 40,
    left: 56,
    right: 56,
    fontSize: 9,
    color: "rgba(255,255,255,0.85)",
  },

  // ------- PÁGINA DE DADOS -------
  body: {
    padding: 32,
    paddingTop: 24,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 22,
  },
  pageBadge: {
    backgroundColor: C.teal,
    color: C.white,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 999,
  },

  // Faixa de identificação (resumo da capa)
  idStrip: {
    flexDirection: "row",
    backgroundColor: C.creamLight,
    borderRadius: 6,
    padding: 10,
    marginBottom: 18,
    gap: 10,
  },
  idCell: { flex: 1, flexDirection: "column" },
  idLbl: {
    fontSize: 7,
    color: C.gray,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  idVal: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.black,
    marginTop: 2,
  },

  // Cabeçalho de seção (barra lateral verde + título)
  section: { marginBottom: 18 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionBar: {
    width: 4,
    height: 14,
    backgroundColor: C.teal,
    marginRight: 8,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.tealDark,
  },

  // Tabela
  table: {
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.cream,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.tealDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableHeaderLeft: { flex: 1 },
  tableHeaderRight: { textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
  },
  tableRowAlt: {
    backgroundColor: C.creamLight,
  },
  tableCellLbl: {
    flex: 1,
    fontSize: 10,
    color: C.black,
  },
  tableCellHint: {
    fontSize: 8,
    color: C.gray,
    marginTop: 1,
  },
  tableCellVal: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.black,
    textAlign: "right",
  },
  tableCellValNeg: { color: C.red },

  // Caixa "VALOR A RECEBER"
  receberBox: {
    flexDirection: "row",
    backgroundColor: C.tealDark,
    borderRadius: 6,
    padding: 14,
    marginTop: 12,
    alignItems: "center",
    justifyContent: "space-between",
  },
  receberLbl: {
    color: C.white,
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
  },
  receberVal: {
    color: C.white,
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
  },

  // Saldo represado
  warnBox: {
    backgroundColor: C.amberBg,
    borderRadius: 4,
    padding: 10,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: C.orange,
  },
  warnTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.amber,
    marginBottom: 4,
  },
  warnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  warnLbl: { fontSize: 9, color: C.amber },
  warnVal: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.amber },
  warnHint: { fontSize: 8, color: C.amber, marginTop: 4, fontStyle: "italic" },
  ucListItem: { fontSize: 8, color: C.amber, marginTop: 2 },

  // Observações
  obsBox: {
    backgroundColor: C.creamLight,
    borderRadius: 4,
    padding: 8,
  },
  obsText: { fontSize: 9, color: C.black, fontStyle: "italic" },

  // Rodapé
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
  },
  footerLogo: { flexDirection: "row" },
  footerLogoText: { fontSize: 9, color: C.tealDark },
  footerLogoBold: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.tealDark },
  footerLogoOrange: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.orange },
  footerContact: { fontSize: 8, color: C.gray },
});

function brl(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function kwh(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kWh`;
}

function tarifa(v: number | null | undefined): string {
  if (v == null) return "—";
  return `R$ ${v.toFixed(5).replace(".", ",")} /kWh`;
}

// Fundo da capa: gradiente diagonal teal→teal claro→laranja + 2 círculos translúcidos.
// Espelha .cover / .cover::before / .cover::after do solar_fv.html.
// A4 em pontos = 595 × 842. Convenção mm→pt: 1mm ≈ 2.835pt.
function CoverBackground() {
  return (
    <View style={s.coverBgWrap}>
      <Svg
        width="595"
        height="842"
        viewBox="0 0 595 842"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient
            id="coverGrad"
            x1="0"
            y1="0"
            x2="595"
            y2="842"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={C.teal} />
            <Stop offset="0.45" stopColor={C.tealMid} />
            <Stop offset="1" stopColor={C.orange} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="595" height="842" fill="url(#coverGrad)" />
        {/* ::before — círculo grande translúcido topo-direita (180mm = 510pt; top:-50mm right:-40mm) */}
        <Circle
          cx="595"
          cy="0"
          r="255"
          fill="#ffffff"
          fillOpacity="0.08"
        />
        {/* ::after — círculo enorme translúcido baixo-esquerda (220mm = 624pt; bottom:-60mm left:-50mm) */}
        <Circle
          cx="0"
          cy="842"
          r="312"
          fill="#ffffff"
          fillOpacity="0.05"
        />
      </Svg>
    </View>
  );
}

function FooterBar() {
  return (
    <View style={s.footer} fixed>
      <View style={s.footerLogo}>
        <Text style={s.footerLogoText}>rede</Text>
        <Text style={s.footerLogoBold}>BRASIL</Text>
        <Text style={s.footerLogoOrange}>SOLAR</Text>
      </View>
      <Text style={s.footerContact}>
        (55) 9 9666-1521 • @redebrasilsolarsantamaria
      </Text>
    </View>
  );
}

interface RowSpec {
  label: string;
  hint?: string;
  value: string;
  negative?: boolean;
}

function DataTable({
  rows,
  rightHeader = "Valor",
}: {
  rows: RowSpec[];
  rightHeader?: string;
}) {
  return (
    <View style={s.table}>
      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderCell, s.tableHeaderLeft]}>Especificação</Text>
        <Text style={[s.tableHeaderCell, s.tableHeaderRight]}>{rightHeader}</Text>
      </View>
      {rows.map((row, i) => (
        <View
          key={i}
          style={i % 2 === 1 ? [s.tableRow, s.tableRowAlt] : s.tableRow}
        >
          <View style={s.tableCellLbl}>
            <Text>{row.label}</Text>
            {row.hint && <Text style={s.tableCellHint}>{row.hint}</Text>}
          </View>
          <Text
            style={
              row.negative ? [s.tableCellVal, s.tableCellValNeg] : s.tableCellVal
            }
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function InvestorReportPDF({ data }: { data: InvestorReportData }) {
  const energiaRows: RowSpec[] = [
    {
      label: "Saldo acumulado anterior",
      hint: "Crédito não compensado herdado dos meses anteriores",
      value: kwh(data.saldoCreditoAnterior),
    },
    {
      label: "(+) Injetado no período",
      hint: "Medido na UC da usina",
      value: kwh(data.kwhInjetado),
    },
    {
      label: "(−) Compensado no período",
      hint: "Crédito destinado às UCs do rateio",
      value: kwh(data.kwhCompensado),
    },
    {
      label: "Saldo acumulado ao final do período",
      hint: "Saldo anterior + injetado − compensado",
      value: kwh(data.saldoCreditoFinal),
    },
  ];

  const MES_ABREV = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];

  const faturasComoLinhas: RowSpec[] = data.faturasUsinaDescontadas.length > 1
    ? data.faturasUsinaDescontadas.map((f) => ({
        label: `Conta de energia ${MES_ABREV[f.mes - 1]}/${String(f.ano).slice(-2)}`,
        value: brl(f.valor),
      }))
    : [
        {
          label: "Conta de energia da usina",
          hint: "Valor pago à concessionária pela UC geradora",
          value: brl(data.valorContaUcUsina),
        },
      ];

  const competenciaLabel = data.mesLabel; // ex.: "Abril/2025"
  const despesasRows: RowSpec[] = [
    ...faturasComoLinhas,
    {
      label: `Gestão de energia (ref. ${competenciaLabel})`,
      hint: "Cobrada apenas no mês de competência — não há gestão nos meses sem compensação",
      value: brl(data.gestaoFixaMensal),
    },
  ];

  const financeiroRows: RowSpec[] = [
    {
      label: "Valor bruto do período",
      hint: `${kwh(data.kwhCompensado)} × ${tarifa(data.valorKwhContrato)}`,
      value: brl(data.valorBruto),
    },
    {
      label: "(−) Conta de energia da usina",
      value:
        data.valorContaUcUsina != null
          ? `− ${brl(data.valorContaUcUsina)}`
          : "—",
      negative: data.valorContaUcUsina != null,
    },
    {
      label: "(−) Gestão de energia",
      value:
        data.gestaoFixaMensal != null
          ? `− ${brl(data.gestaoFixaMensal)}`
          : "—",
      negative: data.gestaoFixaMensal != null,
    },
    {
      label: "(−) Multas, negociações, gestão, outros",
      hint: "Amortização de saldos negativos anteriores e ajustes diversos",
      value:
        data.valorAjustesGerais > 0.009
          ? `− ${brl(data.valorAjustesGerais)}`
          : "—",
      negative: data.valorAjustesGerais > 0.009,
    },
  ];

  const temRepresado =
    data.kwhRepresadoCompensacao > 0 || data.kwhRepresadoInadimplencia > 0;

  return (
    <Document>
      {/* PÁGINA 1 — CAPA */}
      <Page size="A4" style={s.coverPage}>
        <CoverBackground />
        <View style={s.coverLogo}>
          <Text style={s.coverLogoLight}>rede</Text>
          <Text style={s.coverLogoBold}>BRASIL</Text>
          <Text style={s.coverLogoOrange}>SOLAR</Text>
        </View>
        <View style={s.coverContent}>
          <Text style={s.coverHeadline}>
            RELATÓRIO DE FATURAMENTO,{"\n"}SUA USINA EM PRODUÇÃO!
          </Text>
          <View style={s.coverIdRow}>
            <Text style={s.coverIdLbl}>Investidor:</Text>
            <Text style={s.coverIdVal}>{data.investorName}</Text>
          </View>
          {data.investorDoc && (
            <View style={s.coverIdRow}>
              <Text style={s.coverIdLbl}>CPF/CNPJ:</Text>
              <Text style={s.coverIdVal}>{data.investorDoc}</Text>
            </View>
          )}
          <View style={s.coverIdRow}>
            <Text style={s.coverIdLbl}>Usina:</Text>
            <Text style={s.coverIdVal}>
              {data.plantName}
              {data.numeroUsina ? ` • Nº ${data.numeroUsina}` : ""}
            </Text>
          </View>
          <View style={s.coverIdRow}>
            <Text style={s.coverIdLbl}>Período de referência:</Text>
            <Text style={s.coverIdVal}>{data.mesLabel}</Text>
          </View>
        </View>
        <Text style={s.coverFooter}>
          {data.reportNumero ? `Relatório Nº ${data.reportNumero} • ` : ""}
          Emitido em {data.emissao}
        </Text>
      </Page>

      {/* PÁGINA 2 — DADOS */}
      <Page size="A4" style={s.page}>
        <View style={s.body}>
          <View style={s.pageHeader}>
            <Text style={s.pageBadge}>2 / 2</Text>
          </View>

          {/* Faixa resumo */}
          <View style={s.idStrip}>
            <View style={s.idCell}>
              <Text style={s.idLbl}>INVESTIDOR</Text>
              <Text style={s.idVal}>{data.investorName}</Text>
            </View>
            <View style={s.idCell}>
              <Text style={s.idLbl}>USINA</Text>
              <Text style={s.idVal}>
                {data.plantName}
                {data.numeroUsina ? ` • Nº ${data.numeroUsina}` : ""}
              </Text>
            </View>
            <View style={s.idCell}>
              <Text style={s.idLbl}>PERÍODO</Text>
              <Text style={s.idVal}>{data.mesLabel}</Text>
            </View>
          </View>

          {/* 1. Resultado Energético */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionBar} />
              <Text style={s.sectionTitle}>1. RESULTADO ENERGÉTICO</Text>
            </View>
            <DataTable rows={energiaRows} rightHeader="kWh" />
          </View>

          {/* 2. Despesas Fixas do Período */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionBar} />
              <Text style={s.sectionTitle}>
                2. DESPESAS FIXAS{data.isPrimeiroRelatorio && data.faturasUsinaDescontadas.length > 1
                  ? " (1º RELATÓRIO — INCLUI FATURAS ANTERIORES)"
                  : " DO PERÍODO"}
              </Text>
            </View>
            <DataTable rows={despesasRows} rightHeader="R$" />
          </View>

          {/* 3. Resultado Financeiro */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionBar} />
              <Text style={s.sectionTitle}>3. RESULTADO FINANCEIRO</Text>
            </View>
            <DataTable rows={financeiroRows} rightHeader="R$" />
            <View style={s.receberBox}>
              <Text style={s.receberLbl}>VALOR A RECEBER</Text>
              <Text style={s.receberVal}>{brl(data.valorReceber)}</Text>
            </View>
            {data.valorSaldoCarregadoProximo > 0.009 && (
              <View style={s.warnBox}>
                <Text style={s.warnTitle}>
                  Saldo negativo carregado para o próximo mês
                </Text>
                <View style={s.warnRow}>
                  <Text style={s.warnLbl}>
                    Custos do mês excederam a compensação. Saldo a amortizar:
                  </Text>
                  <Text style={s.warnVal}>
                    {brl(data.valorSaldoCarregadoProximo)}
                  </Text>
                </View>
                <Text style={s.warnHint}>
                  Esse valor foi registrado como débito do investidor e será
                  abatido automaticamente nas próximas remunerações.
                </Text>
              </View>
            )}
          </View>

          {/* 4. Saldo Represado */}
          {temRepresado && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionBar} />
                <Text style={s.sectionTitle}>4. SALDO REPRESADO</Text>
              </View>
              <Text style={s.warnHint}>
                Valores referentes ao período mas que ainda não estão disponíveis
                para pagamento. Entrarão em fechamentos futuros conforme se
                resolvam.
              </Text>

              {data.kwhRepresadoCompensacao > 0 && (
                <View style={s.warnBox}>
                  <Text style={s.warnTitle}>
                    Aguardando compensação na fatura do cliente
                  </Text>
                  <View style={s.warnRow}>
                    <Text style={s.warnLbl}>
                      kWh injetado mas ainda não compensado
                    </Text>
                    <Text style={s.warnVal}>
                      {kwh(data.kwhRepresadoCompensacao)}
                    </Text>
                  </View>
                  <View style={s.warnRow}>
                    <Text style={s.warnLbl}>Valor estimado</Text>
                    <Text style={s.warnVal}>
                      {brl(data.valorRepresadoCompensacao)}
                    </Text>
                  </View>
                  <Text style={s.warnHint}>
                    Crédito gerado mas com ciclo de leitura defasado em relação à
                    UC do rateio. Entra no próximo ciclo da UC.
                  </Text>
                </View>
              )}

              {data.kwhRepresadoInadimplencia > 0 && (
                <View style={s.warnBox}>
                  <Text style={s.warnTitle}>
                    Aguardando pagamento do cliente (inadimplência)
                  </Text>
                  <View style={s.warnRow}>
                    <Text style={s.warnLbl}>
                      kWh já compensado mas boleto não pago
                    </Text>
                    <Text style={s.warnVal}>
                      {kwh(data.kwhRepresadoInadimplencia)}
                    </Text>
                  </View>
                  <View style={s.warnRow}>
                    <Text style={s.warnLbl}>Valor estimado</Text>
                    <Text style={s.warnVal}>
                      {brl(data.valorRepresadoInadimplencia)}
                    </Text>
                  </View>
                  {data.ucsRepresadasInadimplencia.length > 0 && (
                    <View>
                      <Text style={s.warnHint}>UCs em aberto:</Text>
                      {data.ucsRepresadasInadimplencia.map((uc, i) => (
                        <Text key={i} style={s.ucListItem}>
                          • {uc.codigoUc ?? "—"}
                          {uc.nome ? ` (${uc.nome})` : ""} — {kwh(uc.kwh)} ·{" "}
                          {brl(uc.valor)}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Observações */}
          {data.observacoes && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionBar} />
                <Text style={s.sectionTitle}>OBSERVAÇÕES</Text>
              </View>
              <View style={s.obsBox}>
                <Text style={s.obsText}>{data.observacoes}</Text>
              </View>
            </View>
          )}
        </View>
        <FooterBar />
      </Page>
    </Document>
  );
}
