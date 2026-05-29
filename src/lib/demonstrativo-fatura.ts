/**
 * Loader de dados pro NOVO demonstrativo de fatura (handoff Brasil Solar).
 *
 * Diferenças do `loadDemonstrativoData` (legado):
 *   - Estrutura espelha o JSON do handoff (cliente, fatura, pagamento, resumoDoMes,
 *     energia, historico12Meses, boletos[]).
 *   - Acumulados (economia R$ e crédito kWh) vêm de `lib/acumulados.ts` —
 *     contam desde `ConsumerUnit.dataInicioContrato` (fallback: vigenciaCompensacao).
 *   - Boletos[] tem 1 item em FAT_UNICA e 2 em PERCENTUAL_SOBRE_COMPENSADO.
 */
import { prisma } from "@/lib/prisma";
import { getPayment, getIdentificationField } from "@/lib/asaas";
import { computarAcumulados } from "@/lib/acumulados";

export interface DemonstrativoFaturaBoleto {
  tipo: "rge" | "associacao";
  titulo: string;
  valor: number; // R$
  vencimento: string; // dd/mm/yyyy
  observacao: string;
  codigoBarras: string | null; // linha digitável formatada
  codigoBarrasPng: string | null; // data URL
  codigoBarrasPlaceholder?: string;
}

export interface DemonstrativoFaturaData {
  cliente: {
    nome: string;
    cnpj: string | null;
    endereco: string | null;
    unidadeConsumidora: string;
  };
  fatura: {
    mesReferencia: string; // "04/26"
    emissao: string; // dd/mm/yyyy
    bandeira: string; // Verde | Amarela | Vermelha 1 | Vermelha 2
    descontoTotalPercentual: number; // 0-100
  };
  pagamento: {
    valorAPagar: number;
    vencimento: string; // dd/mm/yyyy
  };
  resumoDoMes: {
    custoTotalSemDesconto: { valor: number; obs: string };
    custoEnergiaComDesconto: { valor: number; obs: string };
    economiaMensal: { valor: number; obs: string };
    economiaTotalAcumulada: { valor: number; obs: string };
  };
  energia: {
    consumoTotalDeEnergiaKwh: number;
    consumoObs: string;
    creditoTotalRecebidoKwh: number;
    creditoRecebidoObs: string;
    creditoTotalAcumuladoKwh: number;
    creditoAcumuladoObs: string;
    custoKwhConcessionaria: number;
    custoKwhObs: string;
  };
  historico12Meses: { m: string; consumo: number }[]; // ordenado: mais antigo → mais recente
  boletos: DemonstrativoFaturaBoleto[];
  regraRemuneracao: string | null;
}

const MES_LABEL_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtDateBR(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

function mesAnoCurto(mes: number, ano: number): string {
  const mm = String(mes).padStart(2, "0");
  const yy = String(ano).slice(-2);
  return `${mm}/${yy}`;
}

function mesLabelHistorico(mes: number, ano: number): string {
  return `${MES_LABEL_CURTO[mes - 1]}/${String(ano).slice(-2)}`;
}

/**
 * Histórico ATÉ 12 meses (mais antigo → mais recente) terminando em (mesRef/anoRef).
 * Meses anteriores ao primeiro registro de fatura são omitidos — gráfico não
 * mostra barras zeradas quando o cliente é novo na base.
 */
function gerar12Meses(
  bills: { mesReferencia: number; anoReferencia: number; consumoKwh: number | null }[],
  mesRef: number,
  anoRef: number,
): { m: string; consumo: number }[] {
  if (bills.length === 0) return [];
  const map = new Map(
    bills.map((b) => [`${b.anoReferencia}-${b.mesReferencia}`, b.consumoKwh ?? 0]),
  );
  // Acha o código (ano*100+mes) do primeiro mês com fatura — pra não mostrar
  // meses anteriores a ele com 0.
  const codigo = (a: number, m: number) => a * 100 + m;
  const primeiroCodigo = Math.min(...bills.map((b) => codigo(b.anoReferencia, b.mesReferencia)));

  const out: { m: string; consumo: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    let m = mesRef - i;
    let a = anoRef;
    while (m <= 0) {
      m += 12;
      a -= 1;
    }
    if (codigo(a, m) < primeiroCodigo) continue;
    const consumo = map.get(`${a}-${m}`) ?? 0;
    out.push({ m: mesLabelHistorico(m, a), consumo: Math.round(consumo) });
  }
  return out;
}

export async function loadDemonstrativoFaturaData(
  billingId: string,
): Promise<DemonstrativoFaturaData | null> {
  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    include: {
      consumerUnit: {
        include: { consumer: true, plant: true },
      },
    },
  });
  if (!billing) return null;

  const uc = billing.consumerUnit;
  const consumer = uc.consumer;

  // Fatura RGE do mês
  const billMes = await prisma.consumerBill.findFirst({
    where: {
      consumerUnitId: uc.id,
      anoReferencia: billing.ano,
      mesReferencia: billing.mes,
    },
  });

  // Bills históricos pra gráfico 12 meses (consumoKwh)
  const billsHistorico = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc.id },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      consumoKwh: true,
    },
  });

  // Acumulados (R$ e kWh)
  const acumulados = await computarAcumulados(uc.id, { ano: billing.ano, mes: billing.mes });

  // Crédito recebido em kWh no MÊS (TE + TUSD em módulo)
  const creditoMesKwh = billMes
    ? Math.abs(billMes.injetadaOucTeKwh ?? 0) + Math.abs(billMes.injetadaOucTusdKwh ?? 0)
    : 0;

  // Tarifa bruta (R$/kWh) — TE + TUSD (sem desconto)
  const tarifaBruta = billMes ? (billMes.tarifaTE ?? 0) + (billMes.tarifaTUSD ?? 0) : 0;

  // % de desconto do contrato (apenas exibição)
  const descontoPct = (uc.percentCompensado ?? 0) * 100;

  // Resumo do mês:
  //   custoTotalSemDesconto = quanto pagaria sem solar
  //   custoEnergiaComDesconto = valorCobranca (nossa cobrança) — em FAT_UNICA inclui RGE
  //   economiaMensal = valorEconomia
  const valorTotalRge = billMes?.valorTotal ?? billing.valorFatura ?? 0;
  const valorCompensado = billing.valorCompensado ?? 0;
  const custoTotalSemDesconto = valorTotalRge + valorCompensado;
  const custoEnergiaComDesconto = billing.valorCobranca ?? 0;
  const economiaMensal = billing.valorEconomia ?? 0;
  const valorAPagar = billing.valorCobranca ?? 0;

  const mesLabel = mesAnoCurto(billing.mes, billing.ano);

  // Boletos — sempre tem o da Associação; o RGE só pra PERCENTUAL_SOBRE.
  const boletos: DemonstrativoFaturaBoleto[] = [];

  if (uc.regraRemuneracao === "PERCENTUAL_SOBRE_COMPENSADO" && billMes?.codigoBarras) {
    const digits = billMes.codigoBarras.replace(/\D/g, "") || null;
    let png: string | null = null;
    if (digits) {
      try {
        const { gerarCodigoBarrasPng } = await import("./barcode");
        png = await gerarCodigoBarrasPng(digits);
      } catch {
        png = null;
      }
    }
    boletos.push({
      tipo: "rge",
      titulo: "Boleto RGE",
      valor: valorTotalRge,
      vencimento: fmtDateBR(billMes.vencimento),
      observacao: "consumo residual",
      codigoBarras: billMes.codigoBarras,
      codigoBarrasPng: png,
    });
  }

  // Boleto Associação — pega do Asaas se já emitido; senão placeholder
  let assocBarras: string | null = null;
  let assocBarrasPng: string | null = null;
  let assocPlaceholder: string | undefined;
  if (billing.asaasChargeId) {
    try {
      const idField = await getIdentificationField(billing.asaasChargeId).catch(() => null);
      if (idField?.identificationField) {
        assocBarras = idField.identificationField;
        try {
          const { gerarCodigoBarrasPng } = await import("./barcode");
          assocBarrasPng = await gerarCodigoBarrasPng(assocBarras);
        } catch {
          assocBarrasPng = null;
        }
      }
      // Pra confirmar status / fallback do payment se precisar
      await getPayment(billing.asaasChargeId).catch(() => null);
    } catch {
      // Asaas indisponível
    }
  } else {
    assocPlaceholder = "Emita a cobrança no Asaas para gerar o código de barras.";
  }

  boletos.push({
    tipo: "associacao",
    titulo: `Associação de Energia Brasil Solar · Aluguel da usina ${mesLabel}`,
    valor: valorAPagar,
    vencimento: fmtDateBR(billing.dataVencimento),
    observacao: "desconto aplicado",
    codigoBarras: assocBarras,
    codigoBarrasPng: assocBarrasPng,
    codigoBarrasPlaceholder: assocPlaceholder,
  });

  // Endereço: monta da UC (logradouro/numero/cidade/cep) ou cai no Consumer
  // como fallback se a UC não tem.
  const enderecoUcParts = [
    [uc.logradouro, uc.numero].filter(Boolean).join(", "),
    uc.complemento,
    uc.cidade,
    uc.cep ? `CEP ${uc.cep}` : null,
  ].filter(Boolean);
  const enderecoUc = enderecoUcParts.length > 0 ? enderecoUcParts.join(" · ") : null;
  const enderecoConsumer = consumer?.endereco?.trim() || null;
  const endereco = enderecoUc ?? enderecoConsumer;

  return {
    cliente: {
      nome: (consumer?.name ?? uc.nome).toUpperCase(),
      cnpj: uc.cpfCnpj ?? consumer?.cpfCnpj ?? null,
      endereco,
      unidadeConsumidora: uc.codigoUc,
    },
    fatura: {
      mesReferencia: mesLabel,
      emissao: fmtDateBR(new Date()),
      bandeira: billMes?.bandeiraTarifaria ?? "Verde",
      descontoTotalPercentual: Math.round(descontoPct),
    },
    pagamento: {
      valorAPagar,
      vencimento: fmtDateBR(billing.dataVencimento),
    },
    resumoDoMes: {
      custoTotalSemDesconto: {
        valor: custoTotalSemDesconto,
        obs: valorCompensado > 0
          ? `R$ ${valorCompensado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em crédito`
          : "Sem créditos no mês",
      },
      custoEnergiaComDesconto: {
        valor: custoEnergiaComDesconto,
        obs: `Aplicado em ${MES_LABEL_CURTO[billing.mes - 1]}/${String(billing.ano).slice(-2)}`,
      },
      economiaMensal: {
        valor: economiaMensal,
        obs: `${MES_LABEL_CURTO[billing.mes - 1]}/${billing.ano}`,
      },
      economiaTotalAcumulada: {
        valor: acumulados.economiaR$,
        obs: "Desde o início do contrato",
      },
    },
    energia: {
      consumoTotalDeEnergiaKwh: billMes?.consumoKwh ?? 0,
      consumoObs: "Medido pela concessionária",
      creditoTotalRecebidoKwh: Math.round(creditoMesKwh),
      creditoRecebidoObs: "Da usina alocada",
      creditoTotalAcumuladoKwh: Math.round(acumulados.creditoKwh),
      creditoAcumuladoObs: "Da usina alocada",
      custoKwhConcessionaria: tarifaBruta,
      custoKwhObs: "Tarifa bruta de referência",
    },
    historico12Meses: gerar12Meses(billsHistorico, billing.mes, billing.ano),
    boletos,
    regraRemuneracao: uc.regraRemuneracao,
  };
}
