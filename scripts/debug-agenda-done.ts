import { prisma } from "../src/lib/prisma";

async function main() {
  // Auditoria: distribuição de hora UTC das datas de obras
  const obras = await prisma.obra.findMany({
    where: { dataInicioPrevista: { not: null } },
    select: { id: true, nome: true, dataInicioPrevista: true, dataFimPrevista: true },
  });
  console.log("Total obras com data:", obras.length);
  const horasUtc: Record<string, number> = {};
  for (const o of obras) {
    if (o.dataInicioPrevista) {
      const h = o.dataInicioPrevista.getUTCHours();
      horasUtc[`${h}h`] = (horasUtc[`${h}h`] ?? 0) + 1;
    }
  }
  console.log("Distribuição da hora UTC de dataInicioPrevista:");
  for (const k of Object.keys(horasUtc).sort()) console.log("  ", k, "->", horasUtc[k]);

  console.log("\nAmostra das 5 obras mais recentes:");
  const recent = obras.slice(0, 5);
  for (const o of recent) {
    console.log(
      "  ",
      o.nome,
      "→ ini=",
      o.dataInicioPrevista?.toISOString(),
      "fim=",
      o.dataFimPrevista?.toISOString()
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
