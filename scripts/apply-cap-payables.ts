/**
 * Aplica o cap de remuneração do investidor PER-UC nos payables existentes.
 *
 * Regra: cada UC do rateio tem seu próprio saldo de créditos.
 *   recebido_uc(N) = share_uc × injetado_total(N)
 *   disponível_uc(N) = saldo_uc(N−1) + recebido_uc(N)
 *   legado_uc(N) = max(0, consumido_uc(N) − disponível_uc(N))
 *   remunerável_uc(N) = consumido_uc(N) − legado_uc(N)
 *   saldo_uc(N) = max(0, disponível_uc(N) − consumido_uc(N))
 *
 * Atualiza em cada InvestorPayable:
 *   - kwhCreditoLegadoAbatido (legado da UC nesse mês)
 *   - valorBruto (= remunerável × valorKwhContrato snapshot)
 *   - valorLiquido (= valorBruto + ajuste − débito aplicado)
 *
 * Uso:
 *   npx tsx scripts/apply-cap-payables.ts                (dry-run, todas usinas)
 *   npx tsx scripts/apply-cap-payables.ts --apply        (grava)
 *   npx tsx scripts/apply-cap-payables.ts --plant <id>   (filtra plant)
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const plantArgIdx = process.argv.indexOf("--plant");
const PLANT_FILTER = plantArgIdx >= 0 ? process.argv[plantArgIdx + 1] : null;

async function main() {
  const plants = await prisma.plant.findMany({
    where: PLANT_FILTER ? { id: PLANT_FILTER } : {},
    select: { id: true, name: true },
  });

  for (const plant of plants) {
    await processarPlant(plant.id, plant.name);
  }
}

async function processarPlant(plantId: string, plantName: string) {
  console.log(`\n=== ${plantName} (${plantId}) ===`);

  // 1) Rateio VIGENTE (assume aplicado pra todos os meses por simplicidade —
  //    quando houver histórico de versões, cada mês deve usar a vigente do período).
  const rateio = await prisma.rateioVersion.findFirst({
    where: { plantId, status: "VIGENTE" },
    include: { items: { include: { consumerUnit: { select: { id: true, codigoUc: true } } } } },
  });
  if (!rateio || rateio.items.length === 0) {
    console.log("  (sem rateio vigente — pulando)");
    return;
  }
  const shares = new Map<string, number>(); // ucId -> percentual
  for (const it of rateio.items) shares.set(it.consumerUnitId, it.percentual);

  // 2) Injeção mensal da UC geradora
  const bills = await prisma.consumerBill.findMany({
    where: { plantId, consumerUnitId: null },
    orderBy: { syncedAt: "desc" },
    select: { anoReferencia: true, mesReferencia: true, energiaInjetadaMedidorKwh: true },
  });
  const injPorMes = new Map<string, number>();
  for (const b of bills) {
    const k = `${b.anoReferencia}-${b.mesReferencia}`;
    if (!injPorMes.has(k)) injPorMes.set(k, b.energiaInjetadaMedidorKwh ?? 0);
  }

  // 3) Payables agrupados por (ucId, mês de origem)
  const payables = await prisma.investorPayable.findMany({
    where: { plantId, status: { not: "AGUARDANDO_COMPENSACAO" } },
    select: {
      id: true,
      consumerUnitId: true,
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorAjuste: true,
      valorAbatidoDebito: true,
      valorKwhContrato: true,
      kwhCreditoLegadoAbatido: true,
      consumerUnit: { select: { codigoUc: true } },
      originatedByPlantBill: { select: { anoReferencia: true, mesReferencia: true } },
    },
  });
  // mapa: `${ucId}|${ano}-${mes}` -> payables (lista, geralmente 1 mas pode ter parcelaIndex)
  const payablesPorUcMes = new Map<string, typeof payables>();
  for (const p of payables) {
    const a = p.originatedByPlantBill?.anoReferencia ?? p.anoReferencia;
    const m = p.originatedByPlantBill?.mesReferencia ?? p.mesReferencia;
    const key = `${p.consumerUnitId}|${a}-${m}`;
    const cur = payablesPorUcMes.get(key) ?? [];
    cur.push(p);
    payablesPorUcMes.set(key, cur);
  }

  // 4) Lista cronológica de meses (união injeção + qualquer payable)
  const allMesKeys = new Set<string>(injPorMes.keys());
  for (const p of payables) {
    const a = p.originatedByPlantBill?.anoReferencia ?? p.anoReferencia;
    const m = p.originatedByPlantBill?.mesReferencia ?? p.mesReferencia;
    allMesKeys.add(`${a}-${m}`);
  }
  const meses = Array.from(allMesKeys)
    .map((k) => {
      const [a, m] = k.split("-").map(Number);
      return { ano: a, mes: m, key: k };
    })
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);

  // 5) Caminhada PER-UC
  const saldoUc = new Map<string, number>(); // ucId -> saldo
  for (const ucId of shares.keys()) saldoUc.set(ucId, 0);

  type Update = {
    id: string;
    legadoOriginal: number;
    legadoNovo: number;
    valorBrutoNovo: number;
    valorLiquidoNovo: number;
    ucCodigo: string;
    mes: string;
  };
  const updates: Update[] = [];

  for (const { ano, mes, key } of meses) {
    const inj = injPorMes.get(key) ?? 0;
    for (const [ucId, share] of shares.entries()) {
      const recebido = (share / 100) * inj;
      const ps = payablesPorUcMes.get(`${ucId}|${key}`) ?? [];
      const consumido = ps.reduce(
        (s, p) => s + (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0),
        0,
      );
      const saldoAnt = saldoUc.get(ucId) ?? 0;
      const disponivel = saldoAnt + recebido;
      const legadoTotal = Math.max(0, consumido - disponivel);
      const novoSaldo = Math.max(0, disponivel - consumido);

      // Distribui legado entre os payables da UC nesse mês (proporcional ao kWh)
      if (ps.length > 0 && consumido > 0) {
        for (const p of ps) {
          const pKwh = (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0);
          const share = pKwh / consumido;
          const legadoP = legadoTotal * share;
          const kwhRemuneravel = pKwh - legadoP;
          const valorBrutoNovo = kwhRemuneravel * p.valorKwhContrato;
          const valorLiquidoNovo =
            valorBrutoNovo + (p.valorAjuste ?? 0) - (p.valorAbatidoDebito ?? 0);
          if (
            Math.abs((p.kwhCreditoLegadoAbatido ?? 0) - legadoP) > 0.001 ||
            Math.abs(legadoP) > 0.001
          ) {
            updates.push({
              id: p.id,
              legadoOriginal: p.kwhCreditoLegadoAbatido ?? 0,
              legadoNovo: legadoP,
              valorBrutoNovo,
              valorLiquidoNovo,
              ucCodigo: p.consumerUnit?.codigoUc ?? "?",
              mes: key,
            });
          }
        }
      }
      saldoUc.set(ucId, novoSaldo);
    }
  }

  // Log resumo por mês de quem teve legado
  const mesesComLegado = new Map<string, number>();
  for (const u of updates) {
    if (u.legadoNovo > 0) {
      mesesComLegado.set(u.mes, (mesesComLegado.get(u.mes) ?? 0) + u.legadoNovo);
    }
  }
  for (const [mes, total] of [...mesesComLegado.entries()].sort()) {
    console.log(`  ${mes}: legado total ${total.toFixed(2)} kWh`);
  }
  console.log(`  Total payables a atualizar: ${updates.length}`);

  if (!APPLY) {
    if (updates.length > 0) {
      console.log("  (dry-run — exemplos:)");
      for (const u of updates.slice(0, 6)) {
        console.log(
          `    ${u.mes} UC=${u.ucCodigo}  legado: ${u.legadoOriginal.toFixed(2)} → ${u.legadoNovo.toFixed(2)}  ` +
          `bruto novo: R$ ${u.valorBrutoNovo.toFixed(2)}  liq: R$ ${u.valorLiquidoNovo.toFixed(2)}`,
        );
      }
    }
    return;
  }

  for (const u of updates) {
    await prisma.investorPayable.update({
      where: { id: u.id },
      data: {
        kwhCreditoLegadoAbatido: u.legadoNovo,
        valorBruto: u.valorBrutoNovo,
        valorLiquido: u.valorLiquidoNovo,
      },
    });
  }
  console.log(`  ${updates.length} payables atualizados.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
