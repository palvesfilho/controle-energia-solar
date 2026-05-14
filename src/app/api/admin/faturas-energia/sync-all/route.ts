import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { decrypt } from "@/lib/crypto";
import { saveBufferToStorage } from "@/lib/file-storage";
import {
  consultarFatura,
  parseBillData,
  InfosimplesApiError,
} from "@/lib/infosimples";
import { enrichBillFromPdfFallback } from "@/lib/infosimples-pdf-fallback";
import { populateBillingFromBill } from "@/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "@/lib/investor-payables";

interface SyncResultItem {
  consumerUnitId: string;
  codigoUc: string;
  nome: string;
  success: boolean;
  synced: number;
  error: string | null;
  skipped?: boolean;
  skipReason?: string;
}

// Dias de folga após a data da próxima leitura antes da fatura aparecer no portal.
const DIAS_APOS_LEITURA = 2;

async function persistPdf(
  consumerUnitId: string,
  ano: number,
  mes: number,
  sourceUrl: string | null | undefined,
): Promise<string | null> {
  if (!sourceUrl) return null;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const fileName = `${ano}-${String(mes).padStart(2, "0")}.pdf`;
    const subdir = `bills/${consumerUnitId}`;
    await saveBufferToStorage(buffer, subdir, fileName);
    return `/api/files/${subdir}/${fileName}`;
  } catch {
    return null;
  }
}

async function syncOne(
  consumerUnitId: string,
  codigoUc: string,
  nome: string,
): Promise<SyncResultItem> {
  const credential = await prisma.cpflCredential.findUnique({
    where: { consumerUnitId },
  });
  if (!credential || !credential.active) {
    return {
      consumerUnitId,
      codigoUc,
      nome,
      success: false,
      synced: 0,
      error: "Sem credencial ativa",
    };
  }

  await prisma.cpflCredential.update({
    where: { consumerUnitId },
    data: { statusSync: "PENDING", erroSync: null },
  });

  try {
    const senha = decrypt(credential.senhaCpfl);
    const faturas = await consultarFatura({
      email: credential.emailCpfl,
      senha,
      instalacao: credential.instalacao,
    });

    let syncedCount = 0;
    for (const fatura of faturas ?? []) {
      const billDataRaw = parseBillData(fatura);
      const sourceUrl = fatura.pdf_url || fatura.site_receipts?.[0] || null;
      billDataRaw.pdfUrl = await persistPdf(
        consumerUnitId,
        billDataRaw.anoReferencia,
        billDataRaw.mesReferencia,
        sourceUrl,
      );

      // Fallback: se OCR Infosimples deixou medidor de injeção vazio mas há
      // injeção fiscal > 0 e PDF salvo, recupera do parser PDF.
      const fallback = await enrichBillFromPdfFallback(
        billDataRaw as unknown as Record<string, unknown>,
        billDataRaw.pdfUrl,
      );
      const billData = fallback.enriched as typeof billDataRaw;
      if (fallback.usedFallback) {
        console.info(
          `[sync-all] PDF fallback aplicado em UC=${codigoUc} ${billData.anoReferencia}-${String(billData.mesReferencia).padStart(2, "0")}: ${fallback.fieldsBackfilled.join(", ")}`,
        );
      }

      // ConsumerBill.plantId representa "bill DA usina" (conta da UC da própria
      // usina) e não "bill de UC que faz rateio com essa usina". Por isso não
      // copiamos ConsumerUnit.plantId para cá: essa sync é sempre de UC de
      // cliente (filtro consumerUnitId: { not: null } no POST).
      const upserted = await prisma.consumerBill.upsert({
        where: {
          consumerUnitId_anoReferencia_mesReferencia: {
            consumerUnitId,
            anoReferencia: billData.anoReferencia,
            mesReferencia: billData.mesReferencia,
          },
        },
        update: {
          ...billData,
          syncedAt: new Date(),
        },
        create: {
          consumerUnitId,
          ...billData,
          syncedAt: new Date(),
        },
      });
      // Preenche ConsumerUnitBilling (campos da aba "Valores da Cobrança")
      await populateBillingFromBill(upserted.id).catch((e) =>
        console.error("[sync-all] populateBillingFromBill falhou:", e),
      );
      await syncInvestorPayablesFromBill(upserted.id).catch((e) =>
        console.error("[sync-all] syncInvestorPayablesFromBill falhou:", e),
      );
      syncedCount++;
    }

    await prisma.cpflCredential.update({
      where: { consumerUnitId },
      data: {
        statusSync: "SUCCESS",
        ultimaSync: new Date(),
        erroSync: syncedCount === 0 ? "Nenhuma fatura encontrada" : null,
      },
    });

    return {
      consumerUnitId,
      codigoUc,
      nome,
      success: true,
      synced: syncedCount,
      error: null,
    };
  } catch (error) {
    const msg =
      error instanceof InfosimplesApiError
        ? `${error.message} (code: ${error.code})`
        : error instanceof Error
          ? error.message
          : "Erro desconhecido";
    await prisma.cpflCredential.update({
      where: { consumerUnitId },
      data: { statusSync: "ERROR", erroSync: msg },
    });
    return {
      consumerUnitId,
      codigoUc,
      nome,
      success: false,
      synced: 0,
      error: msg,
    };
  }
}

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = await prisma.cpflCredential.findMany({
    where: { active: true, consumerUnitId: { not: null } },
    include: {
      consumerUnit: { select: { id: true, codigoUc: true, nome: true } },
    },
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Pré-filtragem: separa elegíveis (precisam consultar Infosimples) de
  // skipped (já têm fatura recente / aguardando próxima leitura). O total
  // mostrado no progresso reflete apenas as elegíveis pra não confundir.
  const elegiveis: { uc: { id: string; codigoUc: string; nome: string } }[] = [];
  const skippedAhead: SyncResultItem[] = [];

  for (const cred of creds) {
    const uc = cred.consumerUnit;
    if (!uc) continue;

    const ultimaBill = await prisma.consumerBill.findFirst({
      where: { consumerUnitId: uc.id, proximaLeitura: { not: null } },
      orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
      select: { proximaLeitura: true },
    });

    if (ultimaBill?.proximaLeitura) {
      const elegivelEm = new Date(ultimaBill.proximaLeitura);
      elegivelEm.setDate(elegivelEm.getDate() + DIAS_APOS_LEITURA);
      if (hoje < elegivelEm) {
        const dataStr = elegivelEm.toLocaleDateString("pt-BR");
        skippedAhead.push({
          consumerUnitId: uc.id,
          codigoUc: uc.codigoUc,
          nome: uc.nome,
          success: false,
          synced: 0,
          error: null,
          skipped: true,
          skipReason: `Aguardando próxima leitura — consulta a partir de ${dataStr}`,
        });
        continue;
      }
    }

    elegiveis.push({ uc });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      send({
        type: "start",
        total: elegiveis.length,
        skippedAhead,
      });

      const results: SyncResultItem[] = [...skippedAhead];
      let index = 0;

      try {
        for (const { uc } of elegiveis) {
          index++;
          const result = await syncOne(uc.id, uc.codigoUc, uc.nome);
          results.push(result);
          send({
            type: "progress",
            index,
            total: elegiveis.length,
            result,
          });
        }

        const skippedCount = results.filter((r) => r.skipped).length;
        const successCount = results.filter((r) => r.success).length;
        const errorCount = results.filter(
          (r) => !r.success && !r.skipped,
        ).length;
        const syncedTotal = results.reduce((acc, r) => acc + r.synced, 0);

        send({
          type: "summary",
          total: results.length,
          successCount,
          errorCount,
          skippedCount,
          syncedTotal,
        });
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : "Erro desconhecido",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
