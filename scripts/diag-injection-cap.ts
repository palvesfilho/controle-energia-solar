/**
 * Diagnóstico do cap de injeção por plant.
 *
 * Roda applyInjectionCapToPlant em todas as plants ativas e imprime as que
 * tiveram abate (createdLegadoAbatido > 0). Operação é idempotente — pode
 * rodar várias vezes que o estado converge.
 *
 * Uso: npx tsx scripts/diag-injection-cap.ts
 */

import { prisma } from "../src/lib/prisma";
import { applyInjectionCapToPlant } from "../src/lib/investor-injection-cap";

async function main() {
  const plants = await prisma.plant.findMany({
    where: { active: true },
    select: { id: true, name: true, regraInstalacao: true, numeroUsina: true },
    orderBy: { name: "asc" },
  });

  console.log(`Plants ativas: ${plants.length}\n`);

  const resultados: Array<{
    plantName: string;
    numeroUsina: string | null;
    regra: string | null;
    capInjecaoKwh: number;
    totalCompensadoBrutoKwh: number;
    totalAbatidoKwh: number;
    payablesAfetadas: number;
    warnings: string[];
  }> = [];

  for (const p of plants) {
    try {
      const r = await applyInjectionCapToPlant(p.id);
      resultados.push({
        plantName: p.name,
        numeroUsina: p.numeroUsina,
        regra: p.regraInstalacao,
        capInjecaoKwh: r.capInjecaoTotalKwh,
        totalCompensadoBrutoKwh: r.totalCompensadoBrutoKwh,
        totalAbatidoKwh: r.totalAbatidoKwh,
        payablesAfetadas: r.payablesAfetadas,
        warnings: r.warnings,
      });
    } catch (e) {
      console.error(`[${p.name}] erro:`, e);
    }
  }

  const comAbate = resultados.filter((r) => r.totalAbatidoKwh > 0.0001);
  const comWarning = resultados.filter((r) => r.warnings.length > 0);

  console.log("=== Plants com cap aplicado (créditos legados detectados) ===");
  if (comAbate.length === 0) {
    console.log("Nenhuma plant com abate. Σ compensação ≤ Σ injeção em todos os casos.");
  } else {
    comAbate.sort((a, b) => b.totalAbatidoKwh - a.totalAbatidoKwh);
    console.log(
      [
        "Plant",
        "Usina",
        "Regra",
        "Σ injeção (kWh)",
        "Σ comp bruto (kWh)",
        "Σ abatido (kWh)",
        "Payables afetadas",
      ].join(" | "),
    );
    console.log("-".repeat(120));
    for (const r of comAbate) {
      console.log(
        [
          r.plantName,
          r.numeroUsina ?? "—",
          r.regra ?? "—",
          r.capInjecaoKwh.toFixed(0),
          r.totalCompensadoBrutoKwh.toFixed(0),
          r.totalAbatidoKwh.toFixed(0),
          r.payablesAfetadas,
        ].join(" | "),
      );
    }
  }

  console.log("\n=== Warnings ===");
  if (comWarning.length === 0) {
    console.log("Nenhum warning.");
  } else {
    for (const r of comWarning) {
      console.log(`[${r.plantName} / ${r.numeroUsina ?? "—"}]`);
      for (const w of r.warnings) console.log(`  - ${w}`);
    }
  }

  console.log(
    `\nTotal: ${plants.length} plants processadas, ${comAbate.length} com abate, ${comWarning.length} com warnings.`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
