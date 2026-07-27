import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
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
  /** True quando a consulta chegou a bater na Infosimples (consome saldo). */
  apiCalled?: boolean;
}

// Dias de folga apÃ³s a data da prÃ³xima leitura antes da fatura aparecer no portal.
const DIAS_APOS_LEITURA = 2;

// Disjuntor: aborta o lote apÃ³s N consultas seguidas que bateram na Infosimples
// e falharam. Quando a origem (RGE) estÃ¡ fora do ar, todas as UCs falham em
// sequÃªncia com o mesmo cÃ³digo e o lote inteiro vira saldo queimado sem
// nenhuma fatura baixada.
const MAX_FALHAS_CONSECUTIVAS = 5;

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
      apiCalled: false,
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

      // Fallback: se OCR Infosimples deixou medidor de injeÃ§Ã£o vazio mas hÃ¡
      // injeÃ§Ã£o fiscal > 0 e PDF salvo, recupera do parser PDF.
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

      // ConsumerBill.plantId representa "bill DA usina" (conta da UC da prÃ³pria
      // usina) e nÃ£o "bill de UC que faz rateio com essa usina". Por isso nÃ£o
      // copiamos ConsumerUnit.plantId para cÃ¡: essa sync Ã© sempre de UC de
      // cliente (filtro consumerUnitId: { not: null } no POST).
      // Preserva pdfUrl existente quando persistPdf devolveu null. SenÃ£o,
      // sync flaky da Infosimples zera o vÃ­nculo mesmo com PDF no R2.
      const { pdfUrl: nextPdfUrl, ...billDataNoPdf } = billData;
      const upserted = await prisma.consumerBill.upsert({
        where: {
          consumerUnitId_anoReferencia_mesReferencia: {
            consumerUnitId,
            anoReferencia: billData.anoReferencia,
            mesReferencia: billData.mesReferencia,
          },
        },
        update: {
          ...billDataNoPdf,
          ...(nextPdfUrl ? { pdfUrl: nextPdfUrl } : {}),
          syncedAt: new Date(),
        },
        create: {
          consumerUnitId,
          ...billDataNoPdf,
          pdfUrl: nextPdfUrl ?? null,
          syncedAt: new Date(),
        },
      });
      // Preenche ConsumerUnitBilling (campos da aba "Valores da CobranÃ§a")
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
      apiCalled: true,
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
      apiCalled: true,
    };
  }
}

export async function POST(req: NextRequest) {
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

  // PrÃ©-filtragem: separa elegÃ­veis (precisam consultar Infosimples) de
  // skipped (jÃ¡ tÃªm fatura recente / aguardando prÃ³xima leitura). O total
  // mostrado no progresso reflete apenas as elegÃ­veis pra nÃ£o confundir.
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
          skipReason: `Aguardando prÃ³xima leitura â€” consulta a partir de ${dataStr}`,
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
      let falhasSeguidas = 0;
      let abortadoPor: string | null = null;

      try {
        for (const { uc } of elegiveis) {
          // Operador fechou a aba / cancelou: para de queimar saldo.
          if (req.signal.aborted) {
            abortadoPor = "Cancelado pelo operador";
            break;
          }
          index++;
          const result = await syncOne(uc.id, uc.codigoUc, uc.nome);
          results.push(result);
          send({
            type: "progress",
            index,
            total: elegiveis.length,
            result,
          });

          // SÃ³ conta pro disjuntor a consulta que realmente bateu na API — "sem
          // credencial ativa" nÃ£o consome saldo e nÃ£o indica origem fora do ar.
          if (!result.apiCalled) continue;
          if (result.success) {
            falhasSeguidas = 0;
          } else if (++falhasSeguidas >= MAX_FALHAS_CONSECUTIVAS) {
            abortadoPor =
              `Interrompido apÃ³s ${MAX_FALHAS_CONSECUTIVAS} falhas seguidas ` +
              `(Ãºltima: ${result.error ?? "erro desconhecido"}). ` +
              `A origem parece estar fora do ar — as ${elegiveis.length - index} UCs ` +
              `restantes nÃ£o foram consultadas para nÃ£o consumir saldo Ã  toa.`;
            console.warn(`[sync-all] disjuntor acionado: ${abortadoPor}`);
            break;
          }
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
          aborted: abortadoPor,
          naoConsultadas: abortadoPor ? elegiveis.length - index : 0,
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
