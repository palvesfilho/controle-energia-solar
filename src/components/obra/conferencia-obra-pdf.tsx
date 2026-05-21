import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, fmtDate, C } from "./obra-pdf-shared";

export interface ConferenciaObraData {
  obra: {
    nome: string;
    cliente: string | null;
    local: string | null;
    responsavel: string | null;
  };
  proprietarioNome: string | null;
  potenciaKwp: number | null;
  inversorPotenciaKw: number | null;
  emitidoEm: Date;
}

interface ChecklistSection {
  titulo: string;
  itens: string[];
}

const CHECKLIST: ChecklistSection[] = [
  {
    titulo: "Estrutura e fixação",
    itens: [
      "Estrutura alinhada e nivelada conforme projeto",
      "Fixação da estrutura nas telhas com vedação adequada",
      "Parafusos com torque apropriado e sem corrosão",
      "Módulos fixos na estrutura com grampos intermediários e finais",
      "Distância entre módulos conforme projeto",
    ],
  },
  {
    titulo: "Elétrica CC (string)",
    itens: [
      "Polaridade dos módulos conferida (testada por string)",
      "Tensão de circuito aberto (Voc) das strings dentro do esperado",
      "Conectores MC4 corretamente crimpados e travados",
      "Cabo solar fixo em clips ou canaletas, sem esforço mecânico",
      "Entradas de cabo com vedação (prensa-cabos / passa-muro)",
    ],
  },
  {
    titulo: "Elétrica CA e proteção",
    itens: [
      "Disjuntor CA dimensionado conforme projeto",
      "DPS instalados (CC e CA) e aterrados",
      "Aterramento contínuo (módulos, estrutura, inversor, quadro)",
      "Resistência de aterramento medida e registrada",
      "Quadro CA com identificação dos circuitos",
      "Barramento e canaletas internas organizados",
    ],
  },
  {
    titulo: "Inversor e monitoramento",
    itens: [
      "Inversor fixado em local ventilado e sombreado",
      "Parâmetros do país/concessionária configurados",
      "Wi-Fi / 4G configurado e comunicando com plataforma",
      "Geração inicial validada (primeiro kWh registrado)",
      "Login e senha de monitoramento entregues ao cliente",
    ],
  },
  {
    titulo: "Sinalização e documentação",
    itens: [
      "Placa de identificação RGE/concessionária instalada",
      "Placa \"Gerador Solar Fotovoltaico\" visível",
      "Placas de segurança (Não pisar nos módulos) aplicadas",
      "Diagrama unifilar fixado no quadro CA",
      "Cliente treinado para desligamento emergencial",
    ],
  },
  {
    titulo: "Entrega e limpeza",
    itens: [
      "Área da obra limpa e sem sobras de material",
      "Fotos da instalação finalizada arquivadas",
      "Manual do inversor e garantias entregues ao cliente",
      "Assinatura do termo de entrega pelo cliente",
    ],
  },
];

export function ConferenciaObraPDF({ data }: { data: ConferenciaObraData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Conferência de Obra</Text>
            <Text style={styles.headerSubtitle}>
              Obra: {data.obra.nome} • {fmtDate(data.emitidoEm)}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.brandName}>JECA</Text>
            <Text style={styles.brandInfo}>Gestão de Energia Solar</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Identificação</Text>
        <View style={styles.gridRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Cliente / Proprietário</Text>
            <Text style={styles.infoValue}>
              {data.proprietarioNome ?? data.obra.cliente ?? "—"}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Local</Text>
            <Text style={styles.infoValue}>{data.obra.local || "—"}</Text>
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Responsável técnico</Text>
            <Text style={styles.infoValue}>
              {data.obra.responsavel || "—"}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Potência / Inversor</Text>
            <Text style={styles.infoValue}>
              {data.potenciaKwp != null
                ? `${data.potenciaKwp.toFixed(2)} kWp`
                : "—"}
              {" / "}
              {data.inversorPotenciaKw != null
                ? `${data.inversorPotenciaKw.toFixed(2)} kW`
                : "—"}
            </Text>
          </View>
        </View>

        {CHECKLIST.map((secao) => (
          <View key={secao.titulo} style={{ marginBottom: 8 }} wrap={false}>
            <Text style={styles.sectionTitle}>{secao.titulo}</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: C.grayBorder,
                borderRadius: 3,
              }}
            >
              {secao.itens.map((item, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 5,
                    gap: 6,
                    borderBottomWidth: i === secao.itens.length - 1 ? 0 : 1,
                    borderBottomColor: C.grayBorder,
                  }}
                >
                  <View style={styles.checkbox} />
                  <Text style={styles.checklistText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Observações / Pendências</Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: C.grayBorder,
            borderRadius: 3,
            minHeight: 60,
            marginBottom: 10,
          }}
        />

        <View style={styles.signatureBlock}>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>
              Técnico responsável (conferente)
            </Text>
          </View>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Cliente (aceite)</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          JECA — Conferência de Obra • {data.obra.nome}
        </Text>
      </Page>
    </Document>
  );
}
