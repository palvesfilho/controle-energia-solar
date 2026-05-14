import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plants = await prisma.plant.findMany({
    select: { id: true, numeroUsina: true, name: true, active: true },
    orderBy: { numeroUsina: "asc" },
  });

  console.log(`\n=== USINAS (${plants.length}) ===`);
  for (const p of plants) {
    console.log(
      `  ${(p.numeroUsina ?? "(s/num)").padEnd(12)} ${p.active ? "ATIVA" : "inativa"} — ${p.name}`,
    );
  }

  const rateios = await prisma.rateioVersion.findMany({
    select: {
      id: true,
      plantId: true,
      status: true,
      criadoEm: true,
      enviadoEm: true,
      aceitoEm: true,
      substituidoEm: true,
      _count: { select: { items: true } },
    },
    orderBy: [{ plantId: "asc" }, { criadoEm: "asc" }],
  });

  console.log(`\n=== RATEIOS (${rateios.length}) ===`);
  const byPlant = new Map<string, typeof rateios>();
  for (const r of rateios) {
    if (!byPlant.has(r.plantId)) byPlant.set(r.plantId, []);
    byPlant.get(r.plantId)!.push(r);
  }
  for (const [plantId, list] of byPlant) {
    const plant = plants.find((p) => p.id === plantId);
    console.log(
      `\n  Usina ${plant?.numeroUsina ?? "?"} — ${plant?.name ?? plantId}`,
    );
    for (const r of list) {
      const dt = (d: Date | null) =>
        d ? new Date(d).toISOString().slice(0, 10) : "—";
      console.log(
        `    [${r.status.padEnd(18)}] criado=${dt(r.criadoEm)} aceito=${dt(r.aceitoEm)} subst=${dt(r.substituidoEm)} itens=${r._count.items}`,
      );
    }
  }

  const bills = await prisma.consumerBill.groupBy({
    by: ["anoReferencia", "mesReferencia"],
    _count: { _all: true },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });

  console.log(`\n=== FATURAS por mês ===`);
  for (const b of bills) {
    console.log(
      `  ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}: ${b._count._all}`,
    );
  }

  const mar2025 = await prisma.consumerBill.findMany({
    where: { anoReferencia: 2025, mesReferencia: 3 },
    select: {
      id: true,
      consumerUnitId: true,
      plantId: true,
      fonteConsulta: true,
      energiaCompensada: true,
    },
  });
  const ucIds = Array.from(
    new Set(mar2025.map((b) => b.consumerUnitId).filter(Boolean) as string[]),
  );
  const ucs = await prisma.consumerUnit.findMany({
    where: { id: { in: ucIds } },
    select: { id: true, codigoUc: true, nome: true, plantId: true },
  });
  const ucMap = new Map(ucs.map((u) => [u.id, u]));

  console.log(`\n=== FATURAS março/2025 (${mar2025.length}) ===`);
  for (const b of mar2025) {
    const uc = b.consumerUnitId ? ucMap.get(b.consumerUnitId) : null;
    const plant = plants.find((p) => p.id === b.plantId);
    console.log(
      `  UC ${uc?.codigoUc ?? "?"} ${uc?.nome ?? ""} | usina=${plant?.numeroUsina ?? "—"} | fonte=${b.fonteConsulta ?? "—"} | compensada=${b.energiaCompensada ?? "—"}`,
    );
  }

  const plantsComFaturaMar = new Set(
    mar2025.map((b) => b.plantId).filter(Boolean) as string[],
  );

  console.log(`\n=== COBERTURA DE RATEIO PARA MARÇO/2025 ===`);
  for (const plantId of plantsComFaturaMar) {
    const plant = plants.find((p) => p.id === plantId);
    const rateiosPlant = byPlant.get(plantId) ?? [];
    const vigenteMar = rateiosPlant.find(
      (r) =>
        r.status === "VIGENTE" ||
        (r.aceitoEm && new Date(r.aceitoEm) <= new Date("2025-03-31")),
    );
    console.log(
      `  Usina ${plant?.numeroUsina ?? "?"}: ${vigenteMar ? `tem rateio [${vigenteMar.status}] aceito=${vigenteMar.aceitoEm ? new Date(vigenteMar.aceitoEm).toISOString().slice(0, 10) : "—"}` : "SEM RATEIO"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
