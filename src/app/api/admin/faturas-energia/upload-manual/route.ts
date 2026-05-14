import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { saveBufferToStorage } from "@/lib/file-storage";
import { parseFaturaPdf } from "@/lib/fatura-pdf-parser";
import { populateBillingFromBill } from "@/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "@/lib/investor-payables";

export const runtime = "nodejs";

interface UploadResultItem {
  file: string;
  success: boolean;
  error: string | null;
  warning: string | null;
  codigoInstalacao: string | null;
  ucNome: string | null;
  mesRef: number | null;
  anoRef: number | null;
  valorTotal: number | null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files");
  if (files.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const results: UploadResultItem[] = [];

  for (const f of files) {
    if (!(f instanceof File)) continue;
    const item: UploadResultItem = {
      file: f.name,
      success: false,
      error: null,
      warning: null,
      codigoInstalacao: null,
      ucNome: null,
      mesRef: null,
      anoRef: null,
      valorTotal: null,
    };

    try {
      // pdfjs-dist consome (transfere) o Uint8Array passado em getDocument({data:...}),
      // deixando o buffer original detached. Por isso clonamos: uma cópia pra parsear,
      // outra pra persistir em disco depois. Sem o clone, o save grava 0 bytes.
      const arrayBuffer = await f.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      const bufferForStorage = Buffer.from(arrayBuffer.slice(0));
      const parsed = await parseFaturaPdf(buffer);
      item.codigoInstalacao = parsed.codigoInstalacao;
      item.mesRef = parsed.bill.mesReferencia;
      item.anoRef = parsed.bill.anoReferencia;
      item.valorTotal = parsed.bill.valorTotal;

      if (!parsed.codigoInstalacao) {
        item.error = "Código da instalação não encontrado no PDF";
        results.push(item);
        continue;
      }

      // Localiza UC: por ConsumerUnit.codigoUc, depois por CpflCredential.instalacao.
      // Também precisamos saber se essa instalação corresponde à própria UC de
      // uma usina — nesse caso a bill é marcada com plantId (é a fatura da usina).
      let unit = await prisma.consumerUnit.findFirst({
        where: { codigoUc: parsed.codigoInstalacao },
        select: { id: true, nome: true },
      });
      if (!unit) {
        const cred = await prisma.cpflCredential.findFirst({
          where: { instalacao: parsed.codigoInstalacao, consumerUnitId: { not: null } },
          select: {
            consumerUnitId: true,
            consumerUnit: { select: { id: true, nome: true } },
          },
        });
        if (cred?.consumerUnit) unit = cred.consumerUnit;
      }
      // Se o código da instalação bate com uma usina cadastrada, registra o
      // plantId — a bill representa a conta de energia da UC da usina.
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
        const subdir = `bills/${unit.id}`;
        await saveBufferToStorage(bufferForStorage, subdir, fileName);
        const pdfUrl = `/api/files/${subdir}/${fileName}`;

        const upserted = await prisma.consumerBill.upsert({
          where: {
            consumerUnitId_anoReferencia_mesReferencia: {
              consumerUnitId: unit.id,
              anoReferencia: parsed.bill.anoReferencia,
              mesReferencia: parsed.bill.mesReferencia,
            },
          },
          update: {
            ...parsed.bill,
            pdfUrl,
            plantId: plantIdDaUsina,
            syncedAt: new Date(),
          },
          create: {
            consumerUnitId: unit.id,
            plantId: plantIdDaUsina,
            ...parsed.bill,
            pdfUrl,
            syncedAt: new Date(),
          },
        });
        // Preenche ConsumerUnitBilling (campos da aba "Valores da Cobrança")
        await populateBillingFromBill(upserted.id).catch((e) =>
          console.error("[upload-manual] populateBillingFromBill falhou:", e),
        );
        await syncInvestorPayablesFromBill(upserted.id).catch((e) =>
          console.error("[upload-manual] syncInvestorPayablesFromBill falhou:", e),
        );
      } else {
        // UC não cadastrada: salva a fatura órfã por (instalacao, ano, mes).
        // Fica aguardando vincular quando a UC for cadastrada.
        const subdir = `bills/_pending/${parsed.codigoInstalacao}`;
        await saveBufferToStorage(bufferForStorage, subdir, fileName);
        const pdfUrl = `/api/files/${subdir}/${fileName}`;

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
          await prisma.consumerBill.update({
            where: { id: existing.id },
            data: { ...parsed.bill, pdfUrl, plantId: plantIdDaUsina, syncedAt: new Date() },
          });
        } else {
          await prisma.consumerBill.create({
            data: { ...parsed.bill, pdfUrl, plantId: plantIdDaUsina, syncedAt: new Date() },
          });
        }
        if (plantIdDaUsina) {
          item.warning = `Fatura registrada como da usina (código ${parsed.codigoInstalacao}).`;
        } else {
          item.warning = `UC não cadastrada — fatura salva como pendente. Cadastre a UC com código ${parsed.codigoInstalacao} para vincular.`;
        }
      }

      item.success = true;
    } catch (err) {
      item.error = shortenError(err);
      console.error(`[upload-manual] erro ao processar ${f.name}:`, err);
    }

    results.push(item);
  }

  const okCount = results.filter((r) => r.success).length;
  return NextResponse.json({
    total: results.length,
    ok: okCount,
    falha: results.length - okCount,
    items: results,
  });
}

function shortenError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Mensagens do Prisma incluem o payload inteiro da query; extrai só a linha útil.
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const marker = lines.find(
    (l) =>
      l.startsWith("Argument ") ||
      l.startsWith("Unknown arg") ||
      l.startsWith("Unknown field") ||
      l.startsWith("Invalid value") ||
      l.includes("Unique constraint") ||
      l.includes("Foreign key constraint"),
  );
  if (marker) return marker.slice(0, 240);
  const first = lines[0] ?? raw;
  return first.length > 240 ? first.slice(0, 240) + "…" : first;
}
