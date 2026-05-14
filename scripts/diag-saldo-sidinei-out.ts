/**
 * Diagnostic: rastreia o saldo acumulado para o relatorio de Outubro/2025
 * do Sidinei (plant id c92bd286-6c47-4609-9edb-9443bc30cb77).
 *
 * Mostra:
 *  - data marco zero (vigencia do rateio)
 *  - bills da UC geradora mes a mes (injetado)
 *  - payables agrupados por mes de origem (compensado)
 *  - calcularSaldoCredito retorno (saldoAnterior, saldoFinal, historico)
 */

import { prisma } from "../src/lib/prisma";
import { calcularSaldoCredito } from "../src/lib/investor-credit-balance";

async function main() {
  const plantId = "c92bd286-6c47-4609-9edb-9443bc30cb77";
  const ano = 2025;
  const mes = 10;

  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: {
      id: true,
      name: true,
      numeroUsina: true,
      dataAssinaturaContrato: true,
      investors: { select: { investorId: true } },
    },
  });
  if (!plant) {
    console.log("Plant nao encontrada");
    return;
  }
  console.log("=== PLANT ===");
  console.log(plant);

  const investorId = plant.investors[0]?.investorId;
  if (!investorId) {
    console.log("sem investidor");
    return;
  }

  const rateios = await prisma.rateioVersion.findMany({
    where: { plantId, status: { in: ["VIGENTE", "SUBSTITUIDO"] } },
    orderBy: { vigenteAPartirDe: "asc" },
    select: { id: true, status: true, vigenteAPartirDe: true },
  });
  console.log("\n=== RATEIOS ===");
  console.log(rateios);

  const billsRaw = await prisma.consumerBill.findMany({
    where: { plantId, consumerUnitId: null },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }, { syncedAt: "desc" }],
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      energiaInjetadaMedidorKwh: true,
      dataLeituraAtual: true,
      syncedAt: true,
    },
  });
  console.log("\n=== BILLS DA UC GERADORA (raw) ===");
  for (const b of billsRaw) {
    console.log(
      `${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} | injetado=${b.energiaInjetadaMedidorKwh ?? "-"} | leitura=${b.dataLeituraAtual?.toISOString().slice(0, 10) ?? "null"} | id=${b.id}`,
    );
  }

  const payables = await prisma.investorPayable.findMany({
    where: {
      investorId,
      plantId,
      status: { not: "AGUARDANDO_COMPENSACAO" },
    },
    select: {
      id: true,
      status: true,
      anoReferencia: true,
      mesReferencia: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      carriedFromPayableId: true,
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
      carriedFromPayable: {
        select: {
          anoReferencia: true,
          mesReferencia: true,
          originatedByPlantBill: {
            select: { anoReferencia: true, mesReferencia: true },
          },
        },
      },
      consumerUnit: { select: { codigoUc: true } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  console.log("\n=== PAYABLES (status != AGUARDANDO_COMPENSACAO) ===");
  for (const p of payables) {
    const origemAno = p.carriedFromPayableId
      ? (p.carriedFromPayable?.originatedByPlantBill?.anoReferencia ??
          p.carriedFromPayable?.anoReferencia)
      : (p.originatedByPlantBill?.anoReferencia ?? p.anoReferencia);
    const origemMes = p.carriedFromPayableId
      ? (p.carriedFromPayable?.originatedByPlantBill?.mesReferencia ??
          p.carriedFromPayable?.mesReferencia)
      : (p.originatedByPlantBill?.mesReferencia ?? p.mesReferencia);
    const total = (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0);
    console.log(
      `UC=${p.consumerUnit?.codigoUc ?? "-"} | display=${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} | origem=${origemAno}-${String(origemMes).padStart(2, "0")} | base=${p.kwhCompensadoBase} ajuste=${p.kwhCompensadoAjuste} total=${total} | status=${p.status} | saldo?=${p.carriedFromPayableId ? "SIM" : "nao"}`,
    );
  }

  console.log("\n=== calcularSaldoCredito(ano=2025, mes=10) ===");
  const saldo = await calcularSaldoCredito({ plantId, investorId, ano, mes });
  console.log("saldoAnterior:", saldo.saldoAnterior);
  console.log("injetadoMes:", saldo.injetadoMes);
  console.log("compensadoBrutoMes:", saldo.compensadoBrutoMes);
  console.log("compensadoEfetivoMes:", saldo.compensadoEfetivoMes);
  console.log("creditoLegadoMes:", saldo.creditoLegadoMes);
  console.log("saldoFinal:", saldo.saldoFinal);
  console.log("\n--- historico ---");
  for (const h of saldo.historico) {
    console.log(
      `${h.ano}-${String(h.mes).padStart(2, "0")} | inj=${h.injetado.toFixed(0)} compBruto=${h.compensadoBruto.toFixed(0)} compEf=${h.compensadoEfetivo.toFixed(0)} legado=${h.creditoLegado.toFixed(0)} saldoFim=${h.saldoFim.toFixed(0)}`,
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
