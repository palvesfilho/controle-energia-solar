import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { parseFaturaPdf } from "@/lib/fatura-pdf-parser";
import { getMonthlyTotal as froniusMonthlyTotal } from "@/lib/fronius";
import { getMonthlyTotal as huaweiMonthlyTotal } from "@/lib/huawei";
import { getMonthlyTotal as sungrowMonthlyTotal } from "@/lib/sungrow";
import { getMonthlyTotal as solaredgeMonthlyTotal } from "@/lib/solaredge";

export const runtime = "nodejs";

const TOLERANCE_PCT = 2;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const formData = await req.formData();
  const brasilSolarClientId = formData.get("brasilSolarClientId");
  const file = formData.get("file");

  if (typeof brasilSolarClientId !== "string" || !brasilSolarClientId) {
    return NextResponse.json({ error: "brasilSolarClientId obrigatório" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file (PDF) obrigatório" }, { status: 400 });
  }

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id: brasilSolarClientId },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      potenciaInstalada: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      proprietario: { select: { id: true, nome: true } },
    },
  });
  if (!client) {
    return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
  }

  const platform = client.plataformaMonitoramento?.toUpperCase() ?? null;
  if (!platform || !client.monitoramentoPlantId) {
    return NextResponse.json(
      { error: "Usina sem plataforma ou monitoramentoPlantId configurado" },
      { status: 400 },
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseFaturaPdf(buffer);
  } catch (e) {
    return NextResponse.json(
      { error: "Falha ao ler PDF", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const { mesReferencia, anoReferencia, energiaInjetadaMedidorKwh, leituraInjetadaAnterior, leituraInjetadaAtual, constanteMedidorInjetada } =
    parsed.bill;

  if (!mesReferencia || !anoReferencia) {
    return NextResponse.json(
      { error: "Não foi possível extrair mês/ano de referência da fatura" },
      { status: 400 },
    );
  }

  let inversor: { totalKwh: number; days: number } | null = null;
  let inversorError: string | null = null;
  try {
    if (platform === "FRONIUS") {
      inversor = await froniusMonthlyTotal(client.monitoramentoPlantId, anoReferencia, mesReferencia);
    } else if (platform === "HUAWEI") {
      inversor = await huaweiMonthlyTotal(client.monitoramentoPlantId, anoReferencia, mesReferencia);
    } else if (platform === "SUNGROW") {
      inversor = await sungrowMonthlyTotal(client.monitoramentoPlantId, anoReferencia, mesReferencia);
    } else if (platform === "SOLAREDGE") {
      const siteId = parseInt(client.monitoramentoPlantId, 10);
      if (Number.isNaN(siteId)) {
        inversorError = "Site ID SolarEdge inválido (não numérico)";
      } else {
        inversor = await solaredgeMonthlyTotal(siteId, anoReferencia, mesReferencia);
      }
    } else {
      inversorError = `Plataforma '${platform}' não suportada`;
    }
  } catch (e) {
    inversorError = e instanceof Error ? e.message : String(e);
  }

  const injetadaKwh = energiaInjetadaMedidorKwh ?? null;
  const inversorKwh = inversor?.totalKwh ?? null;

  let diffKwh: number | null = null;
  let diffPct: number | null = null;
  let status: "OK" | "ALERTA" | "SEM_FATURA" | "SEM_INVERSOR" = "SEM_INVERSOR";

  if (injetadaKwh == null) {
    status = "SEM_FATURA";
  } else if (inversorKwh == null) {
    status = "SEM_INVERSOR";
  } else {
    diffKwh = inversorKwh - injetadaKwh;
    diffPct = injetadaKwh > 0 ? (diffKwh / injetadaKwh) * 100 : null;
    status = diffPct != null && Math.abs(diffPct) <= TOLERANCE_PCT ? "OK" : "ALERTA";
  }

  return NextResponse.json({
    usina: {
      id: client.id,
      nome: client.nome,
      codigoUc: client.codigoUc,
      potenciaInstalada: client.potenciaInstalada,
      plataforma: platform,
      monitoramentoPlantId: client.monitoramentoPlantId,
      proprietario: client.proprietario,
    },
    fatura: {
      arquivo: file.name,
      codigoInstalacao: parsed.codigoInstalacao,
      mesReferencia,
      anoReferencia,
      energiaInjetadaMedidorKwh: injetadaKwh,
      leituraAnterior: leituraInjetadaAnterior ?? null,
      leituraAtual: leituraInjetadaAtual ?? null,
      constante: constanteMedidorInjetada ?? null,
    },
    inversor: inversor
      ? { totalKwh: inversor.totalKwh, diasComLeitura: inversor.days, error: null }
      : { totalKwh: null, diasComLeitura: null, error: inversorError },
    comparacao: {
      injetadaKwh,
      inversorKwh,
      diffKwh,
      diffPct,
      tolerancePct: TOLERANCE_PCT,
      status,
    },
  });
}
