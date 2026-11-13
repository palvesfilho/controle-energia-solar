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
import { resolverCustoSemDesconto } from "@/lib/billing-calculator";

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
    /**
     * O endereço já quebrado nas linhas do cabeçalho do PDF, na ordem pedida
     * pelo Paulo em 13/11/2026: rua + número + complemento · bairro · cidade.
     * Linha que não existe no cadastro some — nunca é inventada.
     */
    enderecoLinhas: string[];
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
 * Histórico dos 12 meses (mais antigo → mais recente) terminando em
 * (mesRef/anoRef). Sempre 12 entradas — meses sem fatura aparecem com
 * consumo 0 (linha em branco no gráfico).
 */
function gerar12Meses(
  bills: { mesReferencia: number; anoReferencia: number; consumoKwh: number | null }[],
  mesRef: number,
  anoRef: number,
  impresso: Map<string, number> = new Map(),
): { m: string; consumo: number }[] {
  // A fatura gravada manda; o painel impresso só preenche o mês que falta
  // (ou que está gravado sem consumo).
  const map = new Map(impresso);
  for (const b of bills) {
    if ((b.consumoKwh ?? 0) > 0 || !map.has(`${b.anoReferencia}-${b.mesReferencia}`)) {
      map.set(`${b.anoReferencia}-${b.mesReferencia}`, b.consumoKwh ?? 0);
    }
  }
  const out: { m: string; consumo: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    let m = mesRef - i;
    let a = anoRef;
    while (m <= 0) {
      m += 12;
      a -= 1;
    }
    const consumo = map.get(`${a}-${m}`) ?? 0;
    out.push({ m: mesLabelHistorico(m, a), consumo: Math.round(consumo) });
  }
  return out;
}

const MES_SIGLA: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

/**
 * Lê o painel "histórico de consumo" gravado da fatura (`[{ mesAno: "OUT/26",
 * consumoKwh, dias }]`) num mapa "ano-mês" → kWh. Entrada que não se entende
 * (mês ilegível, kWh nulo) é ignorada — nunca vira zero inventado.
 */
function lerHistoricoImpresso(json: string | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!json) return out;
  let itens: unknown;
  try {
    itens = JSON.parse(json);
  } catch {
    return out;
  }
  if (!Array.isArray(itens)) return out;
  for (const it of itens as { mesAno?: unknown; consumoKwh?: unknown }[]) {
    const m = String(it?.mesAno ?? "").toUpperCase().match(/^([A-Z]{3})\W*(\d{2})$/);
    const mes = m ? MES_SIGLA[m[1]] : undefined;
    const kwh = typeof it?.consumoKwh === "number" && Number.isFinite(it.consumoKwh) ? it.consumoKwh : null;
    if (!m || !mes || kwh === null) continue;
    out.set(`${2000 + Number(m[2])}-${mes}`, kwh);
  }
  return out;
}

export interface LoadDemonstrativoOpts {
  /**
   * Pula o bloco de boletos — que é a parte CARA: duas chamadas ao Asaas
   * (`getIdentificationField`, `getPayment`) mais a renderização do código de
   * barras em PNG.
   *
   * 🔑 Existe para a página pública da fatura (`lib/fatura-publica.ts`), que
   * mostra o mesmo resumo mas busca PIX e boleto pelas próprias rotas, sob
   * demanda, quando o cliente escolhe a aba. Sem isto, abrir o link do WhatsApp
   * pagaria duas idas ao Asaas antes de desenhar qualquer coisa na tela — e
   * duplicar o cálculo do resumo num segundo arquivo seria pior: os dois
   * envelheceriam separados e um dia mostrariam economias diferentes.
   */
  semBoletos?: boolean;
}

export async function loadDemonstrativoFaturaData(
  billingId: string,
  opts: LoadDemonstrativoOpts = {},
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

  // 13/11/2026 — Histórico IMPRESSO na fatura da RGE (painel de 12-13 meses),
  // gravado em `ConsumerBill.historicoConsumo` pelo leitor (Infosimples ou PDF).
  // Completa SÓ os meses sem fatura no banco: UC que entrou há pouco tinha o
  // gráfico quase vazio (44 de 95 UCs cobradas) com o dado já em casa. Não é
  // estimativa — é o número que a concessionária imprimiu.
  // Fonte: a fatura mais recente até o mês cobrado que traga o painel; se não
  // houver, a primeira depois dele (o painel dela também cobre o mês cobrado).
  const refCobranca = billing.ano * 12 + billing.mes;
  const comPainel = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc.id, historicoConsumo: { not: null } },
    select: { anoReferencia: true, mesReferencia: true, historicoConsumo: true },
  });
  const ordem = (b: { anoReferencia: number; mesReferencia: number }) => b.anoReferencia * 12 + b.mesReferencia;
  const painel =
    comPainel.filter((b) => ordem(b) <= refCobranca).sort((a, b) => ordem(b) - ordem(a))[0] ??
    comPainel.filter((b) => ordem(b) > refCobranca).sort((a, b) => ordem(a) - ordem(b))[0];
  const historicoImpresso = lerHistoricoImpresso(painel?.historicoConsumo ?? null);

  // Acumulados (R$ e kWh)
  const acumulados = await computarAcumulados(uc.id, { ano: billing.ano, mes: billing.mes });

  // Crédito recebido em kWh no MÊS (TE + TUSD em módulo)
  const creditoMesKwh = billMes
    ? Math.abs(billMes.injetadaOucTeKwh ?? 0) + Math.abs(billMes.injetadaOucTusdKwh ?? 0)
    : 0;

  // Tarifa bruta (R$/kWh) — TE + TUSD (sem desconto)
  const tarifaBruta = billMes ? (billMes.tarifaTE ?? 0) + (billMes.tarifaTUSD ?? 0) : 0;

  // Resumo do mês:
  //   custoTotalSemDesconto = quanto pagaria sem solar
  //   custoEnergiaComDesconto = valorCobranca (nossa cobrança) — em FAT_UNICA inclui RGE
  //   economiaMensal = valorEconomia
  const valorTotalRge = billMes?.valorTotal ?? billing.valorFatura ?? 0;
  const valorCompensado = billing.valorCompensado ?? 0;
  const custoEnergiaComDesconto = billing.valorCobranca ?? 0;
  // Regras com multiplicador de exibição (ex.: DIMARZARI) mostram o "sem
  // desconto" como um múltiplo da própria cobrança; as demais somam
  // fatura da RGE + créditos. Não afeta o valor a pagar.
  const semDesconto = resolverCustoSemDesconto(
    uc.regraRemuneracao,
    custoEnergiaComDesconto,
    valorTotalRge + valorCompensado,
    billing.valorEconomia ?? 0,
  );
  const custoTotalSemDesconto = semDesconto.custoSemDesconto;
  const economiaMensal = semDesconto.economia;
  const valorAPagar = billing.valorCobranca ?? 0;

  // % de desconto exibido ao cliente. Nas regras com multiplicador é o desconto
  // real da tela (economia ÷ valor sem desconto — 20% quando o fator é 1,25);
  // nas demais mantém o percentual de contrato da UC.
  // Não confundir com `percentCompensado`, que é a fatia cobrada sobre o crédito.
  const descontoPct =
    semDesconto.viaMultiplicador && custoTotalSemDesconto > 0
      ? (economiaMensal / custoTotalSemDesconto) * 100
      : (uc.percentCompensado ?? 0) * 100;

  const mesLabel = mesAnoCurto(billing.mes, billing.ano);

  // Boletos — sempre tem o da Associação; o RGE só pra PERCENTUAL_SOBRE.
  const boletos: DemonstrativoFaturaBoleto[] = [];

  // ⚠️ TUDO daqui até o fim do bloco fica atrás do `semBoletos`, inclusive a ida
  // ao Asaas: é ela a parte cara, não o `boletos.push`. Uma primeira versão
  // guardou só os pushes e a chamada continuou acontecendo — a página pública
  // teria pago as duas requisições para depois jogar o resultado fora.
  if (!opts.semBoletos) {

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
        observacao: "Taxas mínimas obrigatórias, impostos e iluminação pública",
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
  }

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

  // Linhas do cabeçalho. A UC não tem campo de BAIRRO; ele vem do termo de
  // adesão importado do CRM (mesma UC). Se a UC não tem rua, o termo do CRM
  // fornece o endereço inteiro; sem nenhum dos dois, cai no texto livre do
  // cliente numa linha só.
  const crmEnd = await prisma.crmUcImportada.findFirst({
    where: { consumerUnitId: uc.id },
    orderBy: { ultimaLeituraEm: "desc" },
    select: { logradouro: true, numero: true, complemento: true, bairro: true, cidade: true },
  });
  const limpa = (v: string | null | undefined) => v?.trim() || null;
  const ruaLinha = (rua: string | null, num: string | null, compl: string | null) =>
    rua ? [rua, num, compl].filter(Boolean).join(", ") : null;
  const daUc = !!limpa(uc.logradouro);
  const enderecoLinhas = (
    daUc
      ? [
          ruaLinha(limpa(uc.logradouro), limpa(uc.numero), limpa(uc.complemento)),
          limpa(crmEnd?.bairro),
          limpa(uc.cidade) ?? limpa(crmEnd?.cidade),
        ]
      : limpa(crmEnd?.logradouro)
        ? [
            ruaLinha(limpa(crmEnd?.logradouro), limpa(crmEnd?.numero), limpa(crmEnd?.complemento)),
            limpa(crmEnd?.bairro),
            limpa(crmEnd?.cidade),
          ]
        : [enderecoConsumer]
  ).filter((l): l is string => !!l);

  return {
    cliente: {
      nome: (consumer?.name ?? uc.nome).toUpperCase(),
      cnpj: uc.cpfCnpj ?? consumer?.cpfCnpj ?? null,
      endereco,
      enderecoLinhas,
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
        obs: semDesconto.viaMultiplicador
          ? "Referência contratual"
          : valorCompensado > 0
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
    historico12Meses: gerar12Meses(billsHistorico, billing.mes, billing.ano, historicoImpresso),
    boletos,
    regraRemuneracao: uc.regraRemuneracao,
  };
}
