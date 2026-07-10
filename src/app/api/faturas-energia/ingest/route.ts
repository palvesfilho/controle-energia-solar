/**
 * POST /api/faturas-energia/ingest
 *
 * Ingestão server-to-server de faturas de energia baixadas pelo robô da RGE
 * (backfill de meses ANTERIORES — o mês vigente continua vindo do Infosimples).
 *
 * O robô baixa os PDFs do portal e faz POST deles aqui. Esta rota:
 *   1. parseia o PDF (parseFaturaPdf) → extrai instalação + competência (mês/ano);
 *   2. resolve a UC (ConsumerUnit.codigoUc → CpflCredential.instalacao);
 *   3. sobe o PDF no R2 (saveBufferToStorage);
 *   4. cria o ConsumerBill de forma IDEMPOTENTE.
 *
 * IDEMPOTÊNCIA (regra do backfill): se a competência já existe para a UC, a
 * fatura é PULADA — nunca sobrescreve. Isso protege o dado do mês vigente já
 * baixado pelo Infosimples (mais rico) e permite reprocessar sem estragar nada.
 *
 * NÃO dispara geração de cobrança/payables — é backfill histórico; esses fluxos
 * financeiros seguem manuais/pelos caminhos já existentes.
 *
 * Autenticação: header `Authorization: Bearer <CRON_SECRET>` (ou `?token=`).
 * Entrada: multipart/form-data com um ou mais campos `files` (PDFs).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveBufferToStorage } from "@/lib/file-storage";
import { parseFaturaPdf } from "@/lib/fatura-pdf-parser";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sem segredo configurado: bloqueia explicitamente
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("token") === secret) return true;
  return false;
}

type IngestStatus = "criada" | "ja_existia" | "pendente" | "erro";

interface IngestItem {
  file: string;
  status: IngestStatus;
  error: string | null;
  codigoInstalacao: string | null;
  ucNome: string | null;
  mesRef: number | null;
  anoRef: number | null;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized — envie Authorization: Bearer <CRON_SECRET>" },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Envie multipart/form-data com o campo 'files' (PDFs)." },
      { status: 400 },
    );
  }

  const files = formData.getAll("files");
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Nenhum arquivo enviado (campo 'files')." },
      { status: 400 },
    );
  }

  const results: IngestItem[] = [];

  for (const f of files) {
    if (!(f instanceof File)) continue;
    const item: IngestItem = {
      file: f.name,
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
      const arrayBuffer = await f.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      const bufferForStorage = Buffer.from(arrayBuffer.slice(0));
      const parsed = await parseFaturaPdf(buffer);
      item.codigoInstalacao = parsed.codigoInstalacao;
      item.mesRef = parsed.bill.mesReferencia;
      item.anoRef = parsed.bill.anoReferencia;

      if (!parsed.codigoInstalacao) {
        item.error = "Código da instalação não encontrado no PDF";
        results.push(item);
        continue;
      }
      if (!parsed.bill.anoReferencia || !parsed.bill.mesReferencia) {
        item.error = "Competência (mês/ano) não encontrada no PDF";
        results.push(item);
        continue;
      }

      // Resolve a UC: por ConsumerUnit.codigoUc, depois por CpflCredential.instalacao.
      let unit = await prisma.consumerUnit.findFirst({
        where: { codigoUc: parsed.codigoInstalacao },
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
          results.push(item);
          continue;
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
          results.push(item);
          continue;
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
      item.error = err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240);
      console.error(`[ingest-rge] erro ao processar ${f.name}:`, err);
    }

    results.push(item);
  }

  const count = (s: IngestStatus) => results.filter((r) => r.status === s).length;
  return NextResponse.json({
    total: results.length,
    criadas: count("criada"),
    jaExistiam: count("ja_existia"),
    pendentes: count("pendente"),
    erros: count("erro"),
    items: results,
  });
}
