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
import { enrichBillFromPdfFallback, describeFallback } from "@/lib/infosimples-pdf-fallback";
import { populateBillingFromBill } from "@/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "@/lib/investor-payables";

/**
 * O lote cobre DOIS donos de credencial: UC de cliente e a UC da própria
 * usina. Antes só as de UC entravam (`consumerUnitId: { not: null }`) e as 23
 * credenciais de usina nunca eram consultadas — nem uma vez, então nem erro
 * apareciam: ficavam em `statusSync: PENDING` para sempre e as faturas das
 * usinas só entravam por upload manual, que parou em maio/2026.
 */
type SyncAlvo = {
  tipo: "UC" | "USINA";
  /** id da ConsumerUnit ou da Plant, conforme `tipo`. */
  id: string;
  codigoUc: string;
  nome: string;
};

interface SyncResultItem {
  tipo: "UC" | "USINA";
  consumerUnitId: string | null;
  plantId: string | null;
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

// Dias de folga após a data da próxima leitura antes da fatura aparecer no portal.
const DIAS_APOS_LEITURA = 2;

// Disjuntor: aborta o lote após N consultas seguidas que bateram na Infosimples
// e falharam. Quando a origem (RGE) está fora do ar, todas as UCs falham em
// sequência com o mesmo código e o lote inteiro vira saldo queimado sem
// nenhuma fatura baixada.
const MAX_FALHAS_CONSECUTIVAS = 5;

async function persistPdf(
  alvo: SyncAlvo,
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
    // Mesmo destino que a sync individual de cada dono já usava.
    const subdir = alvo.tipo === "UC" ? `bills/${alvo.id}` : `plant-bills/${alvo.id}`;
    await saveBufferToStorage(buffer, subdir, fileName);
    return `/api/files/${subdir}/${fileName}`;
  } catch {
    return null;
  }
}

async function syncOne(alvo: SyncAlvo): Promise<SyncResultItem> {
  const { tipo, id, codigoUc, nome } = alvo;
  const credWhere =
    tipo === "UC" ? { consumerUnitId: id } : { plantId: id };
  const base = {
    tipo,
    consumerUnitId: tipo === "UC" ? id : null,
    plantId: tipo === "USINA" ? id : null,
    codigoUc,
    nome,
  };

  const credential = await prisma.cpflCredential.findUnique({ where: credWhere });
  if (!credential || !credential.active) {
    return {
      ...base,
      success: false,
      synced: 0,
      error: "Sem credencial ativa",
      apiCalled: false,
    };
  }

  // ultimaTentativaSync marca a hora da TENTATIVA. Sem ela o erro aparece na
  // tela com a data do último sucesso e parece que ninguém tentou desde então.
  await prisma.cpflCredential.update({
    where: credWhere,
    data: { statusSync: "PENDING", erroSync: null, ultimaTentativaSync: new Date() },
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
        alvo,
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
      if (fallback.usedFallback || fallback.reason) {
        console.info(
          `[sync-all] PDF fallback em UC=${codigoUc} ${billData.anoReferencia}-${String(billData.mesReferencia).padStart(2, "0")}: ${describeFallback(fallback)}`,
        );
      }

      // ConsumerBill.plantId representa "bill DA usina" (conta da UC da própria
      // usina) e não "bill de UC que faz rateio com essa usina". Por isso, na
      // sync de UC de cliente, não copiamos ConsumerUnit.plantId para cá.
      // Preserva pdfUrl existente quando persistPdf devolveu null. Senão,
      // sync flaky da Infosimples zera o vínculo mesmo com PDF no R2.
      const { pdfUrl: nextPdfUrl, ...billDataNoPdf } = billData;

      if (tipo === "USINA") {
        // Não há unique composto por plantId: casa pelo trio
        // (plantId, ano, mês) com consumerUnitId nulo, igual à sync individual
        // da usina. populateBillingFromBill/syncInvestorPayables ficam de fora
        // de propósito: a conta da usina não vira cobrança de cliente nem
        // parcela de investidor — quem faz isso é a fatura da UC em rateio.
        const existente = await prisma.consumerBill.findFirst({
          where: {
            plantId: id,
            consumerUnitId: null,
            anoReferencia: billData.anoReferencia,
            mesReferencia: billData.mesReferencia,
          },
          select: { id: true },
        });
        if (existente) {
          await prisma.consumerBill.update({
            where: { id: existente.id },
            data: {
              ...billDataNoPdf,
              ...(nextPdfUrl ? { pdfUrl: nextPdfUrl } : {}),
              syncedAt: new Date(),
            },
          });
        } else {
          await prisma.consumerBill.create({
            data: {
              plantId: id,
              consumerUnitId: null,
              ...billDataNoPdf,
              pdfUrl: nextPdfUrl ?? null,
              syncedAt: new Date(),
            },
          });
        }
        syncedCount++;
        continue;
      }

      const upserted = await prisma.consumerBill.upsert({
        where: {
          consumerUnitId_anoReferencia_mesReferencia: {
            consumerUnitId: id,
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
          consumerUnitId: id,
          ...billDataNoPdf,
          pdfUrl: nextPdfUrl ?? null,
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
      where: credWhere,
      data: {
        statusSync: "SUCCESS",
        ultimaSync: new Date(),
        ultimaTentativaSync: new Date(),
        erroSync: syncedCount === 0 ? "Nenhuma fatura encontrada" : null,
      },
    });

    return {
      ...base,
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
      where: credWhere,
      data: { statusSync: "ERROR", erroSync: msg, ultimaTentativaSync: new Date() },
    });
    return {
      ...base,
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
    where: {
      active: true,
      OR: [{ consumerUnitId: { not: null } }, { plantId: { not: null } }],
    },
    include: {
      consumerUnit: { select: { id: true, codigoUc: true, nome: true } },
      plant: { select: { id: true, name: true, unidadeConsumidora: true } },
    },
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Pré-filtragem: separa elegíveis (precisam consultar Infosimples) de
  // skipped (já têm fatura recente / aguardando próxima leitura). O total
  // mostrado no progresso reflete apenas as elegíveis pra não confundir.
  const elegiveis: SyncAlvo[] = [];
  const skippedAhead: SyncResultItem[] = [];

  for (const cred of creds) {
    // A credencial pertence a uma UC de cliente OU à UC da própria usina.
    // `codigoUc` da usina cai na instalação da credencial quando o cadastro da
    // usina está sem `unidadeConsumidora` — a tela lista por esse campo.
    const alvo: SyncAlvo | null = cred.consumerUnit
      ? {
          tipo: "UC",
          id: cred.consumerUnit.id,
          codigoUc: cred.consumerUnit.codigoUc,
          nome: cred.consumerUnit.nome,
        }
      : cred.plant
        ? {
            tipo: "USINA",
            id: cred.plant.id,
            codigoUc: cred.plant.unidadeConsumidora ?? cred.instalacao,
            nome: `${cred.plant.name} (usina)`,
          }
        : null;
    if (!alvo) continue;

    const ultimaBill = await prisma.consumerBill.findFirst({
      where: {
        ...(alvo.tipo === "UC"
          ? { consumerUnitId: alvo.id }
          : { plantId: alvo.id, consumerUnitId: null }),
        proximaLeitura: { not: null },
      },
      orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
      select: { proximaLeitura: true },
    });

    if (ultimaBill?.proximaLeitura) {
      const elegivelEm = new Date(ultimaBill.proximaLeitura);
      elegivelEm.setDate(elegivelEm.getDate() + DIAS_APOS_LEITURA);
      if (hoje < elegivelEm) {
        const dataStr = elegivelEm.toLocaleDateString("pt-BR");
        skippedAhead.push({
          tipo: alvo.tipo,
          consumerUnitId: alvo.tipo === "UC" ? alvo.id : null,
          plantId: alvo.tipo === "USINA" ? alvo.id : null,
          codigoUc: alvo.codigoUc,
          nome: alvo.nome,
          success: false,
          synced: 0,
          error: null,
          skipped: true,
          skipReason: `Aguardando próxima leitura — consulta a partir de ${dataStr}`,
        });
        continue;
      }
    }

    elegiveis.push(alvo);
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
        for (const alvo of elegiveis) {
          // Operador fechou a aba / cancelou: para de queimar saldo.
          if (req.signal.aborted) {
            abortadoPor = "Cancelado pelo operador";
            break;
          }
          index++;
          const result = await syncOne(alvo);
          results.push(result);
          send({
            type: "progress",
            index,
            total: elegiveis.length,
            result,
          });

          // Só conta pro disjuntor a consulta que realmente bateu na API — "sem
          // credencial ativa" não consome saldo e não indica origem fora do ar.
          if (!result.apiCalled) continue;
          if (result.success) {
            falhasSeguidas = 0;
          } else if (++falhasSeguidas >= MAX_FALHAS_CONSECUTIVAS) {
            abortadoPor =
              `Interrompido após ${MAX_FALHAS_CONSECUTIVAS} falhas seguidas ` +
              `(última: ${result.error ?? "erro desconhecido"}). ` +
              `A origem parece estar fora do ar — as ${elegiveis.length - index} UCs ` +
              `restantes não foram consultadas para não consumir saldo à toa.`;
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
