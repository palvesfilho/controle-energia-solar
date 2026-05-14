import { prisma } from "../src/lib/prisma";

const PLANT_ID = "4018f3bd-50bd-4ff9-87d4-d50b680e437b";
const ANO = 2025;
const MES = 4;

async function main() {
  console.log("=== BECKER E BRUM — Competência abril/2025 ===\n");

  // 1. Faturas da usina a descontar (mar + abr)
  const faturas = await prisma.consumerBill.findMany({
    where: {
      plantId: PLANT_ID,
      consumerUnitId: null,
      OR: [
        { anoReferencia: { lt: ANO } },
        { AND: [{ anoReferencia: ANO }, { mesReferencia: { lte: MES } }] },
      ],
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: { anoReferencia: true, mesReferencia: true, valorTotal: true },
  });
  console.log("FATURAS DA USINA (1º relatório agrega):");
  let totalFaturas = 0;
  for (const f of faturas) {
    console.log(`  ${f.anoReferencia}-${String(f.mesReferencia).padStart(2, "0")}  R$ ${(f.valorTotal ?? 0).toFixed(2)}`);
    totalFaturas += f.valorTotal ?? 0;
  }
  console.log(`  ─────────────────`);
  console.log(`  TOTAL:        R$ ${totalFaturas.toFixed(2)}`);

  // 2. Investor link
  const plant = await prisma.plant.findUnique({
    where: { id: PLANT_ID },
    select: {
      investors: {
        select: {
          valorKwhContrato: true,
          gestaoFixaContrato: true,
          investor: { select: { id: true } },
        },
      },
    },
  });
  const link = plant!.investors[0]!;
  console.log(`\nCONTRATO DO INVESTIDOR:`);
  console.log(`  valorKwhContrato:   R$ ${link.valorKwhContrato?.toFixed(5) ?? "—"}`);
  console.log(`  gestaoFixaContrato: R$ ${link.gestaoFixaContrato?.toFixed(2) ?? "—"}`);

  // 3. Payables com competência abril/2025 (originatedByPlantBill abril)
  const payables = await prisma.investorPayable.findMany({
    where: {
      plantId: PLANT_ID,
      originatedByPlantBill: { anoReferencia: ANO, mesReferencia: MES },
    },
    select: {
      id: true,
      status: true,
      kwhCompensadoBase: true,
      kwhCompensadoAjuste: true,
      valorBruto: true,
      valorAjuste: true,
      valorLiquido: true,
      valorAbatidoDebito: true,
      kwhCreditoLegadoAbatido: true,
      sharePercent: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      anoReferencia: true,
      mesReferencia: true,
    },
  });
  console.log(`\nPAYABLES (competência geração ${ANO}-${String(MES).padStart(2, "0")}):`);
  let bruto = 0;
  let liquido = 0;
  for (const p of payables) {
    const kwh = (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0);
    console.log(
      `  ${p.consumerUnit?.codigoUc ?? "?"} (${p.consumerUnit?.nome ?? "?"})\n` +
      `    status=${p.status}  consumer_bill=${p.anoReferencia}-${String(p.mesReferencia).padStart(2, "0")}\n` +
      `    kwh_base=${p.kwhCompensadoBase}  ajuste=${p.kwhCompensadoAjuste}  total=${kwh.toFixed(4)}\n` +
      `    valor_bruto=R$ ${p.valorBruto.toFixed(4)}  ajuste=R$ ${p.valorAjuste.toFixed(2)}\n` +
      `    valor_liquido=R$ ${p.valorLiquido.toFixed(4)}\n` +
      `    valor_abatido_debito=R$ ${p.valorAbatidoDebito.toFixed(2)}  kwh_credito_legado=${p.kwhCreditoLegadoAbatido.toFixed(2)}`
    );
    bruto += p.valorBruto ?? 0;
    liquido += p.valorLiquido ?? 0;
  }
  console.log(`\n  TOTAL kwh:       ${payables.reduce((s, p) => s + (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0), 0).toFixed(4)}`);
  console.log(`  TOTAL bruto:     R$ ${bruto.toFixed(4)}`);
  console.log(`  TOTAL liquido:   R$ ${liquido.toFixed(4)}`);

  // 4. Cálculo final
  console.log(`\n=== CÁLCULO FINAL DO RELATÓRIO ===`);
  console.log(`  Bruto realizado:   R$ ${liquido.toFixed(4)} (= soma dos valor_liquido dos payables)`);
  console.log(`  − Conta usina:     R$ ${totalFaturas.toFixed(2)}`);
  console.log(`  − Gestão:          R$ ${link.gestaoFixaContrato?.toFixed(2) ?? "0.00"}`);
  const ll = liquido - totalFaturas - (link.gestaoFixaContrato ?? 0);
  console.log(`  ──────────────────────────`);
  console.log(`  LÍQUIDO:           R$ ${ll.toFixed(4)}  (≈ R$ ${ll.toFixed(2)})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
