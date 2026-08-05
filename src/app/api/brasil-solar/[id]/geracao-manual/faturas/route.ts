import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { resolverUcDaUsinaBs } from "@/lib/uc-da-usina-bs";

/** Dia de calendário — as datas de leitura são gravadas em meio-dia UTC. */
const diaIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/brasil-solar/[id]/geracao-manual/faturas[?consumerUnitId=...]
 *
 * Contas de energia JÁ cadastradas que servem de período pro lançamento manual —
 * evita subir de novo um PDF que o sistema já tem.
 *
 * Sem `consumerUnitId`, a UC é adivinhada pela cascata de vínculos da usina
 * (ver `resolverUcDaUsinaBs`). O operador pode trocar: a lista de UCs vai junto.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const escolhida = req.nextUrl.searchParams.get("consumerUnitId");

  let uc: { id: string; nome: string; codigoUc: string | null } | null = null;
  let origem = "ESCOLHA";
  let descricao: string | null = "escolhida por você";

  if (escolhida) {
    uc = await prisma.consumerUnit.findUnique({
      where: { id: escolhida },
      select: { id: true, nome: true, codigoUc: true },
    });
  } else {
    const vinculo = await resolverUcDaUsinaBs(id);
    uc = vinculo.uc;
    origem = vinculo.origem;
    descricao = vinculo.descricao;
  }

  // Lista pro seletor manual. São ~112 UCs — cabe num select sem paginar.
  const ucs = await prisma.consumerUnit.findMany({
    select: { id: true, nome: true, codigoUc: true },
    orderBy: { nome: "asc" },
  });

  if (!uc) {
    return NextResponse.json({
      uc: null,
      origem: "NENHUM",
      descricao: null,
      ucs,
      faturas: [],
      semCiclo: 0,
    });
  }

  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc.id },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      pdfUrl: true,
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
    take: 36,
  });

  // Fatura sem as duas datas não define ciclo nenhum — fica de fora, mas o
  // contador vai junto pra tela poder dizer quantas ficaram.
  const comCiclo = bills.filter((b) => b.dataLeituraAnterior && b.dataLeituraAtual);

  return NextResponse.json({
    uc,
    origem,
    descricao,
    ucs,
    semCiclo: bills.length - comCiclo.length,
    faturas: comCiclo.map((b) => ({
      id: b.id,
      anoReferencia: b.anoReferencia,
      mesReferencia: b.mesReferencia,
      /** Leitura anterior (inclusive). */
      dataInicio: diaIso(b.dataLeituraAnterior),
      /** Leitura atual — EXCLUSIVA: abre o ciclo seguinte. */
      dataFim: diaIso(b.dataLeituraAtual),
      dias: Math.round(
        (b.dataLeituraAtual!.getTime() - b.dataLeituraAnterior!.getTime()) / UM_DIA_MS,
      ),
      temPdf: Boolean(b.pdfUrl),
    })),
  });
}
