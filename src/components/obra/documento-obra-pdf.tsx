import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, fmtDate, C } from "./obra-pdf-shared";

export interface DocumentoObraData {
  numeroOs: string;
  obra: {
    nome: string;
    descricao: string | null;
    responsavel: string | null;
    cliente: string | null;
    local: string | null;
    status: string;
    dataInicioPrevista: Date | null;
    dataFimPrevista: Date | null;
    observacoes: string | null;
  };
  proprietario: {
    nome: string;
    cpfCnpj: string | null;
    telefone: string | null;
    email: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    concessionaria: string | null;
    codigoUc: string | null;
  } | null;
  tecnico: {
    potenciaKwp: number | null;
    inversorMarca: string | null;
    inversorModelo: string | null;
    inversorPotencia: number | null;
    modulosMarca: string | null;
    modulosModelo: string | null;
    modulosQuantidade: number | null;
  };
  emitidoEm: Date;
}

const STATUS_LABEL: Record<string, string> = {
  PLANEJAMENTO: "Planejamento",
  EM_EXECUCAO: "Em execução",
  PAUSADA: "Pausada",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export function DocumentoObraPDF({ data }: { data: DocumentoObraData }) {
  const p = data.proprietario;
  const t = data.tecnico;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Ordem de Serviço de Obra</Text>
            <Text style={styles.headerSubtitle}>
              Nº {data.numeroOs} • Emitida em {fmtDate(data.emitidoEm)}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.brandName}>AURA</Text>
            <Text style={styles.brandInfo}>Gestão de Energia Solar</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Identificação da obra</Text>
        <View style={styles.gridRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Nome</Text>
            <Text style={styles.infoValue}>{data.obra.nome}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>
              {STATUS_LABEL[data.obra.status] ?? data.obra.status}
            </Text>
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
            <Text style={styles.infoLabel}>Previsão de execução</Text>
            <Text style={styles.infoValue}>
              {fmtDate(data.obra.dataInicioPrevista)} →{" "}
              {fmtDate(data.obra.dataFimPrevista)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Cliente / Proprietário</Text>
        <View style={styles.gridRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Nome</Text>
            <Text style={styles.infoValue}>
              {p?.nome ?? data.obra.cliente ?? "—"}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>CPF / CNPJ</Text>
            <Text style={styles.infoValue}>{p?.cpfCnpj || "—"}</Text>
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Telefone</Text>
            <Text style={styles.infoValue}>{p?.telefone || "—"}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>E-mail</Text>
            <Text style={styles.infoValue}>{p?.email || "—"}</Text>
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Endereço da obra</Text>
            <Text style={styles.infoValue}>
              {data.obra.local ||
                [p?.endereco, p?.cidade, p?.uf].filter(Boolean).join(", ") ||
                "—"}
            </Text>
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Concessionária</Text>
            <Text style={styles.infoValue}>{p?.concessionaria || "—"}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Código UC</Text>
            <Text style={styles.infoValue}>{p?.codigoUc || "—"}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Dados técnicos da instalação</Text>
        <View style={styles.gridRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Potência instalada</Text>
            <Text style={styles.infoValue}>
              {t.potenciaKwp != null ? `${t.potenciaKwp.toFixed(2)} kWp` : "—"}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Potência do inversor</Text>
            <Text style={styles.infoValue}>
              {t.inversorPotencia != null
                ? `${t.inversorPotencia.toFixed(2)} kW`
                : "—"}
            </Text>
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Inversor</Text>
            <Text style={styles.infoValue}>
              {[t.inversorMarca, t.inversorModelo].filter(Boolean).join(" ") ||
                "—"}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Módulos</Text>
            <Text style={styles.infoValue}>
              {[
                t.modulosQuantidade ? `${t.modulosQuantidade}×` : null,
                t.modulosMarca,
                t.modulosModelo,
              ]
                .filter(Boolean)
                .join(" ") || "—"}
            </Text>
          </View>
        </View>

        {(data.obra.descricao || data.obra.observacoes) && (
          <>
            <Text style={styles.sectionTitle}>Descrição / Observações</Text>
            <View
              style={[
                styles.infoBox,
                { marginBottom: 6, backgroundColor: C.grayLight },
              ]}
            >
              <Text style={{ fontSize: 9, color: C.dark, lineHeight: 1.4 }}>
                {data.obra.descricao || data.obra.observacoes || ""}
              </Text>
            </View>
          </>
        )}

        <View style={styles.signatureBlock}>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>
              Responsável técnico
            </Text>
          </View>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Cliente / Proprietário</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          AURA — Gestão de Energia Solar • Ordem de Serviço {data.numeroOs}
        </Text>
      </Page>
    </Document>
  );
}
