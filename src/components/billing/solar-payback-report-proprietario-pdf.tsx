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
  Circle,
} from "@react-pdf/renderer";
import type {
  RelatorioAgregadoData,
  RelatorioAgregadoMonthRow,
  SituacaoIndisponivel,
  SituacaoRateio,
  SituacaoRateioItem,
} from "@/lib/brasil-solar-relatorio";
import { formatCodigoUc } from "@/lib/uc-codigo";

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

function formatBRL(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatKwh(v: number | null): string {
  return v == null
    ? "—"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " kWh";
}
/**
 * Dias do ciclo de leitura do período (leitura anterior → leitura atual da
 * fatura). É a janela usada pra apurar a geração mensal; `null` quando a fatura
 * não trouxe as datas (janela = mês calendário).
 */
function diasJanela(m: RelatorioAgregadoMonthRow): number | null {
  if (m.janela.fonte !== "CICLO_LEITURA" || !m.janela.inicio || !m.janela.fim)
    return null;
  const dias = Math.round(
    (new Date(m.janela.fim).getTime() - new Date(m.janela.inicio).getTime()) /
      86_400_000,
  );
  return dias > 0 ? dias : null;
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
  tableRowTotal: {
    flexDirection: "row",
    backgroundColor: C.bgSoft,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableCell: { fontSize: 8 },
  tableCellBold: { fontSize: 8, fontWeight: 700 },
  textMuted: { color: C.gray, fontSize: 8 },

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

const NIVEL_COR: Record<SituacaoRateioItem["nivel"], string> = {
  OK: C.teal,
  ATENCAO: C.orange,
  ACAO: C.red,
};
const NIVEL_ROTULO: Record<SituacaoRateioItem["nivel"], string> = {
  OK: "tudo certo",
  ATENCAO: "acompanhar",
  ACAO: "precisa de decisão",
};

/**
 * "Situação do rateio": conclusão do relatório agregado — veredito + números do
 * grupo + itens de diagnóstico (atendimento, distribuição entre as unidades,
 * usina e leitura da concessionária). `wrap={false}` no bloco de abertura
 * mantém veredito e números juntos; os itens podem quebrar de página.
 */
/**
 * Substituto da "Situação do rateio" quando a conclusão não pôde ser apurada —
 * o relatório nunca termina sem dizer por que a análise não saiu. Texto único,
 * vindo de `explicarSituacaoRateioIndisponivel`.
 *
 * Sem emoji e sem os glifos ausentes na Helvetica embutida
 * (`feedback_pdf_helvetica_winansi_glifos`).
 */
function SituacaoIndisponivelSection({ info }: { info: SituacaoIndisponivel }) {
  return (
    <View wrap={false}>
      <Text style={s.sectionTitle}>Situação do rateio</Text>
      <View
        style={[
          s.sectionCard,
          { backgroundColor: "#FFF6EE", borderColor: C.orangeLight },
        ]}
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              marginTop: 3,
              backgroundColor: C.orange,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: C.orange,
                marginBottom: 4,
              }}
            >
              {info.titulo}
            </Text>
            <Text style={{ fontSize: 8, color: C.gray, lineHeight: 1.5 }}>
              {info.texto}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function SituacaoRateioSection({ situacao }: { situacao: SituacaoRateio }) {
  const stat = (label: string, valor: string, cor: string) => (
    <View style={{ flex: 1 }}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: 700, color: cor }}>{valor}</Text>
    </View>
  );
  return (
    <View>
      <Text style={s.sectionTitle}>Situação do rateio</Text>
      <View style={s.sectionCard}>
        <View wrap={false}>
          <Text
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: C.tealDark,
              marginBottom: 8,
            }}
          >
            {situacao.resumo}
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              paddingBottom: 8,
              marginBottom: 8,
              borderBottomWidth: 0.5,
              borderBottomColor: C.grayBorder,
            }}
          >
            {stat(
              "Consumo do grupo",
              situacao.consumoMedioTotalKwh != null
                ? `${formatKwh(situacao.consumoMedioTotalKwh)}/mês`
                : "—",
              C.orange,
            )}
            {stat(
              "Compensado",
              situacao.compensadoMedioTotalKwh != null
                ? `${formatKwh(situacao.compensadoMedioTotalKwh)}/mês`
                : "—",
              C.teal,
            )}
            {stat(
              "Cobertura",
              situacao.coberturaPct != null
                ? `${situacao.coberturaPct.toFixed(0)}%`
                : "—",
              C.tealDark,
            )}
            {stat(
              "Injetado na rede",
              situacao.injetadaMediaKwh != null
                ? `${formatKwh(situacao.injetadaMediaKwh)}/mês`
                : situacao.geracaoMediaKwh != null
                  ? `${formatKwh(situacao.geracaoMediaKwh)}/mês`
                  : "—",
              C.tealDark,
            )}
          </View>
        </View>
        {situacao.itens.map((item, i) => (
          <View
            key={`${item.tema}-${i}`}
            wrap={false}
            style={{
              flexDirection: "row",
              gap: 6,
              marginBottom: i === situacao.itens.length - 1 ? 0 : 6,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                marginTop: 2.5,
                backgroundColor: NIVEL_COR[item.nivel],
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8.5, fontWeight: 700 }}>
                {item.titulo}
                <Text
                  style={{
                    fontSize: 7,
                    color: NIVEL_COR[item.nivel],
                    fontWeight: 400,
                  }}
                >
                  {`  ·  ${NIVEL_ROTULO[item.nivel]}`}
                </Text>
              </Text>
              <Text style={{ fontSize: 8, color: C.gray, marginTop: 1 }}>
                {item.texto}
              </Text>
            </View>
          </View>
        ))}
        {/* Sem "−" (U+2212): a Helvetica do PDF não tem o glifo. */}
        <Text style={{ fontSize: 6.5, color: C.grayLight, marginTop: 6 }}>
          {`Médias dos últimos ${situacao.mesesConsiderados} meses faturados. Cobertura = energia compensada nas unidades ÷ consumo total do grupo.`}
        </Text>
      </View>
    </View>
  );
}

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

export interface SolarPaybackReportProprietarioPDFProps {
  data: RelatorioAgregadoData;
  emissao: string;
  mesRef?: RelatorioAgregadoMonthRow | null;
}

export function SolarPaybackReportProprietarioPDF({
  data,
  emissao,
  mesRef,
}: SolarPaybackReportProprietarioPDFProps) {
  // Meses que podem ser referência do relatório: o documento fala do resultado
  // do GRUPO, então precisa de fatura de beneficiária. O histórico consolidado
  // (`data.meses`) tem mais meses — inclui os que só a geradora faturou, pra
  // não perder o histórico de geração.
  const mesesComGrupo = data.meses.filter((m) => m.temFaturaBeneficiaria);
  const mes =
    mesRef ??
    (mesesComGrupo.length > 0 ? mesesComGrupo[mesesComGrupo.length - 1] : null);
  const labelMes = mes ? `${MES_LONGO[mes.mes - 1]}/${mes.ano}` : "—";
  const semMonitoramento = data.usinasMonitoradas.length === 0;
  const semFaturaTitular =
    mes == null ||
    (mes.injetadaMedidorKwh == null && mes.saldoCreditosTitular == null);
  const economiaTotal =
    data.meses.length > 0
      ? data.meses[data.meses.length - 1].economiaAcumuladaRs
      : 0;

  // Totais pra linha TOTAL da tabela de distribuição
  const totaisBeneficiarias = mes
    ? mes.beneficiarias.reduce(
        (acc, b) => ({
          consumoRedeKwh: (acc.consumoRedeKwh ?? 0) + (b.consumoRedeKwh ?? 0),
          energiaCompensadaKwh:
            (acc.energiaCompensadaKwh ?? 0) + (b.energiaCompensadaKwh ?? 0),
          economiaMensalRs:
            (acc.economiaMensalRs ?? 0) + (b.economiaMensalRs ?? 0),
          faturadoRs: (acc.faturadoRs ?? 0) + (b.faturadoRs ?? 0),
        }),
        {
          consumoRedeKwh: 0,
          energiaCompensadaKwh: 0,
          economiaMensalRs: 0,
          faturadoRs: 0,
        },
      )
    : null;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Hero */}
        <View style={s.hero}>
          <HeroBackground />
          <View style={s.heroContent}>
            <View>
              <Text style={s.heroEyebrow}>
                Relatório consolidado · {labelMes}
              </Text>
              <Text style={s.heroTitle}>{data.proprietario.nome}</Text>
              <Text style={s.heroSub}>
                {data.beneficiarias.length} beneficiária(s)
                {data.titular ? ` · Titular UC ${formatCodigoUc(data.titular.codigoUc)}` : ""}
                {data.titular?.distribuidora
                  ? ` · ${data.titular.distribuidora}`
                  : ""}
              </Text>
            </View>
            <Text style={s.heroFooter}>
              {semMonitoramento
                ? `Emissão ${emissao}`
                : `${data.usinasMonitoradas.length} usina(s) · ${data.potenciaTotalKwp.toLocaleString(
                    "pt-BR",
                    { maximumFractionDigits: 2 },
                  )} kWp instalados · Emissão ${emissao}`}
            </Text>
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
              Os campos de geração do inversor e retorno do investimento estão
              indisponíveis. Os valores de economia exibidos consideram apenas
              os créditos compensados na fatura — a economia real tende a ser
              maior.
            </Text>
          </View>
        )}

        {/* KPIs do mês de referência */}
        {mes && (
          <>
            <Text style={s.sectionTitle}>
              Resultado consolidado de {labelMes}
            </Text>
            <View style={[s.kpiRow, { flexWrap: "wrap" }]}>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Compensado total</Text>
                <Text style={[s.kpiValue, { color: C.teal, fontSize: 12 }]}>
                  {formatKwh(mes.energiaCompensadaKwhTotal)}
                </Text>
                <Text style={s.kpiSub}>
                  soma das {data.beneficiarias.length} beneficiárias
                </Text>
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Economia mensal</Text>
                <Text style={[s.kpiValue, { color: C.teal, fontSize: 12 }]}>
                  {formatBRL(mes.economiaMensalRs)}
                </Text>
                <Text style={s.kpiSub}>
                  {semMonitoramento ? "créditos compensados" : "consolidado"}
                </Text>
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Fatura RGE total</Text>
                <Text
                  style={[s.kpiValue, { color: C.tealDark, fontSize: 12 }]}
                >
                  {formatBRL(mes.faturadoRs)}
                </Text>
                <Text style={s.kpiSub}>soma das beneficiárias</Text>
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Sem energia solar</Text>
                <Text style={[s.kpiValue, { color: C.orange, fontSize: 12 }]}>
                  {formatBRL(mes.contaSemSolarRsTotal)}
                </Text>
                <Text style={s.kpiSub}>quanto pagariam sem a usina</Text>
              </View>
              <View
                style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
              >
                <Text style={s.kpiLabel}>Consumo total</Text>
                <Text style={[s.kpiValue, { color: C.orange, fontSize: 12 }]}>
                  {formatKwh(mes.consumoRedeKwhTotal)}
                </Text>
                <Text style={s.kpiSub}>rede (kWh)</Text>
              </View>
              {!semMonitoramento && (
                <View
                  style={[s.kpiCard, { minWidth: "23%", marginBottom: 4 }]}
                >
                  <Text style={s.kpiLabel}>Geração da usina</Text>
                  <Text style={[s.kpiValue, { color: C.teal, fontSize: 12 }]}>
                    {formatKwh(mes.geracaoInversorKwh)}
                  </Text>
                  <Text style={s.kpiSub}>do inversor</Text>
                </View>
              )}
            </View>

            {/* Dados da UC titular */}
            <Text style={s.sectionTitle}>
              Usina (UC titular
              {data.titular ? ` ${formatCodigoUc(data.titular.codigoUc)}` : ""})
            </Text>
            {semFaturaTitular && (
              <Text
                style={{
                  fontSize: 8,
                  color: C.gray,
                  fontStyle: "italic",
                  marginBottom: 4,
                }}
              >
                Fatura da UC titular ainda não cadastrada — dados de injeção e
                saldo de créditos serão preenchidos quando ela for enviada ao
                sistema.
              </Text>
            )}
            <View style={s.kpiRow}>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Energia gerada</Text>
                <Text style={[s.kpiValue, { color: C.teal, fontSize: 12 }]}>
                  {formatKwh(mes.geracaoInversorKwh)}
                </Text>
                <Text style={s.kpiSub}>inversor — total do período</Text>
              </View>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Energia injetada na rede</Text>
                <Text style={[s.kpiValue, { color: C.tealDark, fontSize: 12 }]}>
                  {formatKwh(mes.injetadaMedidorKwh)}
                </Text>
                <Text style={s.kpiSub}>fatura da titular</Text>
              </View>
              <View style={s.kpiCard}>
                <Text style={s.kpiLabel}>Saldo de créditos</Text>
                <Text style={[s.kpiValue, { color: C.orange, fontSize: 12 }]}>
                  {formatKwh(mes.saldoCreditosTitular)}
                </Text>
                <Text style={s.kpiSub}>GD acumulado na titular</Text>
              </View>
            </View>

            {/* Distribuição entre beneficiárias */}
            <Text style={s.sectionTitle}>
              Distribuição entre beneficiárias — {labelMes}
            </Text>
            <View style={s.sectionCard}>
              <View style={s.tableHead}>
                <Text style={[s.tableHeadCell, { flex: 2.4 }]}>UC</Text>
                <Text style={[s.tableHeadCell, { flex: 0.7, textAlign: "right" }]}>
                  Rateio
                </Text>
                <Text style={[s.tableHeadCell, { flex: 1.2, textAlign: "right" }]}>
                  Consumo
                </Text>
                <Text style={[s.tableHeadCell, { flex: 1.2, textAlign: "right" }]}>
                  Compensado
                </Text>
                <Text style={[s.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>
                  Economia
                </Text>
                <Text style={[s.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>
                  Fatura RGE
                </Text>
              </View>
              {mes.beneficiarias.map((b) => (
                <View key={b.ucId} style={s.tableRow}>
                  <View style={{ flex: 2.4 }}>
                    <Text style={s.tableCellBold}>{b.nome}</Text>
                    <Text style={s.textMuted}>UC {formatCodigoUc(b.codigoUc)}</Text>
                  </View>
                  <Text style={[s.tableCell, { flex: 0.7, textAlign: "right" }]}>
                    {b.percentual.toFixed(0)}%
                  </Text>
                  <Text style={[s.tableCell, { flex: 1.2, textAlign: "right" }]}>
                    {formatKwh(b.consumoRedeKwh)}
                  </Text>
                  <Text style={[s.tableCell, { flex: 1.2, textAlign: "right" }]}>
                    {formatKwh(b.energiaCompensadaKwh)}
                  </Text>
                  <Text
                    style={[s.tableCellBold, { flex: 1.4, textAlign: "right", color: C.teal }]}
                  >
                    {formatBRL(b.economiaMensalRs)}
                  </Text>
                  <Text style={[s.tableCell, { flex: 1.4, textAlign: "right" }]}>
                    {formatBRL(b.faturadoRs)}
                  </Text>
                </View>
              ))}
              {totaisBeneficiarias && (
                <View style={s.tableRowTotal}>
                  <Text style={[s.tableCellBold, { flex: 2.4 }]}>TOTAL</Text>
                  <Text style={[s.tableCellBold, { flex: 0.7, textAlign: "right" }]}>
                    100%
                  </Text>
                  <Text style={[s.tableCellBold, { flex: 1.2, textAlign: "right" }]}>
                    {formatKwh(totaisBeneficiarias.consumoRedeKwh)}
                  </Text>
                  <Text style={[s.tableCellBold, { flex: 1.2, textAlign: "right" }]}>
                    {formatKwh(totaisBeneficiarias.energiaCompensadaKwh)}
                  </Text>
                  <Text
                    style={[s.tableCellBold, { flex: 1.4, textAlign: "right", color: C.teal }]}
                  >
                    {formatBRL(totaisBeneficiarias.economiaMensalRs)}
                  </Text>
                  <Text style={[s.tableCellBold, { flex: 1.4, textAlign: "right" }]}>
                    {formatBRL(totaisBeneficiarias.faturadoRs)}
                  </Text>
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
            {/* Meses que geraram economia (com fatura de beneficiária) — não o
                tamanho do histórico, que inclui meses só da geradora. */}
            <Text style={s.kpiSub}>{mesesComGrupo.length} mês(es) desde a operação</Text>
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
        </View>

        {/* Tabela mês a mês — agregada */}
        {data.meses.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Histórico consolidado por mês</Text>
            <View style={s.sectionCard}>
              <View style={s.tableHead}>
                <Text style={[s.tableHeadCell, { flex: 1.1 }]}>Mês</Text>
                {!semMonitoramento && (
                  <Text style={[s.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>
                    Geração mensal
                  </Text>
                )}
                <Text style={[s.tableHeadCell, { flex: 1.3, textAlign: "right" }]}>
                  Consumo total
                </Text>
                <Text style={[s.tableHeadCell, { flex: 1.3, textAlign: "right" }]}>
                  Compensado
                </Text>
                <Text style={[s.tableHeadCell, { flex: 1.5, textAlign: "right" }]}>
                  Economia
                </Text>
                <Text style={[s.tableHeadCell, { flex: 1.5, textAlign: "right" }]}>
                  Fatura RGE
                </Text>
              </View>
              {/* Mais recente primeiro. Cópia com reverse pra não mutar data.meses. */}
              {[...data.meses].reverse().map((m) => (
                <View key={`${m.ano}-${m.mes}`} style={s.tableRow}>
                  <View style={{ flex: 1.1 }}>
                    <Text style={s.tableCell}>
                      {MES_ABREV[m.mes - 1]}/{m.ano}
                    </Text>
                    {!semMonitoramento && diasJanela(m) != null && (
                      <Text style={{ fontSize: 6.5, color: C.grayLight }}>
                        {diasJanela(m)} dias
                      </Text>
                    )}
                  </View>
                  {!semMonitoramento && (
                    <Text
                      style={[
                        s.tableCellBold,
                        { flex: 1.4, textAlign: "right", color: C.teal },
                      ]}
                    >
                      {formatKwh(m.geracaoInversorKwh)}
                    </Text>
                  )}
                  <Text style={[s.tableCell, { flex: 1.3, textAlign: "right" }]}>
                    {formatKwh(m.consumoRedeKwhTotal)}
                  </Text>
                  <Text style={[s.tableCell, { flex: 1.3, textAlign: "right" }]}>
                    {formatKwh(m.energiaCompensadaKwhTotal)}
                  </Text>
                  <Text
                    style={[s.tableCellBold, { flex: 1.5, textAlign: "right", color: C.teal }]}
                  >
                    {formatBRL(m.economiaMensalRs)}
                    {m.economiaEstimada ? "*" : ""}
                  </Text>
                  <Text style={[s.tableCell, { flex: 1.5, textAlign: "right" }]}>
                    {formatBRL(m.faturadoRs)}
                  </Text>
                </View>
              ))}
              {/* Metodologia — o cliente confere a conta na mão.
                  Sem "−" (U+2212): a fonte Helvetica do PDF não tem esse glifo
                  e ele sai invisível; usar hífen ASCII. */}
              <Text style={{ fontSize: 6.5, color: C.gray, marginTop: 6 }}>
                {"Economia = conta sem energia solar - fatura paga à concessionária (créditos compensados em R$, somados nas beneficiárias)." +
                  (semMonitoramento
                    ? ""
                    : " Geração mensal apurada no intervalo entre a leitura anterior e a leitura atual informadas na fatura.")}
              </Text>
              {data.meses.some((m) => m.economiaEstimada) && (
                <Text style={{ fontSize: 6.5, color: C.orange, marginTop: 2 }}>
                  * Mês sem o detalhamento em R$ na fatura — economia estimada
                  pelos kWh compensados × tarifa.
                </Text>
              )}
            </View>
          </>
        )}

        {/* Situação do rateio — conclusão automática (atendimento do grupo,
            distribuição entre as unidades, usina e leitura da concessionária).
            Fecha o relatório, logo abaixo do histórico consolidado. */}
        {data.situacao ? (
          <SituacaoRateioSection situacao={data.situacao} />
        ) : data.situacaoIndisponivel ? (
          <SituacaoIndisponivelSection info={data.situacaoIndisponivel} />
        ) : null}

        <View style={s.footer} fixed>
          <Text>
            {data.proprietario.nome}
            {data.titular ? ` · Titular UC ${formatCodigoUc(data.titular.codigoUc)}` : ""}
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
