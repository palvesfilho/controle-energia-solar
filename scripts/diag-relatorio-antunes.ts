import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const UCS = ["3090579398", "3090579397", "3095464357"];

  console.log("\n=== UCs ===");
  const ucs = await prisma.consumerUnit.findMany({
    where: { codigoUc: { in: UCS } },
    select: {
      id: true,
      codigoUc: true,
      nome: true,
      plantId: true,
      active: true,
      plant: { select: { id: true, name: true, numeroUsina: true } },
    },
  });
  for (const u of ucs) {
    console.log(
      `  UC ${u.codigoUc} (${u.nome}) active=${u.active} plant=${u.plant?.numeroUsina ?? "—"}/${u.plant?.name ?? "—"}`,
    );
  }

  // Acha a planta ANTUNES pelo numeroUsina
  const plant = await prisma.plant.findFirst({
    where: { numeroUsina: "3095464357" },
    select: {
      id: true,
      name: true,
      numeroUsina: true,
      investors: {
        select: {
          id: true,
          sharePercent: true,
          investor: {
            select: {
              id: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  console.log(`\n=== USINA ANTUNES ===`);
  console.log(`  plantId=${plant?.id} name=${plant?.name}`);
  console.log(`  investidores: ${plant?.investors.length ?? 0}`);
  for (const iv of plant?.investors ?? []) {
    console.log(
      `    — ${iv.investor.user?.name ?? iv.investor.user?.email ?? "(s/nome)"} (share=${iv.sharePercent}%) [investorId=${iv.investor.id}]`,
    );
  }

  console.log(`\n=== RATEIOS DA USINA ===`);
  if (plant) {
    const rateios = await prisma.rateioVersion.findMany({
      where: { plantId: plant.id },
      select: {
        id: true,
        status: true,
        vigenteAPartirDe: true,
        criadoEm: true,
        items: {
          select: {
            percentual: true,
            consumerUnit: { select: { codigoUc: true, nome: true } },
          },
        },
      },
      orderBy: { vigenteAPartirDe: "desc" },
    });
    for (const r of rateios) {
      console.log(
        `  [${r.status}] vigente desde ${r.vigenteAPartirDe.toISOString().slice(0, 10)}`,
      );
      for (const it of r.items) {
        console.log(
          `    - ${it.consumerUnit.codigoUc} (${it.consumerUnit.nome}): ${it.percentual}%`,
        );
      }
    }
  }

  console.log(`\n=== FATURAS DAS UCs (todas) ===`);
  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnit: { codigoUc: { in: UCS } } },
    select: {
      id: true,
      consumerUnit: { select: { codigoUc: true } },
      plantId: true,
      anoReferencia: true,
      mesReferencia: true,
      fonteConsulta: true,
      energiaCompensada: true,
      energiaInjetada: true,
      consumoKwh: true,
      valorTotal: true,
      syncedAt: true,
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  for (const b of bills) {
    console.log(
      `  UC ${b.consumerUnit.codigoUc} ${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} | fonte=${b.fonteConsulta ?? "—"} | plantId=${b.plantId ?? "—"} | compensada=${b.energiaCompensada ?? "—"} injetada=${b.energiaInjetada ?? "—"} consumo=${b.consumoKwh ?? "—"} valor=${b.valorTotal ?? "—"}`,
    );
  }

  console.log(`\n=== INVESTOR PAYABLES (quaisquer) DESSAS UCs ===`);
  const payables = await prisma.investorPayable.findMany({
    where: {
      consumerUnit: { codigoUc: { in: UCS } },
    },
    select: {
      id: true,
      consumerUnit: { select: { codigoUc: true } },
      mesReferencia: true,
      anoReferencia: true,
      status: true,
      valorBase: true,
      valorFinal: true,
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  console.log(`  total=${payables.length}`);
  for (const p of payables) {
    console.log(
      `    UC ${p.consumerUnit.codigoUc} ${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")} status=${p.status} base=${p.valorBase} final=${p.valorFinal}`,
    );
  }

  console.log(`\n=== MONTHLY REPORTS DA USINA ===`);
  if (plant) {
    const reports = await prisma.monthlyReport.findMany({
      where: { plantId: plant.id },
      select: {
        id: true,
        ano: true,
        mes: true,
        status: true,
        publishedAt: true,
      },
      orderBy: [{ ano: "asc" }, { mes: "asc" }],
    });
    console.log(`  total=${reports.length}`);
    for (const r of reports) {
      console.log(
        `    ${r.ano}-${String(r.mes).padStart(2, "0")} status=${r.status} pub=${r.publishedAt ? r.publishedAt.toISOString().slice(0, 10) : "—"}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
