import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularValorCobrado } from "@/lib/billing-calculator";

export type FechamentoStatus = "pronta" | "pendente" | "erro" | "paga";

export interface FechamentoMensalRow {
  ucId: string;
  syncableUcId: string | null; // ID real da UC quando há credencial para sync
  codigoUc: string;
  nome: string;
  proprietario: string;
  origem: "cliente" | "usina";
  distribuidora: string | null;
  active: boolean;

  temBill: boolean;
  temPdf: boolean;
  valorTotal: number | null;
  vencimento: string | null;
  contaPaga: boolean;
  pdfUrl: string | null;

  // Valor calculado pela regra de remuneração da UC (DESC_COMPENSADA_BANDEIRAS etc.)
  valorCobrado: number | null;
  regraRemuneracao: string | null;
  cobrancaProblemas: string[];

  status: FechamentoStatus;
  problemas: string[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const ano = Number(searchParams.get("ano")) || now.getFullYear();
  const mes = Number(searchParams.get("mes")) || now.getMonth() + 1;

  const [ucs, plants, bills] = await Promise.all([
    prisma.consumerUnit.findMany({
      include: {
        consumer: { select: { id: true, name: true } },
        plant: { select: { id: true, name: true } },
        cpflCredential: {
          select: {
            id: true,
            active: true,
            statusSync: true,
            erroSync: true,
            ultimaSync: true,
          },
        },
      },
      orderBy: [{ active: "desc" }, { nome: "asc" }],
    }),
    prisma.plant.findMany({
      include: {
        investors: {
          include: { investor: { include: { user: { select: { name: true } } } } },
        },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.consumerBill.findMany({
      where: { anoReferencia: ano, mesReferencia: mes },
      select: {
        id: true,
        consumerUnitId: true,
        plantId: true,
        instalacao: true,
        pdfUrl: true,
        valorTotal: true,
        vencimento: true,
        contaPaga: true,
        injetadaOucTeValor: true,
        injetadaOucTusdValor: true,
        bandeiraValor: true,
        consumerUnit: { select: { codigoUc: true } },
      },
    }),
  ]);

  const ucBillIndex = new Map<string, typeof bills[number]>();
  // Bill é "da usina" somente quando:
  //   - não está vinculada a nenhuma ConsumerUnit (consumerUnitId null), OU
  //   - a ConsumerUnit vinculada tem codigoUc igual ao identificador da usina
  //     (numeroUsina / unidadeConsumidora).
  // O mero fato de a UC fazer rateio com a usina (ConsumerUnit.plantId) NÃO
  // significa que a bill dessa UC de cliente representa a fatura da usina.
  const usinaBillIndex = new Map<string, typeof bills[number]>();
  const plantIdentifiers = new Map<string, Set<string>>();
  for (const p of plants) {
    const ids = new Set<string>();
    if (p.unidadeConsumidora) ids.add(p.unidadeConsumidora);
    if (p.numeroUsina) ids.add(p.numeroUsina);
    if (p.codigoCliente) ids.add(p.codigoCliente);
    plantIdentifiers.set(p.id, ids);
  }
  for (const b of bills) {
    if (b.consumerUnitId) ucBillIndex.set(b.consumerUnitId, b);
    if (!b.plantId) continue;
    const ids = plantIdentifiers.get(b.plantId);
    const ehDaUsina =
      b.consumerUnitId == null ||
      (!!b.consumerUnit?.codigoUc && !!ids && ids.has(b.consumerUnit.codigoUc));
    if (ehDaUsina && !usinaBillIndex.has(b.plantId)) {
      usinaBillIndex.set(b.plantId, b);
    }
  }

  function rowFromBill(
    base: Omit<
      FechamentoMensalRow,
      | "temBill" | "temPdf" | "valorTotal" | "vencimento" | "contaPaga" | "pdfUrl"
      | "status" | "problemas"
      | "valorCobrado" | "regraRemuneracao" | "cobrancaProblemas"
    >,
    bill: typeof bills[number] | undefined,
    credInfo?: {
      active: boolean;
      statusSync: string | null;
      erroSync: string | null;
      ultimaSync: Date | null;
    } | null,
    unitForCalc?: {
      regraRemuneracao: string | null;
      percentCompensado: number | null;
      percentBandeira: number | null;
    } | null,
  ): FechamentoMensalRow {
    const calc = bill && unitForCalc
      ? calcularValorCobrado(
          {
            injetadaOucTeValor: bill.injetadaOucTeValor,
            injetadaOucTusdValor: bill.injetadaOucTusdValor,
            bandeiraValor: bill.bandeiraValor,
          },
          unitForCalc,
        )
      : null;

    if (!bill) {
      const problemas: string[] = [];
      if (!credInfo) {
        problemas.push("Sem credencial cadastrada — cobrar concessionária manualmente");
      } else if (!credInfo.active) {
        problemas.push("Credencial desativada");
      } else if (credInfo.erroSync) {
        const quando = credInfo.ultimaSync
          ? ` (${credInfo.ultimaSync.toLocaleString("pt-BR")})`
          : "";
        problemas.push(`Erro no sync${quando}: ${credInfo.erroSync}`);
      } else if (!credInfo.ultimaSync) {
        problemas.push("Credencial cadastrada mas nunca sincronizada");
      } else if (credInfo.statusSync === "SUCCESS") {
        problemas.push(
          `Sync OK em ${credInfo.ultimaSync.toLocaleString("pt-BR")} — fatura deste mês ainda não emitida pela concessionária`,
        );
      } else {
        problemas.push("Fatura não sincronizada — cobrar concessionária");
      }
      return {
        ...base,
        temBill: false,
        temPdf: false,
        valorTotal: null,
        vencimento: null,
        contaPaga: false,
        pdfUrl: null,
        valorCobrado: null,
        regraRemuneracao: unitForCalc?.regraRemuneracao ?? null,
        cobrancaProblemas: [],
        status: "pendente",
        problemas,
      };
    }
    const problemas: string[] = [];
    if (!bill.pdfUrl) problemas.push("Sem PDF da fatura");
    if (bill.valorTotal == null) problemas.push("Sem valor total");
    if (!bill.vencimento) problemas.push("Sem vencimento");

    const status: FechamentoStatus = bill.contaPaga
      ? "paga"
      : problemas.length > 0
      ? "erro"
      : "pronta";

    return {
      ...base,
      temBill: true,
      temPdf: !!bill.pdfUrl,
      valorTotal: bill.valorTotal ?? null,
      vencimento: bill.vencimento?.toISOString() ?? null,
      contaPaga: bill.contaPaga,
      pdfUrl: bill.pdfUrl ?? null,
      valorCobrado: calc?.valorCobrado ?? null,
      regraRemuneracao: calc?.regra ?? unitForCalc?.regraRemuneracao ?? null,
      cobrancaProblemas: calc?.problemas ?? [],
      status,
      problemas,
    };
  }

  const rowsClientes: FechamentoMensalRow[] = ucs.map((uc) =>
    rowFromBill(
      {
        ucId: `uc:${uc.id}`,
        syncableUcId: uc.cpflCredential ? uc.id : null,
        codigoUc: uc.codigoUc,
        nome: uc.nome,
        proprietario: uc.consumer?.name ?? uc.plant?.name ?? "-",
        origem: "cliente",
        distribuidora: uc.distribuidora,
        active: uc.active,
      },
      ucBillIndex.get(uc.id),
      uc.cpflCredential
        ? {
            active: uc.cpflCredential.active,
            statusSync: uc.cpflCredential.statusSync,
            erroSync: uc.cpflCredential.erroSync,
            ultimaSync: uc.cpflCredential.ultimaSync,
          }
        : null,
      {
        regraRemuneracao: uc.regraRemuneracao,
        percentCompensado: uc.percentCompensado,
        percentBandeira: uc.percentBandeira,
      },
    ),
  );

  const rowsUsinas: FechamentoMensalRow[] = plants.map((p) =>
    rowFromBill(
      {
        ucId: `plant:${p.id}`,
        syncableUcId: null,
        codigoUc: p.unidadeConsumidora ?? p.numeroUsina ?? "-",
        nome: p.name,
        proprietario: p.investors[0]?.investor?.user?.name ?? "Sem investidor",
        origem: "usina",
        distribuidora: p.distribuidora ?? p.concessionaria ?? null,
        active: p.active,
      },
      usinaBillIndex.get(p.id),
      null,
      null,
    )
  );

  return NextResponse.json({ ano, mes, rows: [...rowsClientes, ...rowsUsinas] });
}
