import { prisma } from "@/lib/prisma";
import { getPayment, getIdentificationField, getPixQrCode } from "@/lib/asaas";

export interface HistoricoMes {
  ano: number;
  mes: number;
  label: string; // "jun", "jul"...
  consumoKwh: number;
  compensadoKwh: number;
  economia: number;
}

export interface DemonstrativoData {
  // Identificacao
  clienteNome: string;
  cpfCnpj: string | null;
  endereco: string | null;
  codigoUc: string;
  bandeiraTarifaria: string | null;

  // Periodo
  mes: number;
  ano: number;
  mesLabel: string;         // "03/26"
  emissao: string;          // dd/mm/yyyy
  vencimento: string | null;

  // Valores do mes
  tarifaSemDesconto: number | null;
  tarifaComDesconto: number | null;
  valorSemGD: number | null;
  valorComGD: number | null;   // = valor do aluguel
  descontoPercent: number;
  economiaMes: number | null;
  economiaAcumulada: number;

  // Historico (ultimos N meses, desde inicio do contrato)
  historico: HistoricoMes[];

  // Destaques (cards laterais do demonstrativo)
  entregaPercentMes: number;     // compensadoKwh / consumoKwh * 100
  desconto12Meses: number;       // soma das economias dos ultimos 12 registros
  consumoKwhMes: number;         // consumo da concessionaria no mes
  compensadoKwhMes: number;      // energia compensada no mes
  creditoRecebidoReais: number;  // R$ compensado no mes (= compensadoKwh * tarifaSem)

  // Pagamento Dommo/Asaas
  valorAluguel: number | null;
  linhaDigitavel: string | null;
  codigoBarrasPng: string | null; // data URL
  pixPayload: string | null;
  pixQrCodePng: string | null;    // data URL
  documentoCobranca: string | null;

  // Boleto original da concessionária (RGE) — mesma fatura do mês
  valorFaturaRge: number | null;
  vencimentoRge: string | null;               // dd/mm/yyyy
  codigoBarrasRgeDigits: string | null;       // 48 dígitos crus
  codigoBarrasRgePng: string | null;          // data URL
}

const MES_LABEL = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

function formatMesAno(mes: number, ano: number): string {
  const mm = String(mes).padStart(2, "0");
  const yy = String(ano).slice(-2);
  return `${mm}/${yy}`;
}

export async function loadDemonstrativoData(billingId: string): Promise<DemonstrativoData | null> {
  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    include: {
      consumerUnit: {
        include: {
          consumer: {
            include: {
              plants: {
                include: {
                  plant: { select: { id: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!billing) return null;

  const uc = billing.consumerUnit;
  const consumer = uc.consumer;
  const cp = consumer?.plants?.[0];
  const descontoPercent = cp?.descontoPercent ?? 0;

  // --- Fatura da distribuidora do mes (Infosimples) ---
  const billMes = await prisma.consumerBill.findFirst({
    where: {
      consumerUnitId: uc.id,
      anoReferencia: billing.ano,
      mesReferencia: billing.mes,
    },
  });

  const tarifaSemDesconto = billMes
    ? ((billMes.tarifaTE ?? 0) + (billMes.tarifaTUSD ?? 0)) || null
    : null;
  const tarifaComDesconto = tarifaSemDesconto != null
    ? tarifaSemDesconto * (1 - descontoPercent / 100)
    : null;

  const valorSemGD = billMes?.valorTotal ?? billing.valorFatura ?? null;
  const valorComGD = billing.valorCobranca ?? null;
  // Economia = valorCompensado − valorCobranca (quanto o cliente deixou de pagar
  // pela energia injetada graças ao desconto de contrato). Persistido em
  // billing.valorEconomia pelo billing-populate após import da fatura.
  const economiaMes = billing.valorEconomia ?? null;

  // --- Historico desde inicio do contrato (createdAt da 1a ConsumerUnitBilling) ---
  const primeira = await prisma.consumerUnitBilling.findFirst({
    where: { consumerUnitId: uc.id },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const inicio = primeira?.createdAt ?? billing.createdAt;

  const historicoBillings = await prisma.consumerUnitBilling.findMany({
    where: {
      consumerUnitId: uc.id,
      OR: [
        { ano: { gt: inicio.getFullYear() } },
        { ano: inicio.getFullYear(), mes: { gte: inicio.getMonth() + 1 } },
      ],
    },
    orderBy: [{ ano: "asc" }, { mes: "asc" }],
  });

  // Para consumo/compensacao, cruzar com ConsumerBill (por UC)
  const historicoBills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc.id },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      consumoKwh: true,
      energiaCompensada: true,
    },
  });

  const billByKey = new Map(
    historicoBills.map((b) => [`${b.anoReferencia}-${b.mesReferencia}`, b])
  );

  const historico: HistoricoMes[] = historicoBillings.map((b) => {
    const bill = billByKey.get(`${b.ano}-${b.mes}`);
    const economia = b.valorEconomia ?? 0;
    return {
      ano: b.ano,
      mes: b.mes,
      label: MES_LABEL[b.mes - 1],
      consumoKwh: bill?.consumoKwh ?? 0,
      compensadoKwh: bill?.energiaCompensada ?? 0,
      economia: economia > 0 ? economia : 0,
    };
  });

  const economiaAcumulada = historico.reduce((sum, h) => sum + h.economia, 0);
  const desconto12Meses = historico.slice(-12).reduce((sum, h) => sum + h.economia, 0);

  const consumoKwhMes = billMes?.consumoKwh ?? 0;
  const compensadoKwhMes = billMes?.energiaCompensada ?? 0;
  const entregaPercentMes = consumoKwhMes > 0
    ? Math.min(100, (compensadoKwhMes / consumoKwhMes) * 100)
    : 0;
  const creditoRecebidoReais = tarifaSemDesconto != null
    ? compensadoKwhMes * tarifaSemDesconto
    : 0;

  // --- Pagamento via Asaas ---
  let linhaDigitavel: string | null = null;
  let codigoBarrasPng: string | null = null;
  let pixPayload: string | null = null;
  let pixQrCodePng: string | null = null;
  let documentoCobranca: string | null = null;

  // --- Boleto da concessionária (RGE) ---
  let codigoBarrasRgeDigits: string | null = null;
  let codigoBarrasRgePng: string | null = null;
  if (billMes?.codigoBarras) {
    codigoBarrasRgeDigits = billMes.codigoBarras.replace(/\D/g, "") || null;
    if (codigoBarrasRgeDigits) {
      try {
        const { gerarCodigoBarrasPng } = await import("./barcode");
        codigoBarrasRgePng = await gerarCodigoBarrasPng(codigoBarrasRgeDigits);
      } catch {
        codigoBarrasRgePng = null;
      }
    }
  }
  const vencimentoRge = billMes?.vencimento ? formatDateBR(billMes.vencimento) : null;
  const valorFaturaRge = billMes?.valorTotal ?? null;

  if (billing.asaasChargeId) {
    try {
      const [payment, idField] = await Promise.all([
        getPayment(billing.asaasChargeId),
        getIdentificationField(billing.asaasChargeId).catch(() => null),
      ]);
      documentoCobranca = payment.id;
      if (idField?.identificationField) {
        linhaDigitavel = idField.identificationField;
        try {
          const { gerarCodigoBarrasPng } = await import("./barcode");
          codigoBarrasPng = await gerarCodigoBarrasPng(linhaDigitavel);
        } catch {
          codigoBarrasPng = null;
        }
      }
      try {
        const pix = await getPixQrCode(billing.asaasChargeId);
        pixPayload = pix.payload ?? null;
        pixQrCodePng = pix.encodedImage
          ? `data:image/png;base64,${pix.encodedImage}`
          : null;
      } catch {
        // PIX nao habilitado
      }
    } catch {
      // Asaas indisponivel
    }
  }

  const enderecoStr = [uc.logradouro, uc.numero].filter(Boolean).join(", ") || null;

  return {
    clienteNome: consumer?.name ?? uc.nome,
    cpfCnpj: uc.cpfCnpj ?? consumer?.cpfCnpj ?? null,
    endereco: enderecoStr,
    codigoUc: uc.codigoUc,
    bandeiraTarifaria: billMes?.bandeiraTarifaria ?? null,

    mes: billing.mes,
    ano: billing.ano,
    mesLabel: formatMesAno(billing.mes, billing.ano),
    emissao: formatDateBR(new Date()),
    vencimento: billing.dataVencimento ? formatDateBR(billing.dataVencimento) : null,

    tarifaSemDesconto,
    tarifaComDesconto,
    valorSemGD,
    valorComGD,
    descontoPercent,
    economiaMes,
    economiaAcumulada,

    historico,

    entregaPercentMes,
    desconto12Meses,
    consumoKwhMes,
    compensadoKwhMes,
    creditoRecebidoReais,

    valorAluguel: valorComGD,
    linhaDigitavel,
    codigoBarrasPng,
    pixPayload,
    pixQrCodePng,
    documentoCobranca,

    valorFaturaRge,
    vencimentoRge,
    codigoBarrasRgeDigits,
    codigoBarrasRgePng,
  };
}
