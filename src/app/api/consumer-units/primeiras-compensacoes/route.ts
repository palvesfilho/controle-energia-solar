import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { SEM_UC_BRASIL_SOLAR } from "@/lib/uc-origem";
import { SELECT_BILL_FASE, calcularFases, formatCompetencia } from "@/lib/uc-implantacao";

export const runtime = "nodejs";

/**
 * GET /api/consumer-units/primeiras-compensacoes
 *
 * Alimenta o sino do header e o card de aviso: UCs que tiveram a **primeira
 * fatura com compensação** e cuja cobrança ninguém liberou ainda.
 *
 * O universo é o mesmo de quem é cobrado em Faturamento → Unidades
 * Consumidoras (`active: true` + fora do módulo Brasil Solar). Um universo
 * diferente daria um sino que avisa sobre UC que não dá pra cobrar por ali —
 * e a primeira vez que isso acontecesse o aviso perderia a credibilidade.
 *
 * Também devolve `emImplantacao` (quantas ainda esperam a primeira compensação)
 * e `atrasadas`, pra tela mostrar o outro lado do processo sem uma segunda ida
 * ao banco.
 *
 * 401 e não 403 pra quem não é admin: o sino não é renderizado pra esse
 * perfil, e uma falha silenciosa ali não pode virar erro no header.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const ucs = await prisma.consumerUnit.findMany({
    where: { active: true, ...SEM_UC_BRASIL_SOLAR },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      createdAt: true,
      dataInicioContrato: true,
      cobrancaLiberadaEm: true,
      consumer: { select: { id: true, name: true } },
    },
    orderBy: { nome: "asc" },
  });

  const bills = ucs.length
    ? await prisma.consumerBill.findMany({
        where: { consumerUnitId: { in: ucs.map((u) => u.id) } },
        select: SELECT_BILL_FASE,
      })
    : [];
  const fases = calcularFases(ucs, bills);

  const novas = ucs.flatMap((u) => {
    const f = fases.get(u.id);
    if (!f?.aguardandoLiberacao) return [];
    return [
      {
        id: u.id,
        nome: u.nome,
        codigoUc: u.codigoUc,
        consumidor: u.consumer?.name ?? null,
        primeiraCompensacao: formatCompetencia(f.primeiraCompensacao),
        // Quantas contas o cliente recebeu sem desconto antes desta.
        faturasSemCompensacao: f.faturasSemCompensacao,
      },
    ];
  });

  const emImplantacao = [...fases.values()].filter((f) => f.fase === "IMPLANTACAO");

  return NextResponse.json({
    total: novas.length,
    novas,
    emImplantacao: emImplantacao.length,
    atrasadas: emImplantacao.filter((f) => f.alerta === "ATRASADA").length,
  });
}
