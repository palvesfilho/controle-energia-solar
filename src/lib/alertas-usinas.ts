import { prisma } from "@/lib/prisma";

export type TipoAlerta =
  | "BAIXA_GERACAO"
  | "OFFLINE"
  | "TENSAO_FORA"
  | "TEMPERATURA_INVERSOR"
  | "FREQUENCIA_REDE"
  | "CONTRATO_PROXIMO_VENCIMENTO"
  | "CONTRATO_VENCIDO";
export type Severidade = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";

export type AcaoRequerida =
  | "IR_EM_CAMPO"
  | "VERIFICAR_REMOTO"
  | "CONTATAR_CLIENTE"
  | "CONTATAR_CONCESSIONARIA"
  | "MONITORAR";

export const ACOES_REQUERIDAS: AcaoRequerida[] = [
  "IR_EM_CAMPO",
  "VERIFICAR_REMOTO",
  "CONTATAR_CLIENTE",
  "CONTATAR_CONCESSIONARIA",
  "MONITORAR",
];

export const ACAO_REQUERIDA_LABEL: Record<AcaoRequerida, string> = {
  IR_EM_CAMPO: "Ir em campo",
  VERIFICAR_REMOTO: "Verificar remoto",
  CONTATAR_CLIENTE: "Contatar cliente",
  CONTATAR_CONCESSIONARIA: "Contatar concessionária",
  MONITORAR: "Monitorar",
};

// Mapeamento default tipo→ação aplicado na criação automática de alertas.
// Operador pode sobrescrever depois pelo card na página de erros.
const DEFAULT_ACAO_POR_TIPO: Record<string, AcaoRequerida> = {
  OFFLINE: "VERIFICAR_REMOTO",
  BAIXA_GERACAO: "VERIFICAR_REMOTO",
  ERRO_INVERSOR: "IR_EM_CAMPO",
  TEMPERATURA_INVERSOR: "IR_EM_CAMPO",
  TENSAO_FORA: "CONTATAR_CONCESSIONARIA",
  FREQUENCIA_REDE: "CONTATAR_CONCESSIONARIA",
  CONSUMO_ELEVADO: "CONTATAR_CLIENTE",
  FATURA_IRREGULAR: "CONTATAR_CLIENTE",
  MANUTENCAO: "MONITORAR",
  CONTRATO_PROXIMO_VENCIMENTO: "CONTATAR_CLIENTE",
  CONTRATO_VENCIDO: "CONTATAR_CLIENTE",
};

export function getAcaoRequeridaDefault(tipo: string): AcaoRequerida | null {
  return DEFAULT_ACAO_POR_TIPO[tipo] ?? null;
}

export interface ThresholdConfig {
  tipo: TipoAlerta;
  enabled: boolean;
  thresholdCritico: number | null;
  thresholdMedio: number | null;
  thresholdBaixo: number | null;
  severidadeDefault: Severidade | null;
}

// Defaults aplicados quando não há registro na tabela AlertaThreshold.
// BAIXA_GERACAO: PR% (geração real ÷ esperada). PR ≤ critico = CRITICA; PR ≤ medio = MEDIA.
// TENSAO_FORA: desvio % absoluto contra tensão nominal. ≥ critico = CRITICA; ≥ medio = MEDIA; ≥ baixo = BAIXA.
// OFFLINE: severidade fixa configurável (detecção baseada em ultimaLeitura > 48h).
export const DEFAULT_THRESHOLDS: Record<TipoAlerta, ThresholdConfig> = {
  BAIXA_GERACAO: {
    tipo: "BAIXA_GERACAO",
    enabled: true,
    thresholdCritico: 80,
    thresholdMedio: 90,
    thresholdBaixo: null,
    severidadeDefault: null,
  },
  OFFLINE: {
    tipo: "OFFLINE",
    enabled: true,
    thresholdCritico: null,
    thresholdMedio: null,
    thresholdBaixo: null,
    severidadeDefault: "CRITICA",
  },
  TENSAO_FORA: {
    tipo: "TENSAO_FORA",
    enabled: true,
    thresholdCritico: 20,
    thresholdMedio: 10,
    thresholdBaixo: 5,
    severidadeDefault: null,
  },
  // Temperatura em °C. Inversores derradam tipicamente acima de 65°C e desligam acima de 75-80°C.
  TEMPERATURA_INVERSOR: {
    tipo: "TEMPERATURA_INVERSOR",
    enabled: true,
    thresholdCritico: 75,
    thresholdMedio: 65,
    thresholdBaixo: null,
    severidadeDefault: null,
  },
  // Frequência da rede em Hz. No Brasil, nominal = 60Hz. Limites operacionais: 57,5–62 Hz (anti-ilhamento).
  // Config expressa como desvio absoluto em Hz em relação a 60.
  FREQUENCIA_REDE: {
    tipo: "FREQUENCIA_REDE",
    enabled: true,
    thresholdCritico: 2.0,
    thresholdMedio: 1.0,
    thresholdBaixo: 0.5,
    severidadeDefault: null,
  },
  CONTRATO_PROXIMO_VENCIMENTO: {
    tipo: "CONTRATO_PROXIMO_VENCIMENTO",
    enabled: true,
    thresholdCritico: null,
    thresholdMedio: null,
    thresholdBaixo: null,
    severidadeDefault: "MEDIA",
  },
  CONTRATO_VENCIDO: {
    tipo: "CONTRATO_VENCIDO",
    enabled: true,
    thresholdCritico: null,
    thresholdMedio: null,
    thresholdBaixo: null,
    severidadeDefault: "ALTA",
  },
};

export const TIPOS_ALERTA: TipoAlerta[] = [
  "BAIXA_GERACAO",
  "OFFLINE",
  "TENSAO_FORA",
  "TEMPERATURA_INVERSOR",
  "FREQUENCIA_REDE",
  "CONTRATO_PROXIMO_VENCIMENTO",
  "CONTRATO_VENCIDO",
];
export const SEVERIDADES: Severidade[] = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];

const TIPO_META: Record<TipoAlerta, { label: string; descricao: string }> = {
  BAIXA_GERACAO: {
    label: "Geração abaixo do esperado",
    descricao:
      "Dispara quando a geração da usina cai abaixo do percentual configurado em relação à expectativa.",
  },
  OFFLINE: {
    label: "Inversor desconectado",
    descricao:
      "Dispara quando o inversor não envia dados há mais de 48 horas.",
  },
  TENSAO_FORA: {
    label: "Tensão da concessionária fora dos parâmetros",
    descricao:
      "Dispara quando a tensão da rede desvia da nominal (127V ou 220V) em % absoluto.",
  },
  TEMPERATURA_INVERSOR: {
    label: "Temperatura do inversor elevada",
    descricao:
      "Dispara quando a temperatura interna do inversor ultrapassa os limites configurados (em °C).",
  },
  FREQUENCIA_REDE: {
    label: "Frequência da rede fora do nominal",
    descricao:
      "Dispara conforme o desvio da frequência em relação a 60Hz (em Hz absolutos).",
  },
  CONTRATO_PROXIMO_VENCIMENTO: {
    label: "Plano de monitoramento próximo do vencimento",
    descricao:
      "Dispara quando faltam 30 dias ou menos pro fim do plano de monitoramento pago.",
  },
  CONTRATO_VENCIDO: {
    label: "Plano de monitoramento vencido",
    descricao:
      "Dispara quando o plano de monitoramento pago já venceu sem renovação.",
  },
};

export function getTipoMeta(tipo: TipoAlerta) {
  return TIPO_META[tipo];
}

export async function getThresholds(): Promise<Record<TipoAlerta, ThresholdConfig>> {
  const rows = await prisma.alertaThreshold.findMany();
  const byTipo = new Map(rows.map((r) => [r.tipo as TipoAlerta, r]));

  const result = {} as Record<TipoAlerta, ThresholdConfig>;
  for (const tipo of TIPOS_ALERTA) {
    const row = byTipo.get(tipo);
    if (row) {
      result[tipo] = {
        tipo,
        enabled: row.enabled,
        thresholdCritico: row.thresholdCritico,
        thresholdMedio: row.thresholdMedio,
        thresholdBaixo: row.thresholdBaixo,
        severidadeDefault: row.severidadeDefault as Severidade | null,
      };
    } else {
      result[tipo] = DEFAULT_THRESHOLDS[tipo];
    }
  }
  return result;
}

// Classificação de PR (performance ratio, em %). Retorna null quando não dispara.
export function classifyBaixaGeracao(
  pr: number,
  cfg: ThresholdConfig
): Severidade | null {
  if (!cfg.enabled) return null;
  if (cfg.thresholdCritico != null && pr <= cfg.thresholdCritico) return "CRITICA";
  if (cfg.thresholdMedio != null && pr <= cfg.thresholdMedio) return "MEDIA";
  return null;
}

// Classificação de desvio de tensão em % absoluto. Retorna null quando não dispara.
export function classifyTensaoFora(
  desvioPct: number,
  cfg: ThresholdConfig
): Severidade | null {
  if (!cfg.enabled) return null;
  const abs = Math.abs(desvioPct);
  if (cfg.thresholdCritico != null && abs >= cfg.thresholdCritico) return "CRITICA";
  if (cfg.thresholdMedio != null && abs >= cfg.thresholdMedio) return "MEDIA";
  if (cfg.thresholdBaixo != null && abs >= cfg.thresholdBaixo) return "BAIXA";
  return null;
}

// Temperatura em °C. ≥ critico = CRITICA; ≥ medio = MEDIA.
export function classifyTemperatura(
  tempC: number,
  cfg: ThresholdConfig
): Severidade | null {
  if (!cfg.enabled) return null;
  if (cfg.thresholdCritico != null && tempC >= cfg.thresholdCritico) return "CRITICA";
  if (cfg.thresholdMedio != null && tempC >= cfg.thresholdMedio) return "MEDIA";
  return null;
}

// Desvio absoluto de frequência em Hz contra 60. ≥ critico = CRITICA; ≥ medio = MEDIA; ≥ baixo = BAIXA.
export function classifyFrequencia(
  hz: number,
  cfg: ThresholdConfig
): Severidade | null {
  if (!cfg.enabled) return null;
  const desvioHz = Math.abs(hz - 60);
  if (cfg.thresholdCritico != null && desvioHz >= cfg.thresholdCritico) return "CRITICA";
  if (cfg.thresholdMedio != null && desvioHz >= cfg.thresholdMedio) return "MEDIA";
  if (cfg.thresholdBaixo != null && desvioHz >= cfg.thresholdBaixo) return "BAIXA";
  return null;
}

// Infere a tensão nominal a partir da medida observada. Retorna null se fora dos ranges conhecidos (Brasil).
// 127V nominal: range operacional 110–140V. 220V nominal: range operacional 195–245V.
// 380V trifásico (fase-fase) também considerado.
export function inferirTensaoNominal(tensaoMedida: number): number | null {
  if (tensaoMedida >= 110 && tensaoMedida <= 140) return 127;
  if (tensaoMedida >= 195 && tensaoMedida <= 245) return 220;
  if (tensaoMedida >= 350 && tensaoMedida <= 415) return 380;
  return null;
}

export function calcularDesvioTensaoPct(
  tensaoMedida: number,
  tensaoNominal: number
): number {
  if (tensaoNominal === 0) return 0;
  return ((tensaoMedida - tensaoNominal) / tensaoNominal) * 100;
}
