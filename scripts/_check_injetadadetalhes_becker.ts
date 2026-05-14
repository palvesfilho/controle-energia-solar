import { prisma } from "../src/lib/prisma";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b";

interface DetalheItem {
  mesOrigem: string;
  teKwh?: number;
  tusdKwh?: number;
}

async function main() {
  const ucs = await prisma.consumerUnit.findMany({
    where: { plantId: PLANT_ID },
    select: { id: true, codigoUc: true, nome: true },
  });

  for (const uc of ucs) {
    const bills = await prisma.consumerBill.findMany({
      where: { consumerUnitId: uc.id, anoReferencia: { gte: 2025 } },
      orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
      select: {
        anoReferencia: true,
        mesReferencia: true,
        energiaCompensada: true,
        injetadaDetalhes: true,
        fonteConsulta: true,
      },
    });
    console.log(`\n--- ${uc.codigoUc} ${uc.nome} ---`);
    for (const b of bills) {
      const ref = `${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")}`;
      let parsed: DetalheItem[] | null = null;
      try {
        parsed = b.injetadaDetalhes ? JSON.parse(b.injetadaDetalhes) : null;
      } catch {}
      const detalhesStr = parsed
        ? parsed.map((d) => `${d.mesOrigem}:${(d.teKwh ?? 0).toFixed(2)}`).join("  ")
        : "(sem detalhes)";
      console.log(
        `  ${ref}  ${b.fonteConsulta?.padEnd(15)}  comp=${(b.energiaCompensada ?? 0).toFixed(2).padStart(8)}  ${detalhesStr}`,
      );
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
