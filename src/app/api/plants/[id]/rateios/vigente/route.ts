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
          // O portal da concessionária pede os dois códigos e o documento do
          // titular; a tela do rateio mostra os três lado a lado.
          codigoUcAntigo: true,
          cpfCnpj: true,
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

/** Quantos meses de fatura entram na média do consumo REAL. */
const MESES_CONSUMO_REAL = 12;

/**
 * Consumo REAL por UC: média do `consumoKwh` das faturas dos últimos
 * `MESES_CONSUMO_REAL` meses, terminando no período que a tela está olhando.
 *
 * Duas decisões que mudam o número:
 *  - **Dedupe por (UC, mês)**: a mesma competência pode ter mais de uma fatura
 *    (re-sync, upload manual). Vale a de `syncedAt` mais recente — somar as
 *    duas inflaria a média.
 *  - **Fatura sem `consumoKwh` não entra**; `consumoKwh = 0` ENTRA, porque mês
 *    sem consumo é informação, não ausência dela.
 *
 * Devolve também quantas faturas sustentam cada média: 1 fatura e 12 faturas
 * não merecem a mesma confiança, e a tela mostra o número.
 */
async function calcularConsumoReal(
  ucIds: string[],
  anoFim: number,
  mesFim: number,
): Promise<Map<string, { media: number; meses: number }>> {
  const out = new Map<string, { media: number; meses: number }>();
  if (ucIds.length === 0) return out;

  const janela: Array<{ anoReferencia: number; mesReferencia: number }> = [];
  let a = anoFim;
  let m = mesFim;
  for (let i = 0; i < MESES_CONSUMO_REAL; i++) {
    janela.push({ anoReferencia: a, mesReferencia: m });
    m--;
    if (m === 0) {
      m = 12;
      a--;
    }
  }

  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: { in: ucIds }, OR: janela },
    select: {
      consumerUnitId: true,
      anoReferencia: true,
      mesReferencia: true,
      consumoKwh: true,
      syncedAt: true,
    },
    // Mais recente primeiro: o primeiro de cada (UC, mês) é o que vale.
    orderBy: { syncedAt: "desc" },
  });

  const porUc = new Map<string, Map<string, number>>();
  for (const b of bills) {
    if (!b.consumerUnitId || b.consumoKwh == null) continue;
    const chave = `${b.anoReferencia}-${b.mesReferencia}`;
    let meses = porUc.get(b.consumerUnitId);
    if (!meses) {
      meses = new Map();
      porUc.set(b.consumerUnitId, meses);
    }
    if (meses.has(chave)) continue;
    meses.set(chave, b.consumoKwh);
  }

  for (const [ucId, meses] of porUc) {
    const valores = [...meses.values()];
    if (valores.length === 0) continue;
    const soma = valores.reduce((s, v) => s + v, 0);
    out.set(ucId, { media: soma / valores.length, meses: valores.length });
  }
  return out;
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
      // A RGE trocou os códigos em jul/2026 e volta e meia ainda pede o antigo.
      unidadeConsumidoraAntiga: true,
      // CPF/CNPJ do titular da conta de energia — vai no portal da concessionária.
      cpfCnpj: true,
      codigoCliente: true,
      regraInstalacao: true,
      // Denominador da sugestão de percentuais: geração de CONTRATO.
      geracaoMediaMensal: true,
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
        codigoUcAntigo: true,
        cpfCnpj: true,
        cidade: true,
        distribuidora: true,
        consumoMedio: true,
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
        // Código anterior à migração da RGE e documento do titular: os dois
        // são pedidos no portal da concessionária na hora de cadastrar o rateio.
        codigoUcAntigo: true,
        cpfCnpj: true,
        cidade: true,
        distribuidora: true,
        // kWh/mês do cadastro — peso de cada UC na sugestão de percentuais.
        consumoMedio: true,
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

  // Consumo real de TODAS as UCs que a tela pode mostrar (as da usina e as do
  // seletor "+ Adicionar UC") numa consulta só.
  // A janela termina no período escolhido na tela; sem período, no mês de hoje.
  const agora = new Date();
  const consumoRealPorUc = await calcularConsumoReal(
    [...new Set([...consumerUnits.map((u) => u.id), ...todasUnidades.map((u) => u.id)])],
    temPeriodo ? ano! : agora.getFullYear(),
    temPeriodo ? mes! : agora.getMonth() + 1,
  );

  const consumerUnitsEnriched = consumerUnits.map((u) => ({
    ...u,
    isGeradora: !!u.codigoUc && codigosGeradora.has(u.codigoUc),
    consumoReal: consumoRealPorUc.get(u.id)?.media ?? null,
    consumoRealMeses: consumoRealPorUc.get(u.id)?.meses ?? 0,
  }));

  const unidadesDisponiveis = todasUnidades.map((u) => ({
    id: u.id,
    nome: u.nome,
    codigoUc: u.codigoUc,
    codigoUcAntigo: u.codigoUcAntigo,
    cpfCnpj: u.cpfCnpj,
    cidade: u.cidade,
    distribuidora: u.distribuidora,
    consumoMedio: u.consumoMedio,
    /** Média das faturas dos últimos 12 meses. Null = nenhuma fatura na janela. */
    consumoReal: consumoRealPorUc.get(u.id)?.media ?? null,
    /** Quantas faturas sustentam a média — 1 e 12 não valem o mesmo. */
    consumoRealMeses: consumoRealPorUc.get(u.id)?.meses ?? 0,
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
      unidadeConsumidora: plant.unidadeConsumidora,
      unidadeConsumidoraAntiga: plant.unidadeConsumidoraAntiga,
      cpfCnpj: plant.cpfCnpj,
      regraInstalacao: plant.regraInstalacao,
      geracaoMediaMensal: plant.geracaoMediaMensal,
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
