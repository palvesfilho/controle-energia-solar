/**
 * Integração Gestor → Cifra: os números FECHADOS de uma usina num mês.
 *
 *   GET /api/integracoes/cifra/usinas/{uc}/mes?ano=2026&mes=8
 *
 * Regra de ouro combinada com o Paulo: **o Cifra não recalcula nada**. O Gestor
 * é dono do número da usina; o Cifra importa pronto e grava. Se os dois
 * calculassem a margem, uma hora discordariam e ninguém saberia qual vale.
 *
 * Por isso cada número aqui espelha o que `lib/fechamento-financeiro.ts` já usa
 * no DRE da operação — só que filtrado por usina em vez da frota inteira:
 *   receita          = ConsumerUnitBilling.valorCobranca das UCs desta usina,
 *                      com `pagoEm` DENTRO do mês (regime de caixa, igual ao DRE)
 *   custoInvestidor  = InvestorPayable.valorLiquido da competência (R$/kWh pago
 *                      ao investidor) — na prática, O custo da usina
 *   custoUsina       = PlantBilling.valorTotal da competência (terra/aluguel)
 *   kwhInjetado      = ConsumerBill.energiaInjetada das faturas da usina
 *   kwhCompensado    = ConsumerBill.energiaCompensada das faturas das UCs dela
 *
 * ⚠️ Levantado em 10/09/2026, contra o banco de produção: as 56 linhas de
 * PlantBilling têm `valorTotal = 0` — o fluxo de faturamento da usina controla
 * documento e status, não valor. Quem tem número é `InvestorPayable`. Por isso a
 * resposta traz `custoTotal = custoInvestidor + custoUsina`: quem consome soma um
 * campo só e não precisa saber dessa história. Se um dia o valorTotal passar a
 * ser preenchido, o total continua certo sem mexer no Cifra.
 *
 * ⚠️ Diferença de bucket, de propósito e visível: o DRE da frota joga o custo da
 * usina no mês em que o comprovante foi anexado (caixa); aqui ele vai pela
 * competência, que é a identidade da linha e é onde vive o `encerradoEm`. Por
 * isso a resposta devolve `custoPagoEm` — o Cifra data a conta a pagar por ele.
 *
 * `mesEncerrado` = o mês da usina foi fechado no Gestor (`encerradoEm`). O Cifra
 * só GRAVA mês encerrado; mês aberto ele mostra na tela e não deixa importar,
 * senão importa número que ainda vai mudar.
 *
 * Autenticação: `X-API-Key: $CIFRA_API_KEY` — ver `lib/integracao-cifra.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { grafiasDoCodigoUc } from "@/lib/robo-faturas";
import { autorizarCifra, round2 } from "@/lib/integracao-cifra";

export const dynamic = "force-dynamic";

function janelaDoMes(ano: number, mes: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(ano, mes - 1, 1)),
    end: new Date(Date.UTC(ano, mes, 1)),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uc: string }> },
) {
  const auth = autorizarCifra(req);
  if (!auth.ok) return auth.resposta;

  const { uc } = await params;
  const query = new URL(req.url).searchParams;
  const ano = Number(query.get("ano"));
  const mes = Number(query.get("mes"));

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Informe ano (AAAA) e mes (1-12)." }, { status: 400 });
  }

  // A UC casa pelo código novo OU pelo antigo: a RGE trocou os números em
  // jul/2026 e o Cifra pode ter sido cadastrado antes ou depois da troca.
  const grafias = grafiasDoCodigoUc(decodeURIComponent(uc));
  if (grafias.length === 0) {
    return NextResponse.json({ error: "UC vazia." }, { status: 400 });
  }

  const plant = await prisma.plant.findFirst({
    where: {
      OR: [
        { unidadeConsumidora: { in: grafias } },
        { unidadeConsumidoraAntiga: { in: grafias } },
      ],
    },
    select: { id: true, name: true, unidadeConsumidora: true, active: true },
  });

  if (!plant) {
    return NextResponse.json({ error: `Nenhuma usina com a UC ${uc}.` }, { status: 404 });
  }

  const { start, end } = janelaDoMes(ano, mes);

  const [cobrancas, billing, faturasUsina, faturasUcs, payables] = await Promise.all([
    prisma.consumerUnitBilling.findMany({
      where: {
        pagoEm: { gte: start, lt: end },
        valorCobranca: { not: null },
        consumerUnit: { plantId: plant.id },
      },
      select: { valorCobranca: true },
    }),
    prisma.plantBilling.findFirst({
      where: { plantId: plant.id, ano, mes },
      select: {
        valorTotal: true,
        status: true,
        encerradoEm: true,
        semPagamentoMotivo: true,
        comprovantePagamentoAt: true,
      },
    }),
    prisma.consumerBill.findMany({
      where: { plantId: plant.id, anoReferencia: ano, mesReferencia: mes },
      select: { energiaInjetada: true },
    }),
    prisma.consumerBill.findMany({
      where: {
        anoReferencia: ano,
        mesReferencia: mes,
        consumerUnit: { plantId: plant.id },
      },
      select: { energiaCompensada: true },
    }),
    prisma.investorPayable.findMany({
      where: { plantId: plant.id, anoReferencia: ano, mesReferencia: mes },
      select: { valorLiquido: true, kwhCompensadoBase: true },
    }),
  ]);

  const receita = cobrancas.reduce((acc, c) => acc + (c.valorCobranca ?? 0), 0);
  const kwhInjetado = faturasUsina.reduce((acc, f) => acc + (f.energiaInjetada ?? 0), 0);
  const kwhCompensado = faturasUcs.reduce((acc, f) => acc + (f.energiaCompensada ?? 0), 0);
  const custoInvestidor = payables.reduce((acc, p) => acc + p.valorLiquido, 0);
  const custoUsina = billing?.valorTotal ?? 0;

  return NextResponse.json({
    uc: plant.unidadeConsumidora,
    plantId: plant.id,
    nome: plant.name,
    ativa: plant.active,
    ano,
    mes,
    receita: round2(receita),
    receitaFaturasPagas: cobrancas.length,
    custoTotal: round2(custoInvestidor + custoUsina),
    custoInvestidor: round2(custoInvestidor),
    custoInvestidorPayables: payables.length,
    custoUsina: round2(custoUsina),
    custoStatus: billing?.status ?? null,
    custoPagoEm: billing?.comprovantePagamentoAt?.toISOString() ?? null,
    custoSemPagamentoMotivo: billing?.semPagamentoMotivo ?? null,
    kwhInjetado: round2(kwhInjetado),
    kwhCompensado: round2(kwhCompensado),
    mesEncerrado: !!billing?.encerradoEm,
    encerradoEm: billing?.encerradoEm?.toISOString() ?? null,
  });
}
