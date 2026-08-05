import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { FaturaUploadError, importarFaturaPdf } from "@/lib/fatura-upload";

export const runtime = "nodejs";

/** Só dígitos — códigos de UC aparecem com ponto/traço conforme a tela. */
const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Dia de calendário (as datas do parser vêm em meio-dia UTC). */
const diaIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * POST /api/brasil-solar/[id]/geracao-manual/fatura
 * Body multipart: file (PDF da conta de energia)
 *
 * Registra a fatura pelo mesmo caminho da tela "Upload de Faturas" (ela passa a
 * aparecer em /admin/faturas-energia como qualquer outra) e devolve o ciclo de
 * leitura pra tela preencher o período personalizado do lançamento manual.
 *
 * As datas voltam como a janela [dataLeituraAnterior, dataLeituraAtual) — a
 * MESMA que o relatório usa (`gte dataLeituraAnterior, lt dataLeituraAtual`).
 * É isso que faz o total declarado bater exatamente com o total do relatório.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const usina = await prisma.brasilSolarClient.findUnique({
    where: { id },
    select: { id: true, nome: true, codigoUc: true, codigoUcAntigo: true },
  });
  if (!usina) return NextResponse.json({ error: "Usina nao encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o PDF da conta de energia" }, { status: 400 });
  }

  let importada;
  try {
    importada = await importarFaturaPdf(await file.arrayBuffer());
  } catch (e) {
    if (e instanceof FaturaUploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error(`[geracao-manual/fatura] falha ao importar ${file.name}:`, e);
    return NextResponse.json(
      { error: "Nao foi possivel ler esta fatura. Confira se o PDF e a conta de energia." },
      { status: 400 },
    );
  }

  const avisos = [...importada.avisos];

  // Divergência de código NÃO bloqueia: a RGE trocou o código de várias UCs em
  // junho/26, e a usina pode estar cadastrada com o antigo. Quem decide é o
  // operador — a detecção só confere.
  const codigosDaUsina = [usina.codigoUc, usina.codigoUcAntigo].map(digitos).filter(Boolean);
  if (codigosDaUsina.length === 0) {
    avisos.push(
      `Esta usina não tem código de UC cadastrado, então não dá para conferir se a conta é dela.`,
    );
  } else if (!codigosDaUsina.includes(digitos(importada.codigoInstalacao))) {
    avisos.push(
      `Atenção: a conta é da instalação ${importada.codigoInstalacao}, diferente do código cadastrado nesta usina (${codigosDaUsina.join(" / ")}). Confira antes de lançar.`,
    );
  }

  const dataInicio = diaIso(importada.dataLeituraAnterior);
  const dataFim = diaIso(importada.dataLeituraAtual);
  if (!dataInicio || !dataFim) {
    avisos.push(
      "A fatura foi registrada, mas o PDF não trouxe as datas de leitura — informe o período à mão.",
    );
  }

  return NextResponse.json({
    billId: importada.billId,
    codigoInstalacao: importada.codigoInstalacao,
    ucNome: importada.ucNome,
    pendente: importada.pendente,
    mesReferencia: importada.mesReferencia,
    anoReferencia: importada.anoReferencia,
    pdfUrl: importada.pdfUrl,
    /** Início do ciclo (inclusive). */
    dataInicio,
    /** Fim do ciclo — EXCLUSIVO: esse dia abre o ciclo seguinte. */
    dataFim,
    avisos,
  });
}
