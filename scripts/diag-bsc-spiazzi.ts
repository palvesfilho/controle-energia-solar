import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const propId = "cmnxknpp4013erxnrinjw9r6d";
  const bscs = await p.brasilSolarClient.findMany({
    where: { proprietarioId: propId },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      plantId: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
      potenciaInstalada: true,
      investimento: true,
      dataInstalacao: true,
      active: true,
    },
  });
  console.log(
    `BrasilSolarClient(s) do proprietário Spiazzi (${propId}):`,
    bscs.length,
  );
  console.log(JSON.stringify(bscs, null, 2));

  // Faturas da UC Spiazzi
  const bills = await p.consumerBill.findMany({
    where: { consumerUnitId: "cmoaxxavp000ii22b61jr60r3" },
    select: {
      anoReferencia: true,
      mesReferencia: true,
      consumoKwh: true,
      energiaInjetadaMedidorKwh: true,
      energiaCompensada: true,
      tarifaTE: true,
      tarifaTUSD: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      valorTotal: true,
    },
    orderBy: [{ anoReferencia: "desc" }, { mesReferencia: "desc" }],
  });
  console.log(`\nConsumerBills da UC Spiazzi: ${bills.length}`);
  for (const b of bills) {
    console.log(
      `  ${b.mesReferencia}/${b.anoReferencia}: consumo=${b.consumoKwh ?? "-"} injetada=${b.energiaInjetadaMedidorKwh ?? "-"} compensada=${b.energiaCompensada ?? "-"} valor=${b.valorTotal ?? "-"}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
