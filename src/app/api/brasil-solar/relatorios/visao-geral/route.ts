import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export type RelatorioCellStatus = "ok" | "error" | "missing";

export interface RelatorioCell {
  status: RelatorioCellStatus;
  /** Razão pela qual o mês não está OK (apenas quando status != ok) */
  motivo: string | null;
  /** Mês de referência (1..12) */
  mes: number;
  /** Geração total dos inversores do proprietário na janela do mês (kWh).
   *  null quando não há `MonitoringLog` na janela. */
  geracaoInversorKwh: number | null;
  /** consumo instantâneo = geração − energia injetada do medidor. null quando
   *  faltam dados ou quando a injeção excede a geração reportada (anomalia). */
  consumoInstantaneoKwh: number | null;
  /** consumo da rede (o que veio na fatura RGE) — `bill.consumoKwh`. */
  consumoRedeKwh: number | null;
  /** consumo total real do cliente = rede + autoconsumo instantâneo. */
  consumoTotalKwh: number | null;
}

export interface RelatorioVisaoGeralRow {
  /** id do BrasilSolarProprietario */
  proprietarioId: string;
  proprietarioNome: string;
  cpfCnpj: string | null;
  /** UC vinculada (pode ser null se proprietário ainda não foi associado a uma UC) */
  ucId: string | null;
  codigoUc: string | null;
  ucNome: string | null;
  distribuidora: string | null;
  active: boolean;
  meses: Record<number, RelatorioCell>;
}

const CRITICAL_FIELDS = [
  "consumoKwh",
  "energiaCompensada",
  "energiaInjetadaMedidorKwh",
  "valorTotal",
  "tarifaTE",
  "tarifaTUSD",
  "dataLeituraAnterior",
  "dataLeituraAtual",
] as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ano = Number(searchParams.get("ano")) || new Date().getFullYear();

  // Janelas de leitura podem extrapolar o ano calendário em até ~30 dias.
  // Buscar logs de Dez/(ano-1) até Jan/(ano+1) cobre todos os ciclos do ano.
  const logsRangeStart = new Date(Date.UTC(ano - 1, 11, 1)); // 1º de Dez do ano anterior
  const logsRangeEnd = new Date(Date.UTC(ano + 1, 1, 1)); // 1º de Fev do ano seguinte

  const [proprietarios, ucs, bills, bscs, logs] = await Promise.all([
    prisma.brasilSolarProprietario.findMany({
      where: { active: true },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        cpfCnpj: true,
        codigoUc: true,
        active: true,
      },
    }),
    prisma.consumerUnit.findMany({
      select: {
        id: true,
        codigoUc: true,
        nome: true,
        distribuidora: true,
      },
    }),
    prisma.consumerBill.findMany({
      where: { anoReferencia: ano },
      select: {
        consumerUnitId: true,
        mesReferencia: true,
        consumoKwh: true,
        energiaCompensada: true,
        energiaInjetadaMedidorKwh: true,
        valorTotal: true,
        tarifaTE: true,
        tarifaTUSD: true,
        dataLeituraAnterior: true,
        dataLeituraAtual: true,
      },
    }),
    prisma.brasilSolarClient.findMany({
      where: { active: true, proprietarioId: { not: null } },
      select: { id: true, proprietarioId: true },
    }),
    prisma.monitoringLog.findMany({
      where: {
        data: { gte: logsRangeStart, lt: logsRangeEnd },
      },
      select: { clientId: true, data: true, geracaoDiaria: true },
    }),
  ]);

  const ucByCodigoUc = new Map<
    string,
    { id: string; codigoUc: string; nome: string; distribuidora: string | null }
  >();
  for (const uc of ucs) ucByCodigoUc.set(uc.codigoUc, uc);

  const billByUcMes = new Map<string, (typeof bills)[number]>();
  for (const b of bills) {
    if (!b.consumerUnitId) continue;
    billByUcMes.set(`${b.consumerUnitId}:${b.mesReferencia}`, b);
  }

  // BSCs (usinas físicas) por proprietário.
  const bscIdsByProprietario = new Map<string, string[]>();
  for (const c of bscs) {
    if (!c.proprietarioId) continue;
    const arr = bscIdsByProprietario.get(c.proprietarioId) ?? [];
    arr.push(c.id);
    bscIdsByProprietario.set(c.proprietarioId, arr);
  }

  // Logs por BSC (in-memory aggregation evita N round-trips ao banco).
  const logsByBsc = new Map<string, Array<{ data: Date; kwh: number }>>();
  for (const l of logs) {
    const arr = logsByBsc.get(l.clientId) ?? [];
    arr.push({ data: l.data, kwh: l.geracaoDiaria });
    logsByBsc.set(l.clientId, arr);
  }

  function sumGenerationInWindow(
    bscIds: string[],
    inicio: Date,
    fim: Date,
  ): number | null {
    if (bscIds.length === 0) return null;
    let total = 0;
    let matched = 0;
    for (const bscId of bscIds) {
      const entries = logsByBsc.get(bscId);
      if (!entries) continue;
      for (const e of entries) {
        if (e.data >= inicio && e.data < fim) {
          total += e.kwh;
          matched++;
        }
      }
    }
    if (matched === 0) return null;
    return total;
  }

  function evaluate(bill: (typeof bills)[number] | undefined): {
    status: RelatorioCellStatus;
    motivo: string | null;
  } {
    if (!bill) return { status: "error", motivo: "Sem fatura no mês" };
    const faltando: string[] = [];
    for (const f of CRITICAL_FIELDS) {
      const v = bill[f];
      if (v == null) faltando.push(f);
    }
    if (faltando.length > 0) {
      return { status: "error", motivo: `Fatura incompleta: ${faltando.join(", ")}` };
    }
    return { status: "ok", motivo: null };
  }

  const rows: RelatorioVisaoGeralRow[] = proprietarios.map((p) => {
    const uc = p.codigoUc ? ucByCodigoUc.get(p.codigoUc) ?? null : null;
    const bscIds = bscIdsByProprietario.get(p.id) ?? [];
    const meses: Record<number, RelatorioCell> = {};

    for (let mes = 1; mes <= 12; mes++) {
      if (!uc) {
        meses[mes] = {
          status: "missing",
          motivo: p.codigoUc
            ? `Código UC ${p.codigoUc} não cadastrado em ConsumerUnit`
            : "Proprietário sem UC vinculada",
          mes,
          geracaoInversorKwh: null,
          consumoInstantaneoKwh: null,
          consumoRedeKwh: null,
          consumoTotalKwh: null,
        };
        continue;
      }

      const bill = billByUcMes.get(`${uc.id}:${mes}`);
      const { status, motivo } = evaluate(bill);

      // Preferir a janela de leitura da fatura. Sem ela, cair pro mês calendário
      // (mesma convenção da view focada do mês — `MES_CALENDARIO`).
      let inicio: Date;
      let fim: Date;
      if (bill?.dataLeituraAnterior && bill?.dataLeituraAtual) {
        inicio = bill.dataLeituraAnterior;
        fim = bill.dataLeituraAtual;
      } else {
        inicio = new Date(Date.UTC(ano, mes - 1, 1));
        fim = new Date(Date.UTC(ano, mes, 1));
      }

      const geracaoInversorKwh = sumGenerationInWindow(bscIds, inicio, fim);
      const injetada = bill?.energiaInjetadaMedidorKwh ?? null;
      let consumoInstantaneoKwh: number | null = null;
      if (geracaoInversorKwh != null && injetada != null) {
        const diff = geracaoInversorKwh - injetada;
        // Diff < 0 = anomalia (perda de monitoramento); não silenciar com max(0,x).
        consumoInstantaneoKwh = diff >= 0 ? diff : null;
      }

      const consumoRedeKwh = bill?.consumoKwh ?? null;
      const consumoTotalKwh =
        consumoRedeKwh != null
          ? consumoRedeKwh + (consumoInstantaneoKwh ?? 0)
          : null;

      meses[mes] = {
        status,
        motivo,
        mes,
        geracaoInversorKwh,
        consumoInstantaneoKwh,
        consumoRedeKwh,
        consumoTotalKwh,
      };
    }

    return {
      proprietarioId: p.id,
      proprietarioNome: p.nome,
      cpfCnpj: p.cpfCnpj,
      ucId: uc?.id ?? null,
      codigoUc: uc?.codigoUc ?? p.codigoUc ?? null,
      ucNome: uc?.nome ?? null,
      distribuidora: uc?.distribuidora ?? null,
      active: p.active,
      meses,
    };
  });

  return NextResponse.json({ ano, rows });
}
