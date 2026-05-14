import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Popula dados ficticios dos ultimos 12 meses para uma UC escolhida
 * (ConsumerUnitBilling + ConsumerBill) para visualizar o demonstrativo.
 */
async function main() {
  const ucCode = process.argv[2];
  if (!ucCode) {
    const ucs = await prisma.consumerUnit.findMany({
      take: 10,
      include: { consumer: { select: { name: true, plants: { select: { descontoPercent: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    console.log("\nInforme o codigoUc como argumento. UCs disponiveis:\n");
    for (const u of ucs) {
      console.log(
        `  npx tsx scripts/seed-demonstrativo-ficticio.ts ${u.codigoUc}   (${u.nome} — ${u.consumer?.name ?? "sem consumer"})`,
      );
    }
    return;
  }

  const uc = await prisma.consumerUnit.findFirst({
    where: { codigoUc: ucCode },
    include: {
      consumer: { include: { plants: true } },
    },
  });
  if (!uc) {
    console.error(`UC ${ucCode} nao encontrada`);
    return;
  }
  if (!uc.consumer) {
    console.error(`UC ${ucCode} nao tem consumer vinculado`);
    return;
  }

  const consumer = uc.consumer;
  const desconto = consumer.plants?.[0]?.descontoPercent ?? 20;
  console.log(`Semeando 12 meses para UC ${uc.codigoUc} (${uc.nome}) — desconto ${desconto}%`);

  const now = new Date();
  const baseMonth = now.getMonth() + 1;
  const baseYear = now.getFullYear();

  for (let i = 11; i >= 0; i--) {
    const d = new Date(baseYear, baseMonth - 1 - i, 1);
    const ano = d.getFullYear();
    const mes = d.getMonth() + 1;

    // Consumo entre 400 e 900 kWh
    const consumoKwh = 400 + Math.round(Math.random() * 500);
    // Energia compensada cobre 85% a 100% do consumo
    const compensadoKwh = Math.round(consumoKwh * (0.85 + Math.random() * 0.15));
    // Tarifa media
    const tarifaTE = 0.35 + Math.random() * 0.05;
    const tarifaTUSD = 0.38 + Math.random() * 0.05;
    const tarifaTotal = tarifaTE + tarifaTUSD;

    const valorTotal = Number((consumoKwh * tarifaTotal).toFixed(2));
    const valorCobranca = Number((valorTotal * (1 - desconto / 100)).toFixed(2));

    const vencimento = new Date(ano, mes - 1, 15);

    // Upsert ConsumerBill
    const billData = {
      valorTotal,
      vencimento,
      contaPaga: i > 0, // todos os meses anteriores pagos, mes atual em aberto
      consumoKwh,
      energiaCompensada: compensadoKwh,
      energiaInjetada: compensadoKwh + Math.round(Math.random() * 50),
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

    // Upsert ConsumerUnitBilling
    const existingBilling = await prisma.consumerUnitBilling.findFirst({
      where: { consumerUnitId: uc.id, ano, mes },
    });
    const billingData = {
      valorFatura: valorTotal,
      valorCompensado: Number((compensadoKwh * tarifaTotal).toFixed(2)),
      valorEconomia: Number((valorTotal - valorCobranca).toFixed(2)),
      valorCobranca,
      dataVencimento: vencimento,
      status: i === 0 ? "PENDENTE" : "PAGO",
    };
    if (existingBilling) {
      await prisma.consumerUnitBilling.update({ where: { id: existingBilling.id }, data: billingData });
    } else {
      // Backdate createdAt para que "inicio do contrato" fique ~12 meses atras
      const created = await prisma.consumerUnitBilling.create({
        data: {
          consumerUnitId: uc.id,
          ano,
          mes,
          ...billingData,
        },
      });
      // Prisma nao permite setar createdAt direto no create; usar update com raw SQL
      const iso = d.toISOString();
      await prisma.$executeRawUnsafe(
        `UPDATE consumer_unit_billings SET created_at = ? WHERE id = ?`,
        iso,
        created.id,
      );
    }

    console.log(
      `  ${ano}-${String(mes).padStart(2, "0")}: consumo=${consumoKwh}kWh, compensado=${compensadoKwh}kWh, fatura=R$${valorTotal}, cobranca=R$${valorCobranca}`,
    );
  }

  const billings = await prisma.consumerUnitBilling.findMany({
    where: { consumerUnitId: uc.id },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    take: 1,
  });
  console.log(`\nOk. Billing mais recente: ${billings[0]?.id}`);
  console.log(
    `PDF: http://localhost:3000/api/admin/faturamento/unidades-consumidoras/${billings[0]?.id}/demonstrativo`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
