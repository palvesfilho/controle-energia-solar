/**
 * Importação de uma fatura em PDF: parse, gravação do arquivo e upsert da
 * `ConsumerBill`. É o caminho único de entrada manual de fatura no sistema —
 * usado pela tela "Upload de Faturas" (lote) e pelo lançamento de geração
 * manual com conta de energia (que precisa das datas de leitura).
 *
 * Existe como lib, e não dentro da rota, porque a segunda tela precisa do
 * MESMO resultado: fatura aparecendo em /admin/faturas-energia como qualquer
 * outra. Duas rotas com dois caminhos de gravação divergiriam na primeira
 * mudança de regra.
 */
import { prisma } from "@/lib/prisma";
import { saveBufferToStorage } from "@/lib/file-storage";
import { parseFaturaPdf } from "@/lib/fatura-pdf-parser";
import { populateBillingFromBill } from "@/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "@/lib/investor-payables";
import { formatCodigoUc } from "@/lib/uc-codigo";

export class FaturaUploadError extends Error {}

export interface FaturaImportada {
  billId: string;
  codigoInstalacao: string;
  /** UC casada no cadastro; null quando a fatura ficou pendente de vínculo. */
  ucId: string | null;
  ucNome: string | null;
  /** Preenchido quando o código da instalação é o da UC de uma usina. */
  plantId: string | null;
  mesReferencia: number;
  anoReferencia: number;
  valorTotal: number | null;
  /** Início do ciclo de leitura (inclusive). */
  dataLeituraAnterior: Date | null;
  /** Fim do ciclo de leitura — EXCLUSIVO, abre o ciclo seguinte. */
  dataLeituraAtual: Date | null;
  pdfUrl: string;
  /** UC não cadastrada: a fatura entrou como pendente de vínculo. */
  pendente: boolean;
  /** Divergências que o operador precisa ver — nunca engolidas em silêncio. */
  avisos: string[];
}

/**
 * Lê o PDF, grava o arquivo e cria/atualiza a `ConsumerBill`.
 *
 * `arrayBuffer` é clonado antes do parse: o pdfjs-dist transfere (drena) o
 * buffer que recebe, e sem a cópia o arquivo salvo sai com 0 bytes.
 * Ver feedback_pdfjs_buffer_transfer.
 */
export async function importarFaturaPdf(arrayBuffer: ArrayBuffer): Promise<FaturaImportada> {
  const buffer = new Uint8Array(arrayBuffer);
  const bufferParaDisco = Buffer.from(arrayBuffer.slice(0));

  const parsed = await parseFaturaPdf(buffer);
  if (!parsed.codigoInstalacao) {
    throw new FaturaUploadError("Código da instalação não encontrado no PDF");
  }

  const avisos = [...(parsed.avisos ?? [])];
  const codigoInstalacao = parsed.codigoInstalacao;

  // Localiza a UC: por ConsumerUnit.codigoUc (ou o código antigo), depois pela
  // instalação registrada na credencial da concessionária.
  let unit = await prisma.consumerUnit.findFirst({
    where: {
      OR: [{ codigoUc: codigoInstalacao }, { codigoUcAntigo: codigoInstalacao }],
    },
    select: { id: true, nome: true },
  });
  if (!unit) {
    const cred = await prisma.cpflCredential.findFirst({
      where: { instalacao: codigoInstalacao, consumerUnitId: { not: null } },
      select: { consumerUnit: { select: { id: true, nome: true } } },
    });
    if (cred?.consumerUnit) unit = cred.consumerUnit;
  }

  // Código que bate com uma usina cadastrada: a bill é a conta de energia da
  // UC da usina, e carrega o plantId.
  const plantDaUsina = await prisma.plant.findFirst({
    where: {
      OR: [
        { unidadeConsumidora: codigoInstalacao },
        { unidadeConsumidoraAntiga: codigoInstalacao },
        { numeroUsina: codigoInstalacao },
        { codigoCliente: codigoInstalacao },
      ],
    },
    select: { id: true },
  });
  const plantId = plantDaUsina?.id ?? null;

  const { anoReferencia, mesReferencia } = parsed.bill;
  const fileName = `${anoReferencia}-${String(mesReferencia).padStart(2, "0")}.pdf`;

  let billId: string;
  let pdfUrl: string;

  if (unit) {
    const subdir = `bills/${unit.id}`;
    await saveBufferToStorage(bufferParaDisco, subdir, fileName);
    pdfUrl = `/api/files/${subdir}/${fileName}`;

    const upserted = await prisma.consumerBill.upsert({
      where: {
        consumerUnitId_anoReferencia_mesReferencia: {
          consumerUnitId: unit.id,
          anoReferencia,
          mesReferencia,
        },
      },
      update: { ...parsed.bill, pdfUrl, plantId, syncedAt: new Date() },
      create: {
        consumerUnitId: unit.id,
        plantId,
        ...parsed.bill,
        pdfUrl,
        syncedAt: new Date(),
      },
    });
    billId = upserted.id;

    // Preenche ConsumerUnitBilling (aba "Valores da Cobrança") e o pagável do
    // investidor. Falha aqui não invalida a fatura já gravada.
    await populateBillingFromBill(billId).catch((e) =>
      console.error("[importarFaturaPdf] populateBillingFromBill falhou:", e),
    );
    await syncInvestorPayablesFromBill(billId).catch((e) =>
      console.error("[importarFaturaPdf] syncInvestorPayablesFromBill falhou:", e),
    );
  } else {
    // UC não cadastrada: a fatura fica órfã por (instalacao, ano, mes),
    // aguardando o cadastro da UC pra ser vinculada.
    const subdir = `bills/_pending/${codigoInstalacao}`;
    await saveBufferToStorage(bufferParaDisco, subdir, fileName);
    pdfUrl = `/api/files/${subdir}/${fileName}`;

    const existing = await prisma.consumerBill.findFirst({
      where: {
        consumerUnitId: null,
        instalacao: codigoInstalacao,
        anoReferencia,
        mesReferencia,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.consumerBill.update({
        where: { id: existing.id },
        data: { ...parsed.bill, pdfUrl, plantId, syncedAt: new Date() },
      });
      billId = existing.id;
    } else {
      const created = await prisma.consumerBill.create({
        data: { ...parsed.bill, pdfUrl, plantId, syncedAt: new Date() },
      });
      billId = created.id;
    }

    avisos.unshift(
      plantId
        ? `Fatura registrada como da usina (código ${formatCodigoUc(codigoInstalacao)}).`
        : `UC não cadastrada — fatura salva como pendente. Cadastre a UC com código ${formatCodigoUc(codigoInstalacao)} para vincular.`,
    );
  }

  return {
    billId,
    codigoInstalacao,
    ucId: unit?.id ?? null,
    ucNome: unit?.nome ?? null,
    plantId,
    mesReferencia,
    anoReferencia,
    valorTotal: parsed.bill.valorTotal,
    dataLeituraAnterior: parsed.bill.dataLeituraAnterior,
    dataLeituraAtual: parsed.bill.dataLeituraAtual,
    pdfUrl,
    pendente: !unit,
    avisos,
  };
}
