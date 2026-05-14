import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface MaterialItem {
  categoria: string;
  descricao: string;
  especificacao: string | null;
  quantidade: string;
}

export interface MateriaisObraData {
  obra: {
    nome: string;
    cliente: string | null;
    local: string | null;
  };
  responsavel: string | null;
  numeroSerieInversor: string | null;
  materiais: MaterialItem[];
  observacoes: string | null;
  emitidoEm: Date;
}

const C = {
  dark: "#111827",
  gray: "#6b7280",
  grayLight: "#f3f4f6",
  grayBorder: "#d1d5db",
  white: "#ffffff",
  rbsOrange: "#ef6a2b",
  rbsOrangeDark: "#c24617",
  rbsBlack: "#1a1a1a",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 28,
    fontSize: 9,
    color: C.dark,
    fontFamily: "Helvetica",
    backgroundColor: C.white,
  },

  // Header ------------------------------------------------------------------
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  brandWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBox: { flexDirection: "row", alignItems: "center" },
  logoArcTop: {
    width: 22,
    height: 10,
    backgroundColor: C.rbsOrange,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  logoArcBottom: {
    width: 22,
    height: 10,
    backgroundColor: C.rbsOrangeDark,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginTop: -1,
  },
  logoStack: { flexDirection: "column", marginRight: 6 },
  brandTextWrap: { flexDirection: "column" },
  brandRede: { fontSize: 8, fontFamily: "Helvetica", color: C.rbsBlack },
  brandBrasil: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.rbsBlack,
    lineHeight: 1,
  },
  brandSolar: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.rbsOrange,
    lineHeight: 1,
  },
  brandDivider: {
    width: 1,
    height: 22,
    backgroundColor: C.grayBorder,
    marginHorizontal: 8,
  },
  brandUnidade: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.rbsBlack,
    letterSpacing: 1,
  },
  pageNumber: { fontSize: 9, color: C.dark },

  // Title -------------------------------------------------------------------
  titleCentered: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 10,
    color: C.rbsBlack,
  },

  // Info obra (2 colunas) ---------------------------------------------------
  obraTable: {
    borderWidth: 1,
    borderColor: C.rbsBlack,
    marginBottom: 8,
  },
  obraRow: { flexDirection: "row" },
  obraCellLabel: {
    width: 90,
    padding: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
    backgroundColor: C.white,
  },
  obraCellValue: {
    flex: 1,
    padding: 6,
    fontSize: 10,
  },
  obraRowSplit: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: C.rbsBlack,
  },
  obraRightLabel: {
    width: 90,
    padding: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    borderLeftWidth: 1,
    borderLeftColor: C.rbsBlack,
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
  },
  obraRightValue: { width: 150, padding: 6, fontSize: 10 },

  // Tabela de itens ---------------------------------------------------------
  itemsHeader: {
    backgroundColor: C.white,
    padding: 6,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    borderWidth: 1,
    borderColor: C.rbsBlack,
    borderBottomWidth: 0,
  },
  table: {
    borderWidth: 1,
    borderColor: C.rbsBlack,
  },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.rbsBlack,
  },
  thCell: {
    padding: 5,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
  },
  thLast: {
    padding: 5,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.rbsBlack,
    minHeight: 22,
  },
  trLast: { flexDirection: "row", minHeight: 22 },
  td: {
    padding: 4,
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
    textAlign: "center",
  },
  tdLeft: { textAlign: "left" },
  tdLast: { padding: 4, fontSize: 9, textAlign: "center" },

  // Flex widths (somam 100)
  flItem: { flex: 22 },
  flDesc: { flex: 34 },
  flQtd: { flex: 14 },
  flSep: { flex: 15 },
  flRet: { flex: 15 },

  // Assinaturas -------------------------------------------------------------
  signBlockTitle: {
    marginTop: 12,
    padding: 5,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    borderWidth: 1,
    borderColor: C.rbsBlack,
    borderBottomWidth: 0,
  },
  signTable: { borderWidth: 1, borderColor: C.rbsBlack, marginBottom: 4 },
  signHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.rbsBlack,
  },
  signHeadCell: {
    padding: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
  },
  signHeadLast: {
    padding: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  signRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.rbsBlack,
    minHeight: 22,
  },
  signRowLast: { flexDirection: "row", minHeight: 22 },
  signCellLabel: {
    width: 100,
    padding: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
  },
  signCell: {
    flex: 1,
    padding: 4,
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
  },
  signCellLast: { flex: 1, padding: 4, fontSize: 9 },
  signColDate: { width: 90 },
  signColSign: { width: 140 },

  // Footer ------------------------------------------------------------------
  footer: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    backgroundColor: C.rbsOrange,
    paddingVertical: 6,
    textAlign: "center",
  },
  footerText: {
    fontSize: 8,
    color: C.white,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
});

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return "";
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${x.getFullYear()}`;
}

function BrandLogo() {
  return (
    <View style={s.brandWrap}>
      <View style={s.logoStack}>
        <View style={s.logoArcTop} />
        <View style={s.logoArcBottom} />
      </View>
      <View style={s.brandTextWrap}>
        <Text style={s.brandRede}>rede</Text>
        <Text style={s.brandBrasil}>BRASIL</Text>
        <Text style={s.brandSolar}>SOLAR</Text>
      </View>
      <View style={s.brandDivider} />
      <Text style={s.brandUnidade}>SANTA MARIA</Text>
    </View>
  );
}

function Header({ pageNumber }: { pageNumber: number }) {
  return (
    <View style={s.header}>
      <BrandLogo />
      <Text style={s.pageNumber}>{pageNumber}</Text>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>WWW.REDEBRASILSOLAR.COM.BR</Text>
    </View>
  );
}

export function MateriaisObraPDF({ data }: { data: MateriaisObraData }) {
  const { obra, responsavel, numeroSerieInversor, materiais, observacoes } =
    data;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header pageNumber={1} />

        <Text style={s.titleCentered}>
          ORDEM DE SEPARAÇÃO DE MATERIAL – Aluzinco – Perfil
        </Text>

        {/* Cabeçalho OBRA / RESP / Nº Série */}
        <View style={s.obraTable}>
          <View style={s.obraRow}>
            <Text style={s.obraCellLabel}>OBRA:</Text>
            <Text style={s.obraCellValue}>{obra.nome || "—"}</Text>
            <Text style={s.obraRightLabel}>RESP.</Text>
            <Text style={s.obraRightValue}>{responsavel || "—"}</Text>
          </View>
          <View style={s.obraRowSplit}>
            <Text style={s.obraCellLabel}> </Text>
            <Text style={s.obraCellValue}> </Text>
            <Text style={s.obraRightLabel}>Nº Série Inv:</Text>
            <Text style={s.obraRightValue}>{numeroSerieInversor || ""}</Text>
          </View>
        </View>

        {/* Título da tabela */}
        <Text style={s.itemsHeader}>
          MATERIAL PARA MONTAGEM DE INVERSOR E AVISOS DE SEGURANÇA
        </Text>

        {/* Tabela */}
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.thCell, s.flItem]}>ITEM</Text>
            <Text style={[s.thCell, s.flDesc]}>DESCRIÇÃO</Text>
            <Text style={[s.thCell, s.flQtd]}>QUANTIDADE</Text>
            <Text style={[s.thCell, s.flSep]}>SEPARAÇÃO</Text>
            <Text style={[s.thLast, s.flRet]}>RETORNO</Text>
          </View>

          {materiais.length === 0 ? (
            <View style={s.trLast}>
              <Text
                style={[s.tdLast, { flex: 100, color: C.gray, padding: 10 }]}
              >
                Nenhum item cadastrado.
              </Text>
            </View>
          ) : (
            materiais.map((m, i) => {
              const last = i === materiais.length - 1;
              return (
                <View key={i} style={last ? s.trLast : s.tr} wrap={false}>
                  <Text style={[s.td, s.tdLeft, s.flItem]}>{m.descricao}</Text>
                  <Text style={[s.td, s.flDesc]}>{m.especificacao || "-"}</Text>
                  <Text style={[s.td, s.flQtd]}>{m.quantidade}</Text>
                  <Text style={[s.td, s.flSep]}> </Text>
                  <Text style={[s.tdLast, s.flRet]}> </Text>
                </View>
              );
            })
          )}
        </View>

        {observacoes ? (
          <View
            style={{
              marginTop: 8,
              padding: 6,
              borderWidth: 1,
              borderColor: C.grayBorder,
            }}
          >
            <Text style={{ fontSize: 9, lineHeight: 1.4 }}>{observacoes}</Text>
          </View>
        ) : null}

        {/* Assinaturas --------------------------------------------------- */}
        <Text style={s.signBlockTitle}>CAMPO RESERVADO AOS PROJETISTAS</Text>
        <View style={s.signTable}>
          <View style={s.signHead}>
            <Text style={[s.signHeadCell, { width: 100 }]}>RESPONSÁVEL</Text>
            <Text style={[s.signHeadCell, { flex: 1 }]}>NOME</Text>
            <Text style={[s.signHeadCell, s.signColDate]}>DATA</Text>
            <Text style={[s.signHeadLast, s.signColSign]}>ASSINATURA</Text>
          </View>
          <View style={s.signRow}>
            <Text style={s.signCellLabel}>DOCUMENTO</Text>
            <Text style={s.signCell}>{responsavel || ""}</Text>
            <Text style={[s.signCell, s.signColDate]}>
              {fmtDate(data.emitidoEm)}
            </Text>
            <Text style={[s.signCellLast, s.signColSign]}> </Text>
          </View>
          <View style={s.signRowLast}>
            <Text style={s.signCellLabel}>CONFERÊNCIA</Text>
            <Text style={s.signCell}> </Text>
            <Text style={[s.signCell, s.signColDate]}> </Text>
            <Text style={[s.signCellLast, s.signColSign]}> </Text>
          </View>
        </View>

        <Text style={s.signBlockTitle}>CAMPO RESERVADO AO ESTOQUE E OBRAS</Text>
        <View style={s.signTable}>
          <View style={s.signHead}>
            <Text style={[s.signHeadCell, { width: 100 }]}>RESPONSÁVEL</Text>
            <Text style={[s.signHeadCell, { flex: 1 }]}>NOME</Text>
            <Text style={[s.signHeadCell, s.signColDate]}>DATA</Text>
            <Text style={[s.signHeadLast, s.signColSign]}>ASSINATURA</Text>
          </View>
          <View style={s.signRow}>
            <Text style={s.signCellLabel}>SEPARAÇÃO</Text>
            <Text style={s.signCell}> </Text>
            <Text style={[s.signCell, s.signColDate]}> </Text>
            <Text style={[s.signCellLast, s.signColSign]}> </Text>
          </View>
          <View style={s.signRowLast}>
            <Text style={s.signCellLabel}>RECEBIMENTO</Text>
            <Text style={s.signCell}> </Text>
            <Text style={[s.signCell, s.signColDate]}> </Text>
            <Text style={[s.signCellLast, s.signColSign]}> </Text>
          </View>
        </View>

        <Text style={s.signBlockTitle}>CAMPO RESERVADO AO FINANCEIRO</Text>
        <View style={s.signTable}>
          <View style={s.signHead}>
            <Text style={[s.signHeadCell, { width: 100 }]}>RESPONSÁVEL</Text>
            <Text style={[s.signHeadCell, { flex: 1 }]}>NOME</Text>
            <Text style={[s.signHeadCell, s.signColDate]}>DATA</Text>
            <Text style={[s.signHeadLast, s.signColSign]}>ASSINATURA</Text>
          </View>
          <View style={s.signRowLast}>
            <Text style={s.signCellLabel}>CADASTRO NA OMIE</Text>
            <Text style={s.signCell}> </Text>
            <Text style={[s.signCell, s.signColDate]}> </Text>
            <Text style={[s.signCellLast, s.signColSign]}> </Text>
          </View>
        </View>

        <Footer />
      </Page>
    </Document>
  );
}
