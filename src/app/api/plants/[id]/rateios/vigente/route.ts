import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { SEM_UC_BRASIL_SOLAR } from "@/lib/uc-origem";

/**
 * GET /api/plants/[id]/rateios/vigente — retorna a versão VIGENTE do rateio
 * desta usina (se houver) + a versão PENDENTE_ACEITE (se houver), junto com
 * seus itens (UC + %). Também devolve a lista de UCs vinculadas à usina para
 * que a UI possa mostrar quais estão no rateio e quais ficaram de fora.
 *
 * Se já há um PENDENTE_ACEITE, o botão "criar novo rateio" deve ficar
 * desabilitado até que o pendente seja aceito/rejeitado.
 */
const rateioWithItems = {
  items: {
    include: {
      consumerUnit: {
        select: {
          id: true,
          nome: true,
          codigoUc: true,
          cidade: true,
          distribuidora: true,
        },
      },
    },
  },
} as const;

type RateioFull = Awaited<
  ReturnType<
    typeof prisma.rateioVersion.findFirst<{ include: typeof rateioWithItems }>
  >
>;

function serialize(
  r: NonNullable<RateioFull>,
  compensadoByUc: Map<string, number> | null,
) {
  return {
    id: r.id,
    status: r.status,
    observacao: r.observacao,
    protocolo: r.protocolo,
    vigenteAPartirDe: r.vigenteAPartirDe,
    criadoEm: r.criadoEm,
    enviadoEm: r.enviadoEm,
    aceitoEm: r.aceitoEm,
    rejeitadoEm: r.rejeitadoEm,
    items: r.items.map((it) => ({
      id: it.id,
      percentual: it.percentual,
      consumerUnit: it.consumerUnit,
      creditosCompensadosKwh: compensadoByUc
        ? (compensadoByUc.get(it.consumerUnitId) ?? null)
        : null,
    })),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId } = await params;
  const { searchParams } = new URL(req.url);
  const anoRaw = searchParams.get("ano");
  const mesRaw = searchParams.get("mes");
  const ano = anoRaw ? Number(anoRaw) : null;
  const mes = mesRaw ? Number(mesRaw) : null;
  const temPeriodo =
    Number.isInteger(ano) && Number.isInteger(mes) && mes! >= 1 && mes! <= 12;

  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: {
      id: true,
      name: true,
      numeroUsina: true,
      unidadeConsumidora: true,
      codigoCliente: true,
      regraInstalacao: true,
    },
  });
  if (!plant) {
    return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
  }

  // Identifica o(s) código(s) que marcam a UC da própria usina (geradora).
  // Qualquer UC cujo codigoUc bata com um desses é tratada como geradora.
  const codigosGeradora = new Set(
    [plant.numeroUsina, plant.unidadeConsumidora, plant.codigoCliente].filter(
      Boolean,
    ) as string[],
  );

  const [vigente, pendente, historico, consumerUnits] = await Promise.all([
    prisma.rateioVersion.findFirst({
      where: { plantId, status: "VIGENTE" },
      include: rateioWithItems,
    }),
    prisma.rateioVersion.findFirst({
      where: { plantId, status: "PENDENTE_ACEITE" },
      include: rateioWithItems,
    }),
    prisma.rateioVersion.findMany({
      where: { plantId, status: { in: ["SUBSTITUIDO", "REJEITADO"] } },
      include: rateioWithItems,
      orderBy: { vigenteAPartirDe: "desc" },
      take: 20,
    }),
    prisma.consumerUnit.findMany({
      where: { plantId, active: true, ...SEM_UC_BRASIL_SOLAR },
      select: {
        id: true,
        nome: true,
        codigoUc: true,
        cidade: true,
        distribuidora: true,
      },
      orderBy: { nome: "asc" },
    }),
  ]);

  // Se ano/mês informado, busca energiaCompensada das UCs do rateio vigente
  // para o período solicitado. Mapeia consumerUnitId → kWh compensado.
  let compensadoByUc: Map<string, number> | null = null;
  if (temPeriodo && vigente) {
    const ucIds = vigente.items.map((it) => it.consumerUnitId);
    if (ucIds.length > 0) {
      const bills = await prisma.consumerBill.findMany({
        where: {
          consumerUnitId: { in: ucIds },
          anoReferencia: ano!,
          mesReferencia: mes!,
        },
        select: {
          consumerUnitId: true,
          energiaCompensada: true,
          syncedAt: true,
        },
        orderBy: { syncedAt: "desc" },
      });
      compensadoByUc = new Map();
      // findMany retorna mais recente primeiro; só grava o primeiro de cada UC
      for (const b of bills) {
        if (!b.consumerUnitId) continue;
        if (!compensadoByUc.has(b.consumerUnitId)) {
          compensadoByUc.set(b.consumerUnitId, b.energiaCompensada ?? 0);
        }
      }
    }
  }

  const consumerUnitsEnriched = consumerUnits.map((u) => ({
    ...u,
    isGeradora: !!u.codigoUc && codigosGeradora.has(u.codigoUc),
  }));

  // ---------------------------------------------------------------------------
  // Universo do seletor "+ Adicionar UC": TODAS as UCs ativas, não só as que já
  // têm `plantId` desta usina.
  //
  // Por que todas: até 22/08/2026 o rateio só enxergava UC previamente vinculada
  // à usina no cadastro — 101 das 147 ativas, deixando 46 sem como entrar em
  // rateio nenhum, e 11 das 31 usinas abrindo o diálogo vazio. Para colocar uma
  // UC no rateio era preciso sair da tela, editar o cadastro e voltar.
  //
  // 🚩 Nada é escondido: UC já comprometida no rateio de OUTRA usina vem
  // marcada, e a tela avisa em vermelho. Esconder faria a mesma UC ser rateada
  // duas vezes sem ninguém ver ([[feedback_anomalias_sinalizar]]).
  const [todasUnidades, itensDeOutrasUsinas] = await Promise.all([
    prisma.consumerUnit.findMany({
      // ⛔ SEM as UCs do módulo Brasil Solar. Elas têm gestão própria e NUNCA
      // entram em rateio da Associação. Em 22/08/2026 este seletor subiu sem o
      // filtro e despejou as 39 UCs BS no meio das 147 — a 4ª vez que UC da
      // rede Brasil Solar aparece numa lista de cliente de desconto.
      where: { active: true, ...SEM_UC_BRASIL_SOLAR },
      select: {
        id: true,
        nome: true,
        codigoUc: true,
        cidade: true,
        distribuidora: true,
        plantId: true,
        plant: { select: { id: true, name: true } },
      },
      orderBy: { nome: "asc" },
    }),
    prisma.rateioItem.findMany({
      where: {
        version: { status: { in: ["VIGENTE", "PENDENTE_ACEITE"] }, plantId: { not: plantId } },
      },
      select: {
        consumerUnitId: true,
        percentual: true,
        version: {
          select: { status: true, plant: { select: { id: true, name: true } } },
        },
      },
    }),
  ]);

  // Uma UC pode, em tese, aparecer em mais de um rateio de outra usina; guarda o
  // primeiro e conta o resto, porque o aviso é sobre EXISTIR conflito.
  const compromissos = new Map<
    string,
    { plantId: string; plantName: string; percentual: number; status: string }
  >();
  for (const it of itensDeOutrasUsinas) {
    if (compromissos.has(it.consumerUnitId)) continue;
    compromissos.set(it.consumerUnitId, {
      plantId: it.version.plant.id,
      plantName: it.version.plant.name,
      percentual: it.percentual,
      status: it.version.status,
    });
  }

  const unidadesDisponiveis = todasUnidades.map((u) => ({
    id: u.id,
    nome: u.nome,
    codigoUc: u.codigoUc,
    cidade: u.cidade,
    distribuidora: u.distribuidora,
    isGeradora: !!u.codigoUc && codigosGeradora.has(u.codigoUc),
    /** Já está vinculada a ESTA usina no cadastro. */
    daUsina: u.plantId === plantId,
    /** A usina do cadastro, quando é outra — só para exibir. */
    usinaCadastro: u.plantId && u.plantId !== plantId ? u.plant : null,
    /** Rateio de outra usina que já destina crédito a ela. */
    comprometida: compromissos.get(u.id) ?? null,
  }));

  return NextResponse.json({
    plant: {
      id: plant.id,
      name: plant.name,
      regraInstalacao: plant.regraInstalacao,
    },
    periodo: temPeriodo ? { ano, mes } : null,
    vigente: vigente ? serialize(vigente, compensadoByUc) : null,
    pendente: pendente ? serialize(pendente, null) : null,
    historico: historico.map((h) => serialize(h, null)),
    /** UCs vinculadas a ESTA usina — quem alimenta "fora do rateio" e os KPIs. */
    consumerUnits: consumerUnitsEnriched,
    /** Universo do seletor "+ Adicionar UC". */
    unidadesDisponiveis,
  });
}
