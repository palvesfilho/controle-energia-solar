/**
 * Backfill da fatura DEZ/2025 da UC 4003710227 (OBA FOOD SERVICE).
 *
 * Lê o PDF baixado, roda parseFaturaPdf (que já extrai Grupo A no `bill`),
 * garante a ConsumerUnit cadastrada (cria mínimo se necessário) e faz
 * upsert da ConsumerBill.
 *
 * Após rodar, atualiza o cadastro contratual da UC (modalidadeTarifaria,
 * tensaoNominalContratadaV, geracaoContratadaKw) com base no que o parser
 * extraiu — só quando os campos da UC estiverem null (não sobrescreve cadastro
 * preenchido manualmente).
 *
 * Uso: npx tsx scripts/backfill-oba-grupo-a.ts <caminho-do-pdf>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseFaturaPdf } from "../src/lib/fatura-pdf-parser";

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2] ?? "C:/Users/thoma/Downloads/boleto_02_22_49 (2).pdf";
  const buffer = new Uint8Array(readFileSync(resolve(file)));

  console.log(`Parseando ${file}...`);
  const parsed = await parseFaturaPdf(buffer);

  if (!parsed.codigoInstalacao) {
    console.error("ERRO: parser não extraiu codigoInstalacao. Abortando.");
    process.exit(1);
  }

  console.log(`UC: ${parsed.codigoInstalacao}, Mês ref: ${parsed.bill.mesReferencia}/${parsed.bill.anoReferencia}, Total: R$ ${parsed.bill.valorTotal}`);

  // 1. ConsumerUnit
  let unit = await prisma.consumerUnit.findUnique({
    where: { codigoUc: parsed.codigoInstalacao },
  });

  if (!unit) {
    console.log("UC não encontrada — criando cadastro mínimo (Grupo A).");
    unit = await prisma.consumerUnit.create({
      data: {
        nome: "OBA FOOD SERVICE LTDA",
        codigoUc: parsed.codigoInstalacao,
        cpfCnpj: "48.401.254/0001-48",
        distribuidora: "RGE",
        grupo: "A",
        subGrupo: parsed.grupoA?.subgrupo ?? "A4",
        cidade: "SANTA MARIA",
        cep: "97030-440",
        logradouro: "AV PEDRO CEZAR SACCOL",
        numero: "1000 PL B",
        complemento: "AGRO INDUSTRIAL",
      },
    });
  } else {
    console.log(`UC encontrada: ${unit.id} (${unit.nome})`);
  }

  // 2. Atualizar cadastro contratual a partir do parser (só preenche se está null)
  if (parsed.grupoA) {
    const g = parsed.grupoA;
    const updates: Record<string, unknown> = {};
    if (unit.modalidadeTarifaria == null && g.modalidade) updates.modalidadeTarifaria = g.modalidade;
    if (unit.tensaoNominalContratadaV == null && g.tensaoNominalContratadaV != null)
      updates.tensaoNominalContratadaV = g.tensaoNominalContratadaV;
    if (unit.demandaContratadaKw == null && g.demandaContratadaKw != null)
      updates.demandaContratadaKw = g.demandaContratadaKw;
    if (unit.demandaContratadaPontaKw == null && g.demandaContratadaPontaKw != null)
      updates.demandaContratadaPontaKw = g.demandaContratadaPontaKw;
    if (unit.geracaoContratadaKw == null && g.geracaoContratadaKw != null)
      updates.geracaoContratadaKw = g.geracaoContratadaKw;
    if (Object.keys(updates).length > 0) {
      await prisma.consumerUnit.update({ where: { id: unit.id }, data: updates });
      console.log("Cadastro contratual da UC atualizado:", updates);
    } else {
      console.log("Cadastro contratual da UC já estava completo — nenhuma mudança.");
    }
  }

  // 3. ConsumerBill upsert
  const bill = await prisma.consumerBill.upsert({
    where: {
      consumerUnitId_anoReferencia_mesReferencia: {
        consumerUnitId: unit.id,
        anoReferencia: parsed.bill.anoReferencia,
        mesReferencia: parsed.bill.mesReferencia,
      },
    },
    update: { ...parsed.bill, syncedAt: new Date() },
    create: {
      consumerUnitId: unit.id,
      ...parsed.bill,
      syncedAt: new Date(),
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      valorTotal: true,
      consumoPontaKwh: true,
      consumoForaPontaKwh: true,
      saldoPontaKwh: true,
      saldoForaPontaKwh: true,
      tusdGeracaoKw: true,
      tusdGeracaoValor: true,
      demandaUltrapassagemValor: true,
      reativoExcedentePontaKvar: true,
      leiturasMedidorJson: true,
    },
  });

  console.log("\n=== Bill persistida ===");
  console.log(`id: ${bill.id}`);
  console.log(`mes/ano: ${bill.mesReferencia}/${bill.anoReferencia}, valor: R$ ${bill.valorTotal}`);
  console.log(`Consumo P/FP: ${bill.consumoPontaKwh} / ${bill.consumoForaPontaKwh} kWh`);
  console.log(`Saldo P/FP: ${bill.saldoPontaKwh} / ${bill.saldoForaPontaKwh} kWh`);
  console.log(`TUSD-G: ${bill.tusdGeracaoKw} kW = R$ ${bill.tusdGeracaoValor}`);
  console.log(`Ultrapassagem: R$ ${bill.demandaUltrapassagemValor}`);
  console.log(`Reativo Ponta: ${bill.reativoExcedentePontaKvar} kVAr`);
  console.log(`Leituras (8 grandezas): ${bill.leiturasMedidorJson ? "JSON salvo (" + (bill.leiturasMedidorJson.length) + " chars)" : "null"}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
