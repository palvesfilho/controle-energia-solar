/**
 * Ingestão de uma fatura de energia em PDF: parseia, resolve a UC e cria o
 * ConsumerBill de forma IDEMPOTENTE.
 *
 * Estava dentro de POST /api/faturas-energia/ingest, que só aceitava
 * multipart/form-data. Virou função porque agora há DOIS caminhos de entrada:
 *   - a rota /ingest (server-to-server, um robô faz POST dos PDFs);
 *   - o backfill pelo botão, que BAIXA os PDFs do serviço de robôs e os ingere
 *     aqui dentro, sem passar por HTTP de novo.
 * A regra de negócio é a mesma nos dois — por isso mora num lugar só.
 *
 * IDEMPOTÊNCIA: se a competência já existe para a UC, a fatura é PULADA — nunca
 * sobrescreve. Isso protege o dado do mês vigente já baixado pelo Infosimples
 * (mais rico) e permite reprocessar à vontade sem estragar nada.
 */
import { prisma } from "@/lib/prisma";
import { saveBufferToStorage } from "@/lib/file-storage";
import { parseFaturaPdf } from "@/lib/fatura-pdf-parser";

export type IngestStatus = "criada" | "ja_existia" | "pendente" | "erro";

export interface IngestItem {
  file: string;
  status: IngestStatus;
  error: string | null;
  codigoInstalacao: string | null;
  ucNome: string | null;
  mesRef: number | null;
  anoRef: number | null;
}

export function contarPorStatus(items: IngestItem[]) {
  const count = (s: IngestStatus) => items.filter((r) => r.status === s).length;
  return {
    total: items.length,
    criadas: count("criada"),
    jaExistiam: count("ja_existia"),
    pendentes: count("pendente"),
    erros: count("erro"),
  };
}

/**
 * Ingere UM PDF. Nunca lança: o erro vira `status: "erro"` no item devolvido,
 * para um PDF ruim não derrubar o lote inteiro.
 */
export async function ingerirFaturaPdf(
  nomeArquivo: string,
  arrayBuffer: ArrayBuffer,
): Promise<IngestItem> {
  const item: IngestItem = {
    file: nomeArquivo,
    status: "erro",
    error: null,
    codigoInstalacao: null,
    ucNome: null,
    mesRef: null,
    anoRef: null,
  };

  try {
    // pdfjs-dist "transfere" (detacha) o Uint8Array passado ao getDocument.
    // Por isso clonamos: uma cópia pra parsear, outra pra persistir.
    const buffer = new Uint8Array(arrayBuffer);
    const bufferForStorage = Buffer.from(arrayBuffer.slice(0));
    const parsed = await parseFaturaPdf(buffer);
    item.codigoInstalacao = parsed.codigoInstalacao;
    item.mesRef = parsed.bill.mesReferencia;
    item.anoRef = parsed.bill.anoReferencia;

    if (!parsed.codigoInstalacao) {
      item.error = "Código da instalação não encontrado no PDF";
      return item;
    }
    if (!parsed.bill.anoReferencia || !parsed.bill.mesReferencia) {
      item.error = "Competência (mês/ano) não encontrada no PDF";
      return item;
    }

    // Resolve a UC: por ConsumerUnit.codigoUc OU codigoUcAntigo, depois por
    // CpflCredential.instalacao. A migração RGE (jul/2026) fez faturas novas
    // trazerem o "Número da UC" novo e as antigas o "Código da Instalação"
    // antigo — casar pelos dois campos garante que ambas caiam na mesma UC.
    let unit = await prisma.consumerUnit.findFirst({
      where: {
        OR: [
          { codigoUc: parsed.codigoInstalacao },
          { codigoUcAntigo: parsed.codigoInstalacao },
        ],
      },
      select: { id: true, nome: true },
    });
    if (!unit) {
      const cred = await prisma.cpflCredential.findFirst({
        where: { instalacao: parsed.codigoInstalacao, consumerUnitId: { not: null } },
        select: { consumerUnit: { select: { id: true, nome: true } } },
      });
      if (cred?.consumerUnit) unit = cred.consumerUnit;
    }

    // Se a instalação corresponde a uma usina cadastrada, marca plantId
    // (a bill é a conta de energia da UC da usina).
    const plantDaUsina = await prisma.plant.findFirst({
      where: {
        OR: [
          { unidadeConsumidora: parsed.codigoInstalacao },
          { unidadeConsumidoraAntiga: parsed.codigoInstalacao },
          { numeroUsina: parsed.codigoInstalacao },
          { codigoCliente: parsed.codigoInstalacao },
        ],
      },
      select: { id: true },
    });
    const plantIdDaUsina = plantDaUsina?.id ?? null;
    const fileName = `${parsed.bill.anoReferencia}-${String(parsed.bill.mesReferencia).padStart(2, "0")}.pdf`;

    if (unit) {
      item.ucNome = unit.nome;

      // IDEMPOTÊNCIA: competência já existe → PULA (não sobrescreve, não sobe PDF).
      const existing = await prisma.consumerBill.findUnique({
        where: {
          consumerUnitId_anoReferencia_mesReferencia: {
            consumerUnitId: unit.id,
            anoReferencia: parsed.bill.anoReferencia,
            mesReferencia: parsed.bill.mesReferencia,
          },
        },
        select: { id: true },
      });
      if (existing) {
        item.status = "ja_existia";
        return item;
      }

      const subdir = `bills/${unit.id}`;
      await saveBufferToStorage(bufferForStorage, subdir, fileName);
      const pdfUrl = `/api/files/${subdir}/${fileName}`;

      await prisma.consumerBill.create({
        data: {
          consumerUnitId: unit.id,
          plantId: plantIdDaUsina,
          ...parsed.bill,
          pdfUrl,
          fonteConsulta: "CPFL_PORTAL",
          syncedAt: new Date(),
        },
      });
      item.status = "criada";
    } else {
      // UC não cadastrada: salva órfã por (instalacao, ano, mes) — vincula quando
      // a UC for cadastrada. Também idempotente (não duplica / não sobrescreve).
      const existing = await prisma.consumerBill.findFirst({
        where: {
          consumerUnitId: null,
          instalacao: parsed.codigoInstalacao,
          anoReferencia: parsed.bill.anoReferencia,
          mesReferencia: parsed.bill.mesReferencia,
        },
        select: { id: true },
      });
      if (existing) {
        item.status = "ja_existia";
        return item;
      }

      const subdir = `bills/_pending/${parsed.codigoInstalacao}`;
      await saveBufferToStorage(bufferForStorage, subdir, fileName);
      const pdfUrl = `/api/files/${subdir}/${fileName}`;

      await prisma.consumerBill.create({
        data: {
          ...parsed.bill,
          pdfUrl,
          plantId: plantIdDaUsina,
          fonteConsulta: "CPFL_PORTAL",
          syncedAt: new Date(),
        },
      });
      item.status = "pendente";
    }
  } catch (err) {
    item.error =
      err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240);
    console.error(`[fatura-ingest] erro ao processar ${nomeArquivo}:`, err);
  }

  return item;
}
