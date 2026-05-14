/**
 * Re-calcula `kwhCompensadoBase` dos payables usando `injetadaDetalhes` da
 * fatura do consumidor. Filtra créditos legados (originados ANTES do 1º mês
 * de geração da plant — vieram de outra fonte ou estão pré-plant).
 *
 * Algoritmo:
 *   1. Para cada plant, descobre o 1º mês de geração (1ª ConsumerBill com
 *      energiaInjetadaMedidorKwh > 0 da UC geradora).
 *   2. Para cada InvestorPayable: pega o ConsumerBill da UC consumidora
 *      (consumerBillId), parseia injetadaDetalhes, soma só os kWh com
 *      mesOrigem ≥ 1º mês plant.
 *   3. Valida sum(detalhes) ≈ energiaCompensada:
 *        - Se OK (diff < 1%): grava kwhCompensadoBase = sum BECKER, marca legado
 *        - Se NÃO OK: marca observacoes = "PARSER_INCOMPLETO" e PRESERVA o
 *          valor atual (cap A já está aplicado)
 *   4. Re-deriva originatedByPlantBill pro mês BECKER mais recente nos detalhes.
 *   5. Recalcula valorBruto, valorLiquido.
 *
 * Uso:
 *   npx tsx scripts/apply-detalhes-cap.ts                (dry-run, todas)
 *   npx tsx scripts/apply-detalhes-cap.ts --apply        (grava)
 *   npx tsx scripts/apply-detalhes-cap.ts --plant <id>   (filtra plant)
 */
import { prisma } from "../src/lib/prisma";
import {
  parseInjetadaDetalhes,
  somarDetalhesDaPlant,
  mesOrigemMaisRecenteDaPlant,
} from "../src/lib/injetada-detalhes";

const APPLY = process.argv.includes("--apply");
const plantArgIdx = process.argv.indexOf("--plant");
const PLANT_FILTER = plantArgIdx >= 0 ? process.argv[plantArgIdx + 1] : null;
const TOLERANCIA_KWH = 1.0; // diferença sum(detalhes) vs energiaCompensada

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

  // 1) 1º mês de geração da plant
  const primeiraInjecao = await prisma.consumerBill.findFirst({
    where: {
      plantId,
      consumerUnitId: null,
      energiaInjetadaMedidorKwh: { gt: 0 },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: { anoReferencia: true, mesReferencia: true, energiaInjetadaMedidorKwh: true },
  });
  if (!primeiraInjecao) {
    console.log("  (plant ainda não injetou — pulando)");
    return;
  }
  const primeiroMesPlant = {
    ano: primeiraInjecao.anoReferencia,
    mes: primeiraInjecao.mesReferencia,
  };
  console.log(
    `  1º mês geração plant: ${primeiroMesPlant.ano}-${String(primeiroMesPlant.mes).padStart(2, "0")} ` +
    `(${primeiraInjecao.energiaInjetadaMedidorKwh} kWh)`,
  );

  // 2) Plant bills indexados (pra resolver originatedByPlantBillId via mes)
  const plantBills = await prisma.consumerBill.findMany({
    where: { plantId, consumerUnitId: null },
    select: { id: true, anoReferencia: true, mesReferencia: true, syncedAt: true },
    orderBy: { syncedAt: "desc" },
  });
  const plantBillByMes = new Map<string, string>(); // "ano-mes" -> billId
  for (const pb of plantBills) {
    const k = `${pb.anoReferencia}-${pb.mesReferencia}`;
    if (!plantBillByMes.has(k)) plantBillByMes.set(k, pb.id);
  }

  // 3) Payables (não-finais) com seu consumer bill
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId,
      status: { not: "AGUARDANDO_COMPENSACAO" },
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      kwhCreditoLegadoAbatido: true,
      valorBruto: true,
      valorAjuste: true,
      valorLiquido: true,
      valorAbatidoDebito: true,
      valorKwhContrato: true,
      observacoes: true,
      consumerUnitId: true,
      consumerUnit: { select: { codigoUc: true } },
      originatedByPlantBillId: true,
      consumerBill: {
        select: {
          id: true,
          anoReferencia: true,
          mesReferencia: true,
          energiaCompensada: true,
          energiaInjetadaMedidorKwh: true,
          injetadaDetalhes: true,
        },
      },
    },
  });

  let okCount = 0;
  let parserIncompletoCount = 0;
  let semDetalhesCount = 0;

  type Update = {
    id: string;
    novoKwhBase: number;
    novoLegado: number;
    novoBruto: number;
    novoLiquido: number;
    novoOriginId: string | null;
    novaObs: string | null;
    motivo: string;
    ucCodigo: string;
  };
  const updates: Update[] = [];

  for (const p of payables) {
    if (!p.consumerBill) {
      semDetalhesCount++;
      continue;
    }
    const bill = p.consumerBill;
    let consumerBill;
    if (!bill.energiaCompensada || bill.energiaCompensada <= 0) continue;

    const detalhes = parseInjetadaDetalhes(bill.injetadaDetalhes);
    const sumDetalhes = detalhes.reduce((s, d) => s + d.kwh, 0);
    const energiaComp = bill.energiaCompensada ?? 0;

    // Sem detalhes parsed: usa fallback (preserva cap A)
    if (detalhes.length === 0) {
      semDetalhesCount++;
      const obsFlag = "DETALHES_AUSENTES";
      if (!p.observacoes?.includes(obsFlag)) {
        updates.push({
          id: p.id,
          novoKwhBase: p.kwhCompensadoBase ?? 0,
          novoLegado: p.kwhCreditoLegadoAbatido ?? 0,
          novoBruto: p.valorBruto,
          novoLiquido: p.valorLiquido,
          novoOriginId: p.originatedByPlantBillId,
          novaObs: appendObs(p.observacoes, obsFlag),
          motivo: "sem detalhes na fatura",
          ucCodigo: p.consumerUnit?.codigoUc ?? "?",
        });
      }
      continue;
    }

    // Parser parece incompleto: soma dos detalhes diverge da energia compensada
    if (Math.abs(sumDetalhes - energiaComp) > TOLERANCIA_KWH) {
      parserIncompletoCount++;
      const obsFlag = "PARSER_INCOMPLETO";
      if (!p.observacoes?.includes(obsFlag)) {
        updates.push({
          id: p.id,
          novoKwhBase: p.kwhCompensadoBase ?? 0,
          novoLegado: p.kwhCreditoLegadoAbatido ?? 0,
          novoBruto: p.valorBruto,
          novoLiquido: p.valorLiquido,
          novoOriginId: p.originatedByPlantBillId,
          novaObs: appendObs(
            p.observacoes,
            `${obsFlag} (sum=${sumDetalhes.toFixed(2)} vs comp=${energiaComp.toFixed(2)})`,
          ),
          motivo: "parser incompleto — preserva cap A",
          ucCodigo: p.consumerUnit?.codigoUc ?? "?",
        });
      }
      continue;
    }

    // Parser OK: aplica filtro B
    okCount++;
    const kwhPlant = somarDetalhesDaPlant(detalhes, primeiroMesPlant);
    const ucMicro = bill.energiaInjetadaMedidorKwh ?? 0;
    // Desconta micro-geração da própria UC se houver (Lei 14.300)
    const novoKwhBase = Math.max(0, kwhPlant - ucMicro);
    const novoLegado = Math.max(0, energiaComp - novoKwhBase - ucMicro);
    const valorBrutoNovo =
      (novoKwhBase + (p.kwhCompensadoAjuste ?? 0)) * p.valorKwhContrato;
    const valorLiquidoNovo =
      valorBrutoNovo + (p.valorAjuste ?? 0) - (p.valorAbatidoDebito ?? 0);

    // Re-deriva originatedByPlantBill: mês BECKER mais recente nos detalhes.
    // Se nenhum BECKER no detalhes (tudo legado), seta NULL — esse payable
    // não contribui pra nenhuma competência da plant (vira só um registro de
    // que o cliente pagou créditos legados).
    const novoMes = mesOrigemMaisRecenteDaPlant(detalhes, primeiroMesPlant);
    const novoOriginId = novoMes
      ? plantBillByMes.get(`${novoMes.ano}-${novoMes.mes}`) ?? null
      : null;

    updates.push({
      id: p.id,
      novoKwhBase,
      novoLegado,
      novoBruto: valorBrutoNovo,
      novoLiquido: valorLiquidoNovo,
      novoOriginId,
      novaObs: cleanObs(p.observacoes, ["PARSER_INCOMPLETO", "DETALHES_AUSENTES"]),
      motivo: kwhPlant > 0 ? "OK (filtro B)" : "OK (tudo legado)",
      ucCodigo: p.consumerUnit?.codigoUc ?? "?",
    });
  }

  console.log(`  Parser OK: ${okCount}  |  parser incompleto: ${parserIncompletoCount}  |  sem detalhes: ${semDetalhesCount}`);
  console.log(`  Updates: ${updates.length}`);

  if (!APPLY) {
    console.log("  (dry-run — exemplos):");
    for (const u of updates.slice(0, 8)) {
      console.log(
        `    UC=${u.ucCodigo}  ${u.motivo}  kwhBase=${u.novoKwhBase.toFixed(2)}  legado=${u.novoLegado.toFixed(2)}  R$ ${u.novoBruto.toFixed(2)}`,
      );
    }
    return;
  }

  for (const u of updates) {
    await prisma.investorPayable.update({
      where: { id: u.id },
      data: {
        kwhCompensadoBase: u.novoKwhBase,
        kwhCreditoLegadoAbatido: u.novoLegado,
        valorBruto: u.novoBruto,
        valorLiquido: u.novoLiquido,
        originatedByPlantBillId: u.novoOriginId,
        observacoes: u.novaObs,
      },
    });
  }
  console.log(`  ${updates.length} payables atualizados.`);
}

function appendObs(current: string | null, flag: string): string {
  if (!current) return flag;
  if (current.includes(flag.split(" ")[0])) return current;
  return `${current} | ${flag}`;
}

function cleanObs(current: string | null, flagsToRemove: string[]): string | null {
  if (!current) return null;
  const parts = current.split("|").map((s) => s.trim());
  const kept = parts.filter((p) => !flagsToRemove.some((f) => p.startsWith(f)));
  return kept.length === 0 ? null : kept.join(" | ");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
