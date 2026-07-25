import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

/**
 * GET /api/billing/plants/matriz?de=2025-08&ate=2026-07
 *
 * Devolve a grade usina × mês numa consulta só. Alimenta a tela
 * /admin/faturamento/usinas (matriz + modo fila), que substituiu o
 * fluxo de escolher mês/ano num select antes de ver qualquer coisa.
 *
 * Status de cada célula:
 *   PAGO | AGUARDANDO_PAGAMENTO | AGUARDANDO_DOCUMENTOS | PENDENTE  → tem PlantBilling
 *   NAO_FATURADO  → mês dentro do contrato mas sem PlantBilling criado
 *   FORA_CONTRATO → mês anterior à assinatura do contrato do investidor
 *   FUTURO        → mês posterior ao mês corrente (a grade é o ano inteiro,
 *                   então dez/2026 aparece já em julho — mas não é pendência)
 */

type Celula = {
  ano: number;
  mes: number;
  billingId: string | null;
  status: string;
  valorTotal: number | null;
  /** Soma de valorLiquido - valorRealPago dos payables ainda não pagos do mês. */
  totalDevido: number;
  encerrado: boolean;
  pendente: boolean;
};

function parseMes(v: string | null): { ano: number; mes: number } | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { ano, mes };
}

/** Lista de meses (inclusiva) entre dois pontos. */
function listaMeses(
  de: { ano: number; mes: number },
  ate: { ano: number; mes: number },
): Array<{ ano: number; mes: number }> {
  const out: Array<{ ano: number; mes: number }> = [];
  let { ano, mes } = de;
  // Trava de segurança: no máximo 10 anos de janela.
  for (let i = 0; i < 120; i++) {
    out.push({ ano, mes });
    if (ano === ate.ano && mes === ate.mes) break;
    mes++;
    if (mes > 12) {
      mes = 1;
      ano++;
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const hoje = new Date();
  const ate =
    parseMes(searchParams.get("ate")) ??
    { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
  const de =
    parseMes(searchParams.get("de")) ??
    (() => {
      // Default: janela de 12 meses terminando no mês corrente.
      const d = new Date(ate.ano, ate.mes - 1, 1);
      d.setMonth(d.getMonth() - 11);
      return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
    })();

  const meses = listaMeses(de, ate);
  if (meses.length === 0) {
    return NextResponse.json({ error: "Janela de meses inválida" }, { status: 400 });
  }

  // Filtro de período pro Prisma: (ano > deAno) OU (ano = deAno E mes >= deMes), etc.
  const periodo = {
    AND: [
      {
        OR: [
          { ano: { gt: de.ano } },
          { ano: de.ano, mes: { gte: de.mes } },
        ],
      },
      {
        OR: [
          { ano: { lt: ate.ano } },
          { ano: ate.ano, mes: { lte: ate.mes } },
        ],
      },
    ],
  };

  const [plants, billings, payables] = await Promise.all([
    prisma.plant.findMany({
      // Gestora — só plantas com "Usina de Investidor" marcado.
      where: { active: true, usinaDeInvestidor: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        numeroUsina: true,
        cpfCnpj: true,
        distribuidora: true,
        dataAssinaturaContrato: true,
        investors: {
          select: {
            investor: {
              select: { user: { select: { name: true, email: true } } },
            },
          },
        },
      },
    }),
    prisma.plantBilling.findMany({
      where: periodo,
      select: {
        id: true,
        plantId: true,
        ano: true,
        mes: true,
        status: true,
        valorTotal: true,
        encerradoEm: true,
      },
    }),
    prisma.investorPayable.findMany({
      where: {
        ...{
          AND: [
            {
              OR: [
                { anoReferencia: { gt: de.ano } },
                { anoReferencia: de.ano, mesReferencia: { gte: de.mes } },
              ],
            },
            {
              OR: [
                { anoReferencia: { lt: ate.ano } },
                { anoReferencia: ate.ano, mesReferencia: { lte: ate.mes } },
              ],
            },
          ],
        },
        status: { not: "PAGO" },
      },
      select: {
        plantId: true,
        anoReferencia: true,
        mesReferencia: true,
        valorLiquido: true,
        valorRealPago: true,
      },
    }),
  ]);

  const billingKey = (plantId: string, ano: number, mes: number) =>
    `${plantId}|${ano}|${mes}`;

  const billingMap = new Map(
    billings.map((b) => [billingKey(b.plantId, b.ano, b.mes), b]),
  );

  const devidoMap = new Map<string, number>();
  for (const p of payables) {
    const k = billingKey(p.plantId, p.anoReferencia, p.mesReferencia);
    const restante = p.valorLiquido - (p.valorRealPago ?? 0);
    if (restante > 0) devidoMap.set(k, (devidoMap.get(k) ?? 0) + restante);
  }

  const anoCorrente = hoje.getFullYear();
  const mesCorrente = hoje.getMonth() + 1;

  const usinas = plants.map((p) => {
    const inicio = p.dataAssinaturaContrato;
    const investorNames = p.investors
      .map((ip) => ip.investor.user?.name ?? ip.investor.user?.email ?? "(sem nome)")
      .sort();

    const celulas: Celula[] = meses.map(({ ano, mes }) => {
      const k = billingKey(p.id, ano, mes);
      const b = billingMap.get(k);
      const totalDevido = devidoMap.get(k) ?? 0;

      // Antes da assinatura do contrato não há o que faturar. Só marca
      // FORA_CONTRATO se não existir movimento algum no mês — dado real
      // sempre ganha da data de contrato (ver feedback "anomalias: sinalizar").
      const foraContrato =
        !b &&
        totalDevido === 0 &&
        !!inicio &&
        (ano < inicio.getFullYear() ||
          (ano === inicio.getFullYear() && mes < inicio.getMonth() + 1));

      const futuro =
        !b &&
        totalDevido === 0 &&
        (ano > anoCorrente || (ano === anoCorrente && mes > mesCorrente));

      let status: string;
      if (b) status = b.status;
      else if (futuro) status = "FUTURO";
      else if (foraContrato) status = "FORA_CONTRATO";
      else status = "NAO_FATURADO";

      return {
        ano,
        mes,
        billingId: b?.id ?? null,
        status,
        valorTotal: b?.valorTotal ?? null,
        totalDevido,
        encerrado: !!b?.encerradoEm,
        pendente:
          status !== "PAGO" && status !== "FORA_CONTRATO" && status !== "FUTURO",
      };
    });

    const pendentes = celulas.filter((c) => c.pendente);

    return {
      plantId: p.id,
      name: p.name,
      numeroUsina: p.numeroUsina,
      cpfCnpj: p.cpfCnpj,
      distribuidora: p.distribuidora,
      investorNames,
      celulas,
      qtdPendentes: pendentes.length,
      /** Mês pendente mais antigo da janela — define a ordem da fila. */
      primeiroPendente: pendentes[0]
        ? { ano: pendentes[0].ano, mes: pendentes[0].mes }
        : null,
      totalDevidoPendente: pendentes.reduce((a, c) => a + c.totalDevido, 0),
    };
  });

  // Usinas com pendência mais antiga primeiro; sem pendência vão pro fim.
  usinas.sort((a, b) => {
    const pa = a.primeiroPendente;
    const pb = b.primeiroPendente;
    if (pa && !pb) return -1;
    if (!pa && pb) return 1;
    if (pa && pb) {
      if (pa.ano !== pb.ano) return pa.ano - pb.ano;
      if (pa.mes !== pb.mes) return pa.mes - pb.mes;
      if (a.qtdPendentes !== b.qtdPendentes) return b.qtdPendentes - a.qtdPendentes;
    }
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ meses, usinas });
}
