import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/brasil-solar/proprietarios/[id]/status-faturas?mes=5&ano=2026
// Retorna status agregado de faturas (titular + beneficiárias) na competência
// selecionada. Sem mes/ano, usa a competência mais recente disponível.
// Sempre devolve a lista de competências disponíveis pro selector na UI.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const mesParam = searchParams.get("mes");
  const anoParam = searchParams.get("ano");

  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id },
    select: { id: true, nome: true, codigoUc: true },
  });
  if (!prop) {
    return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
  }

  type UcAgrupada = {
    consumerUnitId: string;
    codigoUc: string;
    nome: string;
    tipo: "TITULAR" | "BENEFICIARIA";
    percentual: number | null;
  };

  const ucs: UcAgrupada[] = [];

  // UC titular do proprietário (mesma codigoUc registrada nele).
  if (prop.codigoUc) {
    const titular = await prisma.consumerUnit.findUnique({
      where: { codigoUc: prop.codigoUc },
      select: { id: true, codigoUc: true, nome: true },
    });
    if (titular) {
      ucs.push({
        consumerUnitId: titular.id,
        codigoUc: titular.codigoUc,
        nome: titular.nome,
        tipo: "TITULAR",
        percentual: null,
      });
    }
  }

  // Beneficiárias com ConsumerUnit linkada.
  const beneficiarias = await prisma.brasilSolarBeneficiaria.findMany({
    where: { proprietarioId: id, active: true },
    orderBy: { createdAt: "asc" },
    select: {
      consumerUnitId: true,
      codigoUc: true,
      nome: true,
      percentual: true,
    },
  });
  for (const b of beneficiarias) {
    if (!b.consumerUnitId) continue;
    if (ucs.some((u) => u.consumerUnitId === b.consumerUnitId)) continue;
    const cu = await prisma.consumerUnit.findUnique({
      where: { id: b.consumerUnitId },
      select: { id: true, codigoUc: true, nome: true },
    });
    if (!cu) continue;
    ucs.push({
      consumerUnitId: cu.id,
      codigoUc: cu.codigoUc,
      nome: b.nome ?? cu.nome,
      tipo: "BENEFICIARIA",
      percentual: b.percentual,
    });
  }

  const ucIds = ucs.map((u) => u.consumerUnitId);

  // Lista de competências distintas presentes nas faturas das UCs.
  const periodos = ucIds.length
    ? await prisma.consumerBill.findMany({
        where: { consumerUnitId: { in: ucIds } },
        select: { mesReferencia: true, anoReferencia: true },
        distinct: ["mesReferencia", "anoReferencia"],
        orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
      })
    : [];

  const competenciasDisponiveis = periodos.map((p) => ({
    mes: p.mesReferencia,
    ano: p.anoReferencia,
  }));

  // Determina a competência selecionada: da query ou a mais recente disponível.
  let selecionada: { mes: number; ano: number } | null = null;
  if (mesParam && anoParam) {
    const m = parseInt(mesParam, 10);
    const a = parseInt(anoParam, 10);
    if (Number.isFinite(m) && Number.isFinite(a)) selecionada = { mes: m, ano: a };
  }
  if (!selecionada && competenciasDisponiveis.length > 0) {
    selecionada = competenciasDisponiveis[0];
  }

  // Pra cada UC: credencial + fatura da competência selecionada (ou null) +
  // billing correspondente (pra extrair valorEconomia se já calculado).
  const rows = await Promise.all(
    ucs.map(async (u) => {
      const cred = await prisma.cpflCredential.findUnique({
        where: { consumerUnitId: u.consumerUnitId },
        select: {
          statusSync: true,
          ultimaSync: true,
          erroSync: true,
          distribuidora: true,
        },
      });

      let fatura: {
        id: string;
        mesReferencia: number;
        anoReferencia: number;
        valorTotal: number | null;
        energiaCompensada: number | null;
        descontoValor: number | null;
        contaPaga: boolean;
        hasPdf: boolean;
        pdfUrl: string | null;
      } | null = null;

      if (selecionada) {
        const bill = await prisma.consumerBill.findFirst({
          where: {
            consumerUnitId: u.consumerUnitId,
            mesReferencia: selecionada.mes,
            anoReferencia: selecionada.ano,
          },
          select: {
            id: true,
            mesReferencia: true,
            anoReferencia: true,
            valorTotal: true,
            valorTotalCalculado: true,
            energiaCompensada: true,
            injetadaOucTeValor: true,
            injetadaOucTusdValor: true,
            contaPaga: true,
            pdfUrl: true,
          },
        });

        if (bill) {
          const billing = await prisma.consumerUnitBilling.findFirst({
            where: {
              consumerUnitId: u.consumerUnitId,
              mes: selecionada.mes,
              ano: selecionada.ano,
            },
            select: { valorEconomia: true },
          });

          // Desconto/economia: prioriza valorEconomia já calculado pelo pipeline;
          // senão usa |TE| + |TUSD| da fatura (que vêm negativos por convenção
          // contábil — convertemos pra positivo na UI).
          let descontoValor: number | null = null;
          if (billing?.valorEconomia != null) {
            descontoValor = billing.valorEconomia;
          } else {
            const injetada =
              Math.abs(bill.injetadaOucTeValor ?? 0) +
              Math.abs(bill.injetadaOucTusdValor ?? 0);
            if (injetada > 0) descontoValor = injetada;
          }

          fatura = {
            id: bill.id,
            mesReferencia: bill.mesReferencia,
            anoReferencia: bill.anoReferencia,
            valorTotal: bill.valorTotalCalculado ?? bill.valorTotal,
            energiaCompensada: bill.energiaCompensada,
            descontoValor,
            contaPaga: bill.contaPaga,
            hasPdf: !!bill.pdfUrl,
            pdfUrl: bill.pdfUrl ?? null,
          };
        }
      }

      return {
        ...u,
        credencial: cred
          ? {
              statusSync: cred.statusSync,
              ultimaSync: cred.ultimaSync,
              erroSync: cred.erroSync,
              distribuidora: cred.distribuidora,
            }
          : null,
        ultimaFatura: fatura,
      };
    }),
  );

  // Resumo agrega APENAS faturas da competência selecionada.
  const totalUcs = rows.length;
  let baixadas = 0;
  let resumoCompensadoKwh = 0;
  let resumoDescontoValor = 0;
  for (const r of rows) {
    if (!r.ultimaFatura) continue;
    baixadas += 1;
    resumoCompensadoKwh += r.ultimaFatura.energiaCompensada ?? 0;
    resumoDescontoValor += r.ultimaFatura.descontoValor ?? 0;
  }

  return NextResponse.json({
    proprietario: { id: prop.id, nome: prop.nome },
    competenciasDisponiveis,
    competenciaSelecionada: selecionada,
    ucs: rows,
    resumo: {
      totalUcs,
      mesReferencia: selecionada,
      baixadasNoMes: baixadas,
      compensadoKwh: resumoCompensadoKwh,
      descontoValor: resumoDescontoValor,
    },
  });
}
