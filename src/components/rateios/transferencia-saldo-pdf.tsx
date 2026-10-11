import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DocumentoRge } from "@/lib/transferencia-creditos";

/**
 * "Solicitação de Transferência de Saldo da Unidade Consumidora" — o formulário
 * que vai por email à RGE (microgeracaorge@cpfl.com.br) depois que o contrato da
 * geradora é encerrado. Texto e ordem seguem o modelo que a RGE aceitou em
 * 30/01/2026 (ALEXANDRE DALLA PASQUA → SUBWAY).
 *
 * Sai sem a logomarca da RGE e com a assinatura em branco: o titular assina
 * antes de enviar.
 *
 * Só glifos do WinAnsi: a Helvetica do @react-pdf deixa INVISÍVEL o que estiver
 * fora dele.
 */

export const EMAIL_MICROGERACAO_RGE = "microgeracaorge@cpfl.com.br";

const s = StyleSheet.create({
  page: { paddingTop: 70, paddingBottom: 60, paddingHorizontal: 56, fontSize: 10.5, fontFamily: "Helvetica", color: "#000000" },
  titulo: { fontFamily: "Helvetica-Bold", fontSize: 12, textAlign: "center", marginBottom: 18 },
  intro: { fontFamily: "Helvetica-Bold", lineHeight: 1.4, marginBottom: 20 },
  linha: { marginBottom: 36 },
  negrito: { fontFamily: "Helvetica-Bold" },
  tabela: { alignSelf: "center", width: 260, borderWidth: 1, borderColor: "#000000", marginBottom: 36 },
  tr: { flexDirection: "row", borderTopWidth: 1, borderColor: "#000000" },
  th: { flexDirection: "row", backgroundColor: "#c8c8c8" },
  c1: { flex: 3, paddingVertical: 4, textAlign: "center", borderRightWidth: 1, borderColor: "#000000" },
  c2: { flex: 1, paddingVertical: 4, textAlign: "center" },
  regras: { marginLeft: 12, marginBottom: 24 },
  regra: { flexDirection: "row", marginBottom: 3 },
  ponto: { width: 14 },
  regraTexto: { flex: 1, fontFamily: "Helvetica-Bold", lineHeight: 1.3 },
  campo: { marginBottom: 16 },
  assinatura: { flexDirection: "row", alignItems: "flex-end", marginBottom: 16, marginTop: 6 },
  traco: { flex: 1, marginLeft: 8, borderBottomWidth: 1, borderColor: "#000000", height: 40, maxWidth: 240 },
});

export function TransferenciaSaldoPDF({ doc, data }: { doc: DocumentoRge; data: string }) {
  const regras = [
    "Utilizar no máximo 2 (duas) casas decimais para os percentuais.",
    "Observar que a soma dos percentuais deverá sempre somar 100,00%.",
    `Este formulário deverá ser enviado para o e-mail ${EMAIL_MICROGERACAO_RGE}.`,
    "O prazo de atendimento é de 30 dias.",
  ];
  return (
    <Document title="Solicitação de Transferência de Saldo da Unidade Consumidora">
      <Page size="A4" style={s.page}>
        <Text style={s.titulo}>SOLICITAÇÃO DE TRANSFERÊNCIA DE SALDO DA UNIDADE CONSUMIDORA</Text>
        <Text style={s.intro}>
          Venho por meio deste, solicitar a transferência do saldo da unidade doadora cujo contrato foi encerrado, para
          a(s) unidade(s) favorecida(s) abaixo listadas:
        </Text>
        <Text style={s.linha}>
          Unidade Consumidora <Text style={s.negrito}>Doadora {doc.doadora}</Text> com contrato encerrado junto à RGE:
        </Text>

        <View style={s.tabela}>
          <View style={s.th}>
            <Text style={[s.c1, s.negrito]}>Unidade(s) Favorecida(s)</Text>
            <Text style={[s.c2, s.negrito]}>(%)</Text>
          </View>
          {doc.favorecidas.map((f) => (
            <View key={f.codigo} style={s.tr} wrap={false}>
              <Text style={s.c1}>{f.codigo}</Text>
              <Text style={s.c2}>{f.percentual}</Text>
            </View>
          ))}
        </View>

        <View style={s.regras}>
          {regras.map((r) => (
            <View key={r} style={s.regra}>
              <Text style={s.ponto}>•</Text>
              <Text style={s.regraTexto}>{r}</Text>
            </View>
          ))}
        </View>

        <View wrap={false}>
          <Text style={s.campo}>Nome do titular: {doc.titularNome}</Text>
          <Text style={s.campo}>E-mail do titular: {doc.titularEmail}</Text>
          <View style={s.assinatura}>
            <Text style={s.negrito}>ASSINATURA DO TITULAR:</Text>
            <View style={s.traco} />
          </View>
          <Text>Data: {data}</Text>
        </View>
      </Page>
    </Document>
  );
}
