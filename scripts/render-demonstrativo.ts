import { writeFileSync } from "fs";
import { resolve } from "path";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadDemonstrativoData } from "@/lib/demonstrativo";
import { DemonstrativoPDF } from "@/components/billing/demonstrativo-pdf";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const codigoUc = process.argv[2];
  if (!codigoUc) {
    console.error("Uso: npx tsx scripts/render-demonstrativo.ts <codigoUc> [ano] [mes]");
    process.exit(1);
  }
  const ano = process.argv[3] ? Number(process.argv[3]) : undefined;
  const mes = process.argv[4] ? Number(process.argv[4]) : undefined;

  const uc = await prisma.consumerUnit.findUnique({ where: { codigoUc } });
  if (!uc) {
    console.error(`UC ${codigoUc} não encontrada`);
    process.exit(1);
  }

  const billing = await prisma.consumerUnitBilling.findFirst({
    where: {
      consumerUnitId: uc.id,
      ...(ano && mes ? { ano, mes } : {}),
    },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
  });
  if (!billing) {
    console.error(`Nenhuma cobrança encontrada para UC ${codigoUc}`);
    process.exit(1);
  }

  console.log(`Renderizando demonstrativo da billing ${billing.id} (${String(billing.mes).padStart(2, "0")}/${billing.ano})`);

  const data = await loadDemonstrativoData(billing.id);
  if (!data) {
    console.error("loadDemonstrativoData retornou null");
    process.exit(1);
  }

  const base = `demonstrativo-${codigoUc}-${data.mesLabel.replace("/", "-")}`;
  for (const layout of ["a", "b"] as const) {
    const buffer = await renderToBuffer(DemonstrativoPDF({ data, layout }));
    const out = resolve(process.cwd(), `${base}-layout-${layout.toUpperCase()}.pdf`);
    writeFileSync(out, buffer);
    console.log(`PDF salvo em: ${out}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
