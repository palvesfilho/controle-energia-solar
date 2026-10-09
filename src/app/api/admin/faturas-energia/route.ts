import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listExistingKeys } from "@/lib/file-storage";
import { relativePathToKey } from "@/lib/r2-storage";
import { SEM_UC_BRASIL_SOLAR } from "@/lib/uc-origem";
import { codigosDaUsina, indexarUcsPorCodigo } from "@/lib/fatura-usina";

// "ok": bill com pdfUrl e arquivo presente no storage → ícone verde
// "error": bill com pdfUrl mas arquivo NÃO encontrado → ícone vermelho (anomalia real)
// "no_pdf": bill registrado mas sem pdfUrl (ex.: importação BACKUP LUMI, sync sem download) → ícone cinza
// "missing": não há bill cadastrada pra esse UC×mês → ícone cinza
export type FaturaCellStatus = "ok" | "error" | "no_pdf" | "missing";

export interface FaturaCell {
  status: FaturaCellStatus;
  pdfUrl: string | null;
  billId: string | null;
  valorTotal: number | null;
  vencimento: string | null; // ISO date
  contaPaga: boolean; // espelha o status na concessionária (vem do sync Infosimples)
  pagoEm: string | null; // ISO date — registro interno de pagamento
  // Só em célula "missing": o operador marcou que a concessionária NÃO emitiu
  // fatura neste mês. Fatura que chega depois ganha — a célula deixa de ser
  // "missing" e isto vem null.
  naoEmitida: { motivo: string | null; por: string; em: string } | null;
  // Só em célula "missing": o mês é ANTERIOR à entrada da UC (ver `entrada` na
  // linha). Não é fatura faltando — a UC ainda não estava aqui.
  antesDaEntrada: boolean;
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
  // Mês em que a UC "entrou": o mais antigo entre a 1ª fatura que o sistema tem
  // (em qualquer ano) e o início do contrato, quando cadastrado. null = sem
  // fatura nenhuma e sem contrato — não dá para saber, nada é tratado como
  // "antes da entrada". O `createdAt` não serve: 87 UCs nasceram no mesmo
  // import de abr/2026.
  entrada: { ano: number; mes: number } | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ano = Number(searchParams.get("ano")) || new Date().getFullYear();

  const [ucs, plants, bills, keysUc, naoEmitidas, mesesPorUc, mesesPorUsina, ucsTodas, keysUsina] = await Promise.all([
    prisma.consumerUnit.findMany({
      // Tela da Gestora de Energia (Associação): UCs do módulo Brasil Solar
      // ficam de fora — o sync de fatura delas se acompanha em
      // Brasil Solar → Proprietários → Status e acesso.
      where: { ...SEM_UC_BRASIL_SOLAR },
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
    prisma.faturaNaoEmitida.findMany({ where: { anoReferencia: ano } }),
    // 1ª fatura de cada UC / usina em QUALQUER ano — é o que diz quando entrou.
    prisma.consumerBill.groupBy({
      by: ["consumerUnitId", "anoReferencia"],
      where: { consumerUnitId: { not: null } },
      _min: { mesReferencia: true },
    }),
    prisma.consumerBill.groupBy({
      by: ["plantId", "anoReferencia"],
      where: { plantId: { not: null } },
      _min: { mesReferencia: true },
    }),
    // TODAS as UCs, inclusive Brasil Solar: é entre elas que mora a gêmea da
    // usina (ver lib/fatura-usina.ts). Não vira linha da grade.
    // origem-ok: só resolve a UC gêmea de cada usina pelo código; nenhuma UC daqui é listada
    prisma.consumerUnit.findMany({
      select: { id: true, codigoUc: true, codigoUcAntigo: true },
    }),
    // O sync grava PDF de usina em "plant-bills/<id>", não em "bills/". Listando
    // só "bills", 12 faturas de usina com o arquivo no lugar apareciam como
    // "Arquivo perdido" (08/10/2026).
    listExistingKeys("plant-bills"),
  ]);
  const existingKeys = new Set([...keysUc, ...keysUsina]);
  const arquivoExiste = (b: { pdfUrl: string | null }) =>
    !!b.pdfUrl && existingKeys.has(relativePathToKey(b.pdfUrl));

  const ucsPorCodigo = indexarUcsPorCodigo(ucsTodas);
  const gemeasDaUsina = new Map(
    plants.map((p) => [
      p.id,
      [...new Set(codigosDaUsina(p).flatMap((c) => ucsPorCodigo.get(c) ?? []))],
    ]),
  );

  // Mês como número corrido (ano*12 + mês-1), pra comparar sem data.
  const idxMes = (a: number, m: number) => a * 12 + (m - 1);
  function primeiraFatura(grupos: { dono: string | null; ano: number; mes: number | null }[]) {
    const mapa = new Map<string, number>();
    for (const g of grupos) {
      if (!g.dono || g.mes == null) continue;
      const i = idxMes(g.ano, g.mes);
      if (i < (mapa.get(g.dono) ?? Infinity)) mapa.set(g.dono, i);
    }
    return mapa;
  }
  const primeiraPorUc = primeiraFatura(
    mesesPorUc.map((g) => ({ dono: g.consumerUnitId, ano: g.anoReferencia, mes: g._min.mesReferencia })),
  );
  const primeiraPorUsina = primeiraFatura(
    mesesPorUsina.map((g) => ({ dono: g.plantId, ano: g.anoReferencia, mes: g._min.mesReferencia })),
  );

  function entradaDe(primeira: number | undefined, contrato: Date | null): number | null {
    const c = contrato ? idxMes(contrato.getUTCFullYear(), contrato.getUTCMonth() + 1) : undefined;
    if (primeira == null && c == null) return null;
    return Math.min(primeira ?? Infinity, c ?? Infinity);
  }
  const rotuloEntrada = (i: number | null) =>
    i == null ? null : { ano: Math.floor(i / 12), mes: (i % 12) + 1 };

  // Mesma chave da linha da grade: "uc:<id>:<mes>" ou "plant:<id>:<mes>".
  const naoEmitidaIndex = new Map<string, FaturaCell["naoEmitida"]>();
  for (const n of naoEmitidas) {
    const dono = n.consumerUnitId ? `uc:${n.consumerUnitId}` : `plant:${n.plantId}`;
    naoEmitidaIndex.set(`${dono}:${n.mesReferencia}`, {
      motivo: n.motivo,
      por: n.marcadoPor,
      em: n.createdAt.toISOString(),
    });
  }

  const ucBillIndex = new Map<string, typeof bills[number]>();
  const usinaBillIndex = new Map<string, typeof bills[number]>();
  for (const b of bills) {
    ucBillIndex.set(`${b.consumerUnitId}:${b.mesReferencia}`, b);
    if (b.plantId) {
      const key = `${b.plantId}:${b.mesReferencia}`;
      // Mais de uma fatura da usina no mesmo mês (a ANTUNES tem, de 10/2025 a
      // 03/2026, uma órfã "_pending" sem arquivo e outra na UC gêmea com o PDF):
      // vale a que tem o arquivo, senão a grade acusa perdido com o PDF no lugar.
      const atual = usinaBillIndex.get(key);
      if (!atual || (!arquivoExiste(atual) && arquivoExiste(b))) usinaBillIndex.set(key, b);
    }
  }

  function toCell(bill: typeof bills[number] | undefined, chave: string, antesDaEntrada: boolean): FaturaCell {
    if (!bill) return { status: "missing", pdfUrl: null, billId: null, valorTotal: null, vencimento: null, contaPaga: false, pagoEm: null, naoEmitida: naoEmitidaIndex.get(chave) ?? null, antesDaEntrada };
    const base = {
      naoEmitida: null,
      antesDaEntrada: false,
      billId: bill.id,
      valorTotal: bill.valorTotal ?? null,
      vencimento: bill.vencimento?.toISOString() ?? null,
      contaPaga: bill.contaPaga,
      pagoEm: bill.pagoEm?.toISOString() ?? null,
    };
    if (!bill.pdfUrl) return { ...base, status: "no_pdf", pdfUrl: null };
    return arquivoExiste(bill)
      ? { ...base, status: "ok", pdfUrl: bill.pdfUrl }
      : { ...base, status: "error", pdfUrl: null };
  }

  function buildMeses(dono: string, entrada: number | null, lookup: (mes: number) => typeof bills[number] | undefined): Record<number, FaturaCell> {
    const meses: Record<number, FaturaCell> = {};
    for (let mes = 1; mes <= 12; mes++) {
      meses[mes] = toCell(lookup(mes), `${dono}:${mes}`, entrada != null && idxMes(ano, mes) < entrada);
    }
    return meses;
  }

  const entradaUc = new Map(
    ucs.map((uc) => [uc.id, entradaDe(primeiraPorUc.get(uc.id), uc.dataInicioContrato)]),
  );
  const entradaUsina = new Map(
    plants.map((p) => {
      const primeiras = [
        primeiraPorUsina.get(p.id),
        ...(gemeasDaUsina.get(p.id) ?? []).map((id) => primeiraPorUc.get(id)),
      ].filter((i): i is number => i != null);
      return [
        p.id,
        entradaDe(primeiras.length ? Math.min(...primeiras) : undefined, p.dataAssinaturaContrato),
      ];
    }),
  );

  // Fatura da usina: a que tem plantId; na falta, a da UC gêmea no mesmo mês.
  function billDaUsina(plantId: string, mes: number) {
    const direta = usinaBillIndex.get(`${plantId}:${mes}`);
    if (direta) return direta;
    for (const ucId of gemeasDaUsina.get(plantId) ?? []) {
      const daGemea = ucBillIndex.get(`${ucId}:${mes}`);
      if (daGemea) return daGemea;
    }
    return undefined;
  }

  const rowsClientes: FaturasEnergiaRow[] = ucs.map((uc) => ({
    entrada: rotuloEntrada(entradaUc.get(uc.id) ?? null),
    ucId: `uc:${uc.id}`,
    codigoUc: uc.codigoUc,
    nome: uc.nome,
    distribuidora: uc.distribuidora,
    origem: "cliente",
    proprietario: uc.consumer?.name ?? uc.plant?.name ?? "-",
    active: uc.active,
    meses: buildMeses(`uc:${uc.id}`, entradaUc.get(uc.id) ?? null, (m) => ucBillIndex.get(`${uc.id}:${m}`)),
    pagaInvestidor: false,
  }));

  const rowsUsinas: FaturasEnergiaRow[] = plants.map((p) => ({
    entrada: rotuloEntrada(entradaUsina.get(p.id) ?? null),
    ucId: `plant:${p.id}`,
    codigoUc: p.unidadeConsumidora ?? p.numeroUsina ?? "-",
    nome: p.name,
    distribuidora: p.distribuidora ?? p.concessionaria ?? null,
    origem: "usina",
    proprietario: p.investors[0]?.investor?.user?.name ?? "Sem investidor",
    active: p.active,
    meses: buildMeses(`plant:${p.id}`, entradaUsina.get(p.id) ?? null, (m) => billDaUsina(p.id, m)),
    pagaInvestidor: p.pagadorFaturaEnergia === "INVESTIDORES",
  }));

  return NextResponse.json({ ano, rows: [...rowsClientes, ...rowsUsinas] });
}
