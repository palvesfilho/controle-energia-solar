import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ucCode = process.argv[2];
  const descontoArg = process.argv[3] ? Number(process.argv[3]) : 20;
  if (!ucCode) {
    console.error("Uso: npx tsx scripts/seed-demonstrativo-preservando.ts <codigoUc> [descontoPercent=20]");
    process.exit(1);
  }

  const uc = await prisma.consumerUnit.findFirst({
    where: { codigoUc: ucCode },
    include: { consumer: { include: { plants: true } } },
  });
  if (!uc) throw new Error(`UC ${ucCode} não encontrada`);
  if (!uc.consumer) throw new Error(`UC ${ucCode} sem consumer`);
  if (!uc.plantId) throw new Error(`UC ${ucCode} sem plantId`);

  const existingCp = uc.consumer.plants.find((p) => p.plantId === uc.plantId);
  if (existingCp) {
    await prisma.consumerPlant.update({
      where: { id: existingCp.id },
      data: { descontoPercent: descontoArg },
    });
    console.log(`ConsumerPlant atualizado (desconto ${descontoArg}%)`);
  } else {
    await prisma.consumerPlant.create({
      data: {
        consumerId: uc.consumer.id,
        plantId: uc.plantId,
        descontoPercent: descontoArg,
        cotaPercent: 100,
      },
    });
    console.log(`ConsumerPlant criado (desconto ${descontoArg}%)`);
  }

  const now = new Date();
  const refMes = now.getMonth() + 1;
  const refAno = now.getFullYear();

  console.log(
    `Semeando histórico fictício. Mês atual (${String(refMes).padStart(2, "0")}/${refAno}) será PRESERVADO (dado real Infosimples).`,
  );

  for (let i = 11; i >= 1; i--) {
    const d = new Date(refAno, refMes - 1 - i, 1);
    const ano = d.getFullYear();
    const mes = d.getMonth() + 1;

    const consumoKwh = 300 + Math.round(Math.random() * 200);
    const compensadoKwh = Math.round(consumoKwh * (0.85 + Math.random() * 0.15));
    const tarifaTE = 0.30 + Math.random() * 0.03;
    const tarifaTUSD = 0.50 + Math.random() * 0.05;
    const tarifaTotal = tarifaTE + tarifaTUSD;

    const valorTotal = Number((consumoKwh * tarifaTotal).toFixed(2));
    const valorCobranca = Number((valorTotal * (1 - descontoArg / 100)).toFixed(2));
    const vencimento = new Date(ano, mes - 1, 15);

    const billData = {
      valorTotal,
      vencimento,
      contaPaga: true,
      consumoKwh,
      energiaCompensada: compensadoKwh,
      energiaInjetada: compensadoKwh + Math.round(Math.random() * 30),
      tarifaTE: Number(tarifaTE.toFixed(4)),
      tarifaTUSD: Number(tarifaTUSD.toFixed(4)),
      bandeiraTarifaria: ["Verde", "Amarela", "Vermelha 1"][Math.floor(Math.random() * 3)],
      fonteConsulta: "FICTICIO",
    };

    await prisma.consumerBill.upsert({
      where: {
        consumerUnitId_anoReferencia_mesReferencia: {
          consumerUnitId: uc.id,
          anoReferencia: ano,
          mesReferencia: mes,
        },
      },
      update: billData,
      create: {
        consumerUnitId: uc.id,
        instalacao: uc.codigoUc,
        anoReferencia: ano,
        mesReferencia: mes,
        ...billData,
      },
    });

    const existingBilling = await prisma.consumerUnitBilling.findFirst({
      where: { consumerUnitId: uc.id, ano, mes },
    });
    const billingData = {
      valorFatura: valorTotal,
      valorCompensado: Number((compensadoKwh * tarifaTotal).toFixed(2)),
      valorEconomia: Number((valorTotal - valorCobranca).toFixed(2)),
      valorCobranca,
      dataVencimento: vencimento,
      status: "PAGO",
    };
    if (existingBilling) {
      await prisma.consumerUnitBilling.update({ where: { id: existingBilling.id }, data: billingData });
    } else {
      const created = await prisma.consumerUnitBilling.create({
        data: { consumerUnitId: uc.id, ano, mes, ...billingData },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE consumer_unit_billings SET created_at = ? WHERE id = ?`,
        d.toISOString(),
        created.id,
      );
    }

    console.log(
      `  ${ano}-${String(mes).padStart(2, "0")}: consumo=${consumoKwh} kWh, compensado=${compensadoKwh} kWh, fatura=R$ ${valorTotal}, cobrança=R$ ${valorCobranca}`,
    );
  }

  const billingAtual = await prisma.consumerUnitBilling.findFirst({
    where: { consumerUnitId: uc.id, ano: refAno, mes: refMes },
  });
  const billReal = await prisma.consumerBill.findFirst({
    where: { consumerUnitId: uc.id, anoReferencia: refAno, mesReferencia: refMes },
  });
  if (billReal && billingAtual) {
    const valorFatura = billReal.valorTotal ?? 0;
    const valorCobranca = Number((valorFatura * (1 - descontoArg / 100)).toFixed(2));
    const tarifaTot = (billReal.tarifaTE ?? 0) + (billReal.tarifaTUSD ?? 0);
    await prisma.consumerUnitBilling.update({
      where: { id: billingAtual.id },
      data: {
        valorFatura,
        valorCompensado: Number(((billReal.energiaCompensada ?? 0) * tarifaTot).toFixed(2)),
        valorEconomia: Number((valorFatura - valorCobranca).toFixed(2)),
        valorCobranca,
        dataVencimento: billReal.vencimento ?? new Date(refAno, refMes - 1, 15),
      },
    });
    console.log(
      `  ${refAno}-${String(refMes).padStart(2, "0")} (REAL preservado): fatura=R$ ${valorFatura}, cobrança=R$ ${valorCobranca}`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
