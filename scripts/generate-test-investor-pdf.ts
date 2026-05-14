/**
 * Gera o relatório PDF do investidor usando dados reais do banco.
 *
 * Replica a lógica da rota /api/plants/[id]/monthly-report/generate sem precisar
 * subir o servidor — útil para iterar no layout.
 *
 * Uso:
 *   npx tsx scripts/generate-test-investor-pdf.ts <plantId|numeroUsina> <ano> <mes>
 *
 * Exemplo (BECKER E BRUM, mar/2026):
 *   npx tsx scripts/generate-test-investor-pdf.ts 4003476471 2026 3
 */
import fs from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "../src/lib/prisma";
import {
  InvestorReportPDF,
  type InvestorReportData,
} from "../src/components/billing/investor-report-pdf";
import { calcularSaldoCredito } from "../src/lib/investor-credit-balance";

const MES_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

async function main() {
  const [plantArg, anoArg, mesArg] = process.argv.slice(2);
  if (!plantArg || !anoArg || !mesArg) {
    console.error(
      "Uso: npx tsx scripts/generate-test-investor-pdf.ts <plantId|numeroUsina> <ano> <mes>",
    );
    process.exit(1);
  }
  const ano = Number(anoArg);
  const mes = Number(mesArg);
  if (!Number.isInteger(ano) || !Number.isInteger(mes)) {
    console.error("ano e mes precisam ser inteiros");
    process.exit(1);
  }

  const plant = await prisma.plant.findFirst({
    where: {
      OR: [{ id: plantArg }, { numeroUsina: plantArg }],
    },
    select: {
      id: true,
      name: true,
      numeroUsina: true,
      investors: {
        select: {
          id: true,
          valorKwhContrato: true,
          gestaoFixaContrato: true,
          investor: {
            select: {
              id: true,
              cpf: true,
              cnpj: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!plant) {
    console.error(`Usina não encontrada: ${plantArg}`);
    process.exit(1);
  }
  const investorLink = plant.investors[0];
  if (!investorLink) {
    console.error("Usina sem investidor vinculado.");
    process.exit(1);
  }

  const [billUsina, payables, saldoCredito] = await Promise.all([
    prisma.consumerBill.findFirst({
      where: { plantId: plant.id, anoReferencia: ano, mesReferencia: mes },
      orderBy: { syncedAt: "desc" },
      select: {
        energiaInjetadaMedidorKwh: true,
        valorTotal: true,
      },
    }),
    prisma.investorPayable.findMany({
      where: {
        investorId: investorLink.investor.id,
        plantId: plant.id,
        anoReferencia: ano,
        mesReferencia: mes,
      },
      select: {
        consumerUnitId: true,
        status: true,
        kwhCompensadoBase: true,
        kwhCompensadoAjuste: true,
        valorBruto: true,
        valorAjuste: true,
        valorLiquido: true,
        consumerUnit: { select: { codigoUc: true, nome: true } },
      },
    }),
    calcularSaldoCredito({
      plantId: plant.id,
      investorId: investorLink.investor.id,
      ano,
      mes,
    }),
  ]);

  const sumKwh = (arr: typeof payables) =>
    arr.reduce(
      (s, p) => s + (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0),
      0,
    );
  const sumValorBruto = (arr: typeof payables) =>
    arr.reduce((s, p) => s + (p.valorBruto ?? 0), 0);
  const sumValorLiquido = (arr: typeof payables) =>
    arr.reduce((s, p) => s + (p.valorLiquido ?? 0), 0);

  const realizado = payables.filter(
    (p) => p.status === "DISPONIVEL" || p.status === "PAGO",
  );
  const aguardandoComp = payables.filter(
    (p) => p.status === "AGUARDANDO_COMPENSACAO",
  );
  const aguardandoPag = payables.filter(
    (p) =>
      p.status === "AGUARDANDO_PAGAMENTO" ||
      p.status === "EM_COBRANCA_JUDICIAL",
  );

  const kwhCompensado = sumKwh(realizado);
  const kwhRepresadoCompensacao = sumKwh(aguardandoComp);
  const kwhRepresadoInadimplencia = sumKwh(aguardandoPag);

  const kwhInjetado = billUsina?.energiaInjetadaMedidorKwh ?? null;
  const kwhCredito =
    kwhInjetado != null ? Math.max(0, kwhInjetado - kwhCompensado) : null;

  const valorKwhContrato = investorLink.valorKwhContrato ?? null;
  const gestaoFixa = investorLink.gestaoFixaContrato ?? null;
  const valorContaUcUsina = billUsina?.valorTotal ?? null;

  const valorBruto = sumValorBruto(realizado);
  const valorBrutoLiquidoPayables = sumValorLiquido(realizado);
  const valorRepresadoCompensacao = sumValorLiquido(aguardandoComp);
  const valorRepresadoInadimplencia = sumValorLiquido(aguardandoPag);

  const valorReceber =
    valorBrutoLiquidoPayables - (gestaoFixa ?? 0) - (valorContaUcUsina ?? 0);

  const ucsRepresadasInadimplencia = aguardandoPag
    .map((p) => ({
      codigoUc: p.consumerUnit?.codigoUc ?? null,
      nome: p.consumerUnit?.nome ?? null,
      kwh: (p.kwhCompensadoBase ?? 0) + (p.kwhCompensadoAjuste ?? 0),
      valor: p.valorLiquido ?? 0,
    }))
    .filter((u) => u.kwh > 0 || u.valor > 0);

  const investorName =
    investorLink.investor.user?.name ??
    investorLink.investor.user?.email ??
    "Investidor";
  const investorDoc =
    investorLink.investor.cnpj ?? investorLink.investor.cpf ?? null;

  const data: InvestorReportData = {
    plantName: plant.name,
    numeroUsina: plant.numeroUsina,
    investorName,
    investorDoc,
    mesLabel: `${MES_LABELS[mes - 1]}/${ano}`,
    emissao: new Date().toLocaleDateString("pt-BR"),
    reportNumero: null,
    kwhInjetado,
    kwhCompensado,
    kwhCredito,
    valorKwhContrato,
    valorBruto,
    gestaoFixaMensal: gestaoFixa,
    valorContaUcUsina,
    valorReceber,
    kwhRepresadoCompensacao,
    valorRepresadoCompensacao,
    kwhRepresadoInadimplencia,
    valorRepresadoInadimplencia,
    ucsRepresadasInadimplencia,
    saldoCreditoAnterior: saldoCredito.saldoAnterior,
    saldoCreditoFinal: saldoCredito.saldoFinal,
    observacoes: null,
  };

  console.log("Resumo dos dados gerados:");
  console.log(JSON.stringify(data, null, 2));

  const buffer = await renderToBuffer(InvestorReportPDF({ data }));
  const outDir = path.resolve(process.cwd(), "out");
  await fs.mkdir(outDir, { recursive: true });
  const filename = `relatorio-investidor-${plant.numeroUsina ?? plant.id.slice(0, 8)}-${String(mes).padStart(2, "0")}-${ano}.pdf`;
  const outPath = path.join(outDir, filename);
  await fs.writeFile(outPath, buffer);
  console.log(`\nPDF gerado: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
