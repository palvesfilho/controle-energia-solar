/* eslint-disable jsx-a11y/alt-text -- o `Image` aqui é o do @react-pdf/renderer,
   que desenha no PDF e não aceita `alt`; a regra é para o <img> do DOM. */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

/**
 * Comprovante de retirada de material — 2º PDF da Lista de Materiais, emitido
 * quando o gestor de obras fecha a retirada. Registra o que foi de fato
 * separado (quantidade pedida x separada), a equipe que veio buscar, quem
 * retirou, as duas assinaturas a mão livre e as fotos dos materiais.
 *
 * Sem glifos fora do WinAnsi: a Helvetica do @react-pdf não desenha sinais como
 * o menos matemático ou setas, e o caractere sai INVISÍVEL. Só ASCII e acentos
 * latinos aqui.
 */

export interface ComprovanteItem {
  descricao: string;
  especificacao: string | null;
  quantidade: string;
  quantidadeSeparada: string | null;
  separado: boolean;
}

export interface ComprovanteRetiradaData {
  obra: { nome: string; cliente: string | null; local: string | null };
  responsavel: string | null;
  numeroSerieInversor: string | null;
  itens: ComprovanteItem[];
  observacoes: string | null;
  observacoesSeparacao: string | null;
  equipeNome: string | null;
  retiradoPor: string | null;
  assinaturaEntregouNome: string | null;
  assinaturaEntregouData: string | null;
  assinaturaRetirouNome: string | null;
  assinaturaRetirouData: string | null;
  /** Fotos já convertidas em data URL pelo servidor. */
  fotos: string[];
  /** Quantas fotos existem além das embutidas (0 quando todas couberam). */
  fotosNaoEmbutidas: number;
  liberadaEm: Date | null;
  retiradaEm: Date;
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
  green: "#047857",
  red: "#b91c1c",
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  brandWrap: { flexDirection: "row", alignItems: "center" },
  logoStack: { flexDirection: "column", marginRight: 6 },
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
  brandTextWrap: { flexDirection: "column" },
  brandRede: { fontSize: 8, color: C.rbsBlack },
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

  titleCentered: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 2,
    color: C.rbsBlack,
  },
  subtitle: {
    fontSize: 8,
    textAlign: "center",
    color: C.gray,
    marginBottom: 10,
  },

  infoTable: { borderWidth: 1, borderColor: C.rbsBlack, marginBottom: 8 },
  infoRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.rbsBlack,
  },
  infoRowLast: { flexDirection: "row" },
  infoLabel: {
    width: 95,
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    backgroundColor: C.grayLight,
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
  },
  infoValue: { flex: 1, padding: 5, fontSize: 9 },
  infoLabel2: {
    width: 95,
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    backgroundColor: C.grayLight,
    borderLeftWidth: 1,
    borderLeftColor: C.rbsBlack,
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
  },

  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    backgroundColor: C.rbsOrangeDark,
    padding: 4,
    marginTop: 10,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  table: { borderWidth: 1, borderColor: C.rbsBlack },
  thead: { flexDirection: "row", backgroundColor: C.grayLight },
  th: {
    padding: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    borderRightWidth: 1,
    borderRightColor: C.rbsBlack,
    textAlign: "center",
  },
  thLast: {
    padding: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.grayBorder },
  td: {
    padding: 4,
    fontSize: 8,
    borderRightWidth: 1,
    borderRightColor: C.grayBorder,
    textAlign: "center",
  },
  tdLast: { padding: 4, fontSize: 8, textAlign: "center" },
  tdLeft: { textAlign: "left" },
  flItem: { flex: 3 },
  flEspec: { flex: 3 },
  flQtd: { width: 55 },
  flSep: { width: 55 },
  flOk: { width: 42 },

  signGrid: { flexDirection: "row", gap: 10, marginTop: 6 },
  signBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.rbsBlack,
    padding: 6,
  },
  signTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.rbsOrangeDark,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  signImageBox: {
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: C.rbsBlack,
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 4,
  },
  signImage: { height: 56, objectFit: "contain" },
  signVazio: { fontSize: 8, color: C.gray, marginBottom: 4 },
  signNome: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  signPapel: { fontSize: 7, color: C.gray },

  fotoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fotoBox: {
    width: 165,
    height: 124,
    borderWidth: 1,
    borderColor: C.grayBorder,
  },
  foto: { width: "100%", height: "100%", objectFit: "cover" },

  obsBox: {
    borderWidth: 1,
    borderColor: C.grayBorder,
    padding: 6,
    marginTop: 4,
  },

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

function fmtDataHora(d: Date | null | undefined): string {
  if (!d) return "-";
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return "-";
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const hh = String(x.getHours()).padStart(2, "0");
  const mi = String(x.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${x.getFullYear()} ${hh}:${mi}`;
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

function Assinatura({
  titulo,
  papel,
  nome,
  imagem,
}: {
  titulo: string;
  papel: string;
  nome: string | null;
  imagem: string | null;
}) {
  return (
    <View style={s.signBox}>
      <Text style={s.signTitle}>{titulo}</Text>
      <View style={s.signImageBox}>
        {imagem ? (
          <Image style={s.signImage} src={imagem} />
        ) : (
          <Text style={s.signVazio}>(sem assinatura)</Text>
        )}
      </View>
      <Text style={s.signNome}>{nome || "-"}</Text>
      <Text style={s.signPapel}>{papel}</Text>
    </View>
  );
}

export function ComprovanteRetiradaPDF({
  data,
}: {
  data: ComprovanteRetiradaData;
}) {
  const {
    obra,
    responsavel,
    numeroSerieInversor,
    itens,
    observacoes,
    observacoesSeparacao,
    equipeNome,
    retiradoPor,
    fotos,
    fotosNaoEmbutidas,
    liberadaEm,
    retiradaEm,
  } = data;

  const separados = itens.filter((i) => i.separado).length;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <BrandLogo />
          <Text style={{ fontSize: 9 }}>{fmtDataHora(retiradaEm)}</Text>
        </View>

        <Text style={s.titleCentered}>COMPROVANTE DE RETIRADA DE MATERIAL</Text>
        <Text style={s.subtitle}>
          Lista liberada em {fmtDataHora(liberadaEm)} - retirada fechada em{" "}
          {fmtDataHora(retiradaEm)}
        </Text>

        <View style={s.infoTable}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>OBRA</Text>
            <Text style={s.infoValue}>{obra.nome || "-"}</Text>
            <Text style={s.infoLabel2}>RESP.</Text>
            <Text style={s.infoValue}>{responsavel || "-"}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>CLIENTE</Text>
            <Text style={s.infoValue}>{obra.cliente || "-"}</Text>
            <Text style={s.infoLabel2}>LOCAL</Text>
            <Text style={s.infoValue}>{obra.local || "-"}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>EQUIPE</Text>
            <Text style={s.infoValue}>{equipeNome || "-"}</Text>
            <Text style={s.infoLabel2}>RETIRADO POR</Text>
            <Text style={s.infoValue}>{retiradoPor || "-"}</Text>
          </View>
          <View style={s.infoRowLast}>
            <Text style={s.infoLabel}>N. SERIE INV.</Text>
            <Text style={s.infoValue}>{numeroSerieInversor || "-"}</Text>
            <Text style={s.infoLabel2}>ITENS</Text>
            <Text style={s.infoValue}>
              {separados} de {itens.length} conferidos
            </Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Materiais separados</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, s.flItem]}>ITEM</Text>
            <Text style={[s.th, s.flEspec]}>ESPECIFICACAO</Text>
            <Text style={[s.th, s.flQtd]}>PEDIDO</Text>
            <Text style={[s.th, s.flSep]}>SEPARADO</Text>
            <Text style={[s.thLast, s.flOk]}>OK</Text>
          </View>
          {itens.length === 0 ? (
            <View style={s.tr}>
              <Text style={[s.tdLast, { flex: 1, padding: 10, color: C.gray }]}>
                Nenhum item na lista.
              </Text>
            </View>
          ) : (
            itens.map((it, i) => {
              const qtdSep = it.quantidadeSeparada ?? it.quantidade;
              const divergiu =
                (it.quantidadeSeparada ?? "").trim().length > 0 &&
                it.quantidadeSeparada !== it.quantidade;
              return (
                <View key={i} style={s.tr} wrap={false}>
                  <Text style={[s.td, s.tdLeft, s.flItem]}>{it.descricao}</Text>
                  <Text style={[s.td, s.tdLeft, s.flEspec]}>
                    {it.especificacao || "-"}
                  </Text>
                  <Text style={[s.td, s.flQtd]}>{it.quantidade}</Text>
                  <Text
                    style={[
                      s.td,
                      s.flSep,
                      divergiu
                        ? { color: C.red, fontFamily: "Helvetica-Bold" }
                        : {},
                    ]}
                  >
                    {qtdSep}
                  </Text>
                  <Text
                    style={[
                      s.tdLast,
                      s.flOk,
                      it.separado
                        ? { color: C.green, fontFamily: "Helvetica-Bold" }
                        : { color: C.red },
                    ]}
                  >
                    {it.separado ? "X" : "-"}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {observacoes || observacoesSeparacao ? (
          <View style={s.obsBox}>
            {observacoes ? (
              <Text style={{ fontSize: 8, lineHeight: 1.4 }}>
                Lista: {observacoes}
              </Text>
            ) : null}
            {observacoesSeparacao ? (
              <Text style={{ fontSize: 8, lineHeight: 1.4, marginTop: 2 }}>
                Separacao: {observacoesSeparacao}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={s.sectionTitle}>Assinaturas</Text>
        <View style={s.signGrid}>
          <Assinatura
            titulo="Quem entregou"
            papel="Separacao / estoque - Rede Brasil Solar"
            nome={data.assinaturaEntregouNome}
            imagem={data.assinaturaEntregouData}
          />
          <Assinatura
            titulo="Quem retirou"
            papel={
              equipeNome
                ? `Equipe de instalacao - ${equipeNome}`
                : "Equipe de instalacao"
            }
            nome={data.assinaturaRetirouNome || retiradoPor}
            imagem={data.assinaturaRetirouData}
          />
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>WWW.REDEBRASILSOLAR.COM.BR</Text>
        </View>
      </Page>

      {fotos.length > 0 ? (
        <Page size="A4" style={s.page}>
          <View style={s.header}>
            <BrandLogo />
            <Text style={{ fontSize: 9 }}>{obra.nome}</Text>
          </View>
          <Text style={s.sectionTitle}>Fotos dos materiais separados</Text>
          <View style={s.fotoGrid}>
            {fotos.map((src, i) => (
              <View key={i} style={s.fotoBox}>
                <Image style={s.foto} src={src} />
              </View>
            ))}
          </View>
          {fotosNaoEmbutidas > 0 ? (
            <Text style={{ fontSize: 8, color: C.gray, marginTop: 8 }}>
              Mais {fotosNaoEmbutidas} foto(s) anexada(s) ficaram apenas no
              sistema, na tela da lista de materiais desta obra.
            </Text>
          ) : null}
          <View style={s.footer} fixed>
            <Text style={s.footerText}>WWW.REDEBRASILSOLAR.COM.BR</Text>
          </View>
        </Page>
      ) : null}
    </Document>
  );
}
