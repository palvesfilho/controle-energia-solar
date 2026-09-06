/**
 * Geração e guarda do PDF do demonstrativo de cobrança.
 *
 * 🔑 **Por que virou módulo próprio.** Isto vivia solto dentro de
 * `emit-cobranca.ts`, o pipeline do botão "Emitir cobrança". Consequência: o
 * **lote** (`batch/asaas`) e a **emissão avulsa**, que vão direto no
 * `emitBillingToAsaas`, nunca geravam demonstrativo — e a partir de 05/09/2026,
 * quando toda emissão passou a mandar email, o email do lote sairia sem anexo
 * nenhum. Com a geração aqui, os três caminhos anexam o mesmo PDF.
 *
 * O código de barras/PIX do Asaas é buscado pelo próprio loader a partir do
 * `asaasChargeId` já gravado — por isso esta função só deve ser chamada
 * DEPOIS de a cobrança existir no Asaas.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { loadDemonstrativoFaturaData } from "@/lib/demonstrativo-fatura";
import { DemonstrativoFaturaPdf } from "@/components/billing/demonstrativo-fatura-pdf";
import { saveBufferToStorage } from "@/lib/file-storage";

export interface DemonstrativoGerado {
  buffer: Buffer;
  /** Caminho servido por `/api/files/...` (exige sessão de admin). */
  url: string;
  /** Nome do arquivo como o cliente o recebe no anexo. */
  nomeArquivo: string;
}

/**
 * Gera o PDF, salva no storage e grava `demonstrativoUrl` +
 * `demonstrativoGeradoEm` no billing. Lança quando não consegue montar os
 * dados — o caller decide se isso derruba a operação.
 */
export async function gerarESalvarDemonstrativo(
  billingId: string,
): Promise<DemonstrativoGerado> {
  const billing = await prisma.consumerUnitBilling.findUnique({
    where: { id: billingId },
    select: {
      ano: true,
      mes: true,
      consumerUnitId: true,
      consumerUnit: { select: { codigoUc: true } },
    },
  });
  if (!billing) throw new Error("Cobrança não encontrada");

  const data = await loadDemonstrativoFaturaData(billingId);
  if (!data) {
    throw new Error("Falha ao montar os dados do demonstrativo");
  }

  const buffer = Buffer.from(await renderToBuffer(DemonstrativoFaturaPdf({ data })));

  const mes2 = String(billing.mes).padStart(2, "0");
  const fileName = `${billing.ano}-${mes2}-demonstrativo.pdf`;
  const subdir = `demonstrativos/${billing.consumerUnitId}`;
  await saveBufferToStorage(buffer, subdir, fileName);
  const url = `/api/files/${subdir}/${fileName}`;

  await prisma.consumerUnitBilling.update({
    where: { id: billingId },
    data: { demonstrativoUrl: url, demonstrativoGeradoEm: new Date() },
  });

  return {
    buffer,
    url,
    // Nome pensado para a caixa de entrada do cliente, não para o storage.
    nomeArquivo: `fatura-${billing.consumerUnit.codigoUc}-${billing.ano}-${mes2}.pdf`,
  };
}
