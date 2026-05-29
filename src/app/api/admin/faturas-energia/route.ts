import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listExistingKeys } from "@/lib/file-storage";
import { relativePathToKey } from "@/lib/r2-storage";

export type FaturaCellStatus = "ok" | "error" | "missing";

export interface FaturaCell {
  status: FaturaCellStatus;
  pdfUrl: string | null;
  billId: string | null;
  valorTotal: number | null;
  vencimento: string | null; // ISO date
  contaPaga: boolean; // espelha o status na concessionária (vem do sync Infosimples)
  pagoEm: string | null; // ISO date — registro interno de pagamento
}

export interface FaturasEnergiaRow {
  ucId: string;
  codigoUc: string;
  nome: string;
  distribuidora: string | null;
  origem: "cliente" | "usina";
  proprietario: string;
  active: boolean;
  meses: Record<number, FaturaCell>;
  // true quando origem=usina e Plant.pagadorFaturaEnergia=INVESTIDORES:
  // gestora não paga a fatura, a linha aparece só pra controle.
  pagaInvestidor: boolean;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ano = Number(searchParams.get("ano")) || new Date().getFullYear();

  const [ucs, plants, bills, existingKeys] = await Promise.all([
    prisma.consumerUnit.findMany({
      include: {
        consumer: { select: { id: true, name: true } },
        plant: { select: { id: true, name: true } },
      },
      orderBy: [{ active: "desc" }, { nome: "asc" }],
    }),
    prisma.plant.findMany({
      // Telas da Gestora de Energia (Faturas / Gestão Financeira) só mostram
      // usinas marcadas como "Usina de Investidor". Usinas projetadas só pra
      // clientes Rede Brasil Solar (sem flag) ficam na área /admin/brasil-solar.
      where: { usinaDeInvestidor: true },
      include: {
        investors: {
          include: {
            investor: { include: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.consumerBill.findMany({
      where: { anoReferencia: ano },
      select: {
        id: true,
        consumerUnitId: true,
        plantId: true,
        instalacao: true,
        mesReferencia: true,
        pdfUrl: true,
        valorTotal: true,
        vencimento: true,
        contaPaga: true,
        pagoEm: true,
      },
    }),
    listExistingKeys("bills"),
  ]);

  const ucBillIndex = new Map<string, typeof bills[number]>();
  const usinaBillIndex = new Map<string, typeof bills[number]>();
  for (const b of bills) {
    ucBillIndex.set(`${b.consumerUnitId}:${b.mesReferencia}`, b);
    if (b.plantId) {
      const key = `${b.plantId}:${b.mesReferencia}`;
      if (!usinaBillIndex.has(key)) usinaBillIndex.set(key, b);
    }
  }

  function toCell(bill: typeof bills[number] | undefined): FaturaCell {
    if (!bill) return { status: "missing", pdfUrl: null, billId: null, valorTotal: null, vencimento: null, contaPaga: false, pagoEm: null };
    const base = {
      billId: bill.id,
      valorTotal: bill.valorTotal ?? null,
      vencimento: bill.vencimento?.toISOString() ?? null,
      contaPaga: bill.contaPaga,
      pagoEm: bill.pagoEm?.toISOString() ?? null,
    };
    if (!bill.pdfUrl) return { ...base, status: "error", pdfUrl: null };
    const key = relativePathToKey(bill.pdfUrl);
    const fileExists = existingKeys.has(key);
    return fileExists
      ? { ...base, status: "ok", pdfUrl: bill.pdfUrl }
      : { ...base, status: "error", pdfUrl: null };
  }

  function buildMeses(lookup: (mes: number) => typeof bills[number] | undefined): Record<number, FaturaCell> {
    const meses: Record<number, FaturaCell> = {};
    for (let mes = 1; mes <= 12; mes++) meses[mes] = toCell(lookup(mes));
    return meses;
  }

  const rowsClientes: FaturasEnergiaRow[] = ucs.map((uc) => ({
    ucId: `uc:${uc.id}`,
    codigoUc: uc.codigoUc,
    nome: uc.nome,
    distribuidora: uc.distribuidora,
    origem: "cliente",
    proprietario: uc.consumer?.name ?? uc.plant?.name ?? "-",
    active: uc.active,
    meses: buildMeses((m) => ucBillIndex.get(`${uc.id}:${m}`)),
    pagaInvestidor: false,
  }));

  const rowsUsinas: FaturasEnergiaRow[] = plants.map((p) => ({
    ucId: `plant:${p.id}`,
    codigoUc: p.unidadeConsumidora ?? p.numeroUsina ?? "-",
    nome: p.name,
    distribuidora: p.distribuidora ?? p.concessionaria ?? null,
    origem: "usina",
    proprietario: p.investors[0]?.investor?.user?.name ?? "Sem investidor",
    active: p.active,
    meses: buildMeses((m) => usinaBillIndex.get(`${p.id}:${m}`)),
    pagaInvestidor: p.pagadorFaturaEnergia === "INVESTIDORES",
  }));

  return NextResponse.json({ ano, rows: [...rowsClientes, ...rowsUsinas] });
}
