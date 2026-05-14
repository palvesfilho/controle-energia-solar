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

async function persistPdf(
  plantId: string,
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
    const subdir = `plant-bills/${plantId}`;
    await saveBufferToStorage(buffer, subdir, fileName);
    return `/api/files/${subdir}/${fileName}`;
  } catch {
    return null;
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credential = await prisma.cpflCredential.findUnique({
    where: { plantId: id },
  });

  if (!credential) {
    return NextResponse.json(
      { error: "Credenciais CPFL/RGE não cadastradas para esta usina" },
      { status: 400 }
    );
  }

  if (!credential.active) {
    return NextResponse.json({ error: "Credenciais desativadas" }, { status: 400 });
  }

  await prisma.cpflCredential.update({
    where: { plantId: id },
    data: { statusSync: "PENDING", erroSync: null },
  });

  try {
    const senha = decrypt(credential.senhaCpfl);

    const faturas = await consultarFatura({
      email: credential.emailCpfl,
      senha,
      instalacao: credential.instalacao,
    });

    if (!faturas || faturas.length === 0) {
      await prisma.cpflCredential.update({
        where: { plantId: id },
        data: {
          statusSync: "SUCCESS",
          ultimaSync: new Date(),
          erroSync: "Nenhuma fatura encontrada",
        },
      });
      return NextResponse.json({
        success: true,
        message: "Consulta realizada, mas nenhuma fatura encontrada",
        synced: 0,
      });
    }

    let syncedCount = 0;

    for (const fatura of faturas) {
      const billDataRaw = parseBillData(fatura);

      const sourceUrl = fatura.pdf_url || fatura.site_receipts?.[0] || null;
      const persistedUrl = await persistPdf(
        id,
        billDataRaw.anoReferencia,
        billDataRaw.mesReferencia,
        sourceUrl,
      );
      billDataRaw.pdfUrl = persistedUrl;

      const fallback = await enrichBillFromPdfFallback(
        billDataRaw as unknown as Record<string, unknown>,
        billDataRaw.pdfUrl,
      );
      const billData = fallback.enriched as typeof billDataRaw;
      if (fallback.usedFallback) {
        console.info(
          `[plants/bills/sync] PDF fallback aplicado em plant=${id} ${billData.anoReferencia}-${String(billData.mesReferencia).padStart(2, "0")}: ${fallback.fieldsBackfilled.join(", ")}`,
        );
      }

      const existing = await prisma.consumerBill.findFirst({
        where: {
          plantId: id,
          consumerUnitId: null,
          anoReferencia: billData.anoReferencia,
          mesReferencia: billData.mesReferencia,
        },
      });

      if (existing) {
        await prisma.consumerBill.update({
          where: { id: existing.id },
          data: { ...billData, syncedAt: new Date() },
        });
      } else {
        await prisma.consumerBill.create({
          data: {
            plantId: id,
            consumerUnitId: null,
            ...billData,
            syncedAt: new Date(),
          },
        });
      }
      syncedCount++;
    }

    await prisma.cpflCredential.update({
      where: { plantId: id },
      data: {
        statusSync: "SUCCESS",
        ultimaSync: new Date(),
        erroSync: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${syncedCount} fatura(s) sincronizada(s) com sucesso`,
      synced: syncedCount,
    });
  } catch (error) {
    const errorMessage =
      error instanceof InfosimplesApiError
        ? `${error.message} (code: ${error.code})`
        : error instanceof Error
          ? error.message
          : "Erro desconhecido na sincronização";

    await prisma.cpflCredential.update({
      where: { plantId: id },
      data: {
        statusSync: "ERROR",
        erroSync: errorMessage,
      },
    });

    return NextResponse.json(
      { error: errorMessage, success: false },
      { status: 500 }
    );
  }
}
