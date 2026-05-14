/**
 * Cria um novo RateioVersion retroativo (cópia exata do VIGENTE atual)
 * e marca o atual como SUBSTITUIDO. Replica o fluxo manual "aceitar"
 * porém com vigência retroativa pra cobrir faturas antigas.
 *
 * Uso:
 *   npx tsx scripts/criar-rateio-retroativo.ts --plant=<numeroUsina> --vigencia=YYYY-MM-DD
 *   npx tsx scripts/criar-rateio-retroativo.ts --plant=4003476471 --vigencia=2025-01-01
 *
 * Idempotente: se já existe um rateio VIGENTE com data <= vigencia, avisa
 * e não faz nada.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (prefix: string) =>
    args.find((a) => a.startsWith(prefix))?.slice(prefix.length) ?? null;
  return {
    plantNumero: get("--plant="),
    vigenciaStr: get("--vigencia="),
    apply: args.includes("--apply"),
  };
}

async function main() {
  const { plantNumero, vigenciaStr, apply } = parseArgs();

  if (!plantNumero || !vigenciaStr) {
    console.error(
      "Uso: npx tsx scripts/criar-rateio-retroativo.ts --plant=<num> --vigencia=YYYY-MM-DD [--apply]",
    );
    process.exit(1);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(vigenciaStr);
  if (!m) {
    console.error("Data de vigência inválida. Use YYYY-MM-DD.");
    process.exit(1);
  }
  const novaVigencia = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  const plant = await prisma.plant.findFirst({
    where: { numeroUsina: plantNumero },
    select: { id: true, name: true, numeroUsina: true },
  });
  if (!plant) {
    console.error(`Usina ${plantNumero} não encontrada.`);
    process.exit(1);
  }

  const vigente = await prisma.rateioVersion.findFirst({
    where: { plantId: plant.id, status: "VIGENTE" },
    select: {
      id: true,
      vigenteAPartirDe: true,
      observacao: true,
      criadoPorUserId: true,
      items: {
        select: { consumerUnitId: true, percentual: true },
      },
    },
  });
  if (!vigente) {
    console.error(
      `Usina ${plantNumero} não tem rateio VIGENTE. Use o UI pra criar um primeiro.`,
    );
    process.exit(1);
  }

  if (vigente.vigenteAPartirDe <= novaVigencia) {
    console.log(
      `Rateio VIGENTE já cobre essa data (vigente desde ${vigente.vigenteAPartirDe.toISOString().slice(0, 10)}). Nada a fazer.`,
    );
    await prisma.$disconnect();
    return;
  }

  console.log(`\n=== ${plant.numeroUsina} — ${plant.name} ===`);
  console.log(`Rateio VIGENTE atual:`);
  console.log(`  vigente desde ${vigente.vigenteAPartirDe.toISOString().slice(0, 10)}`);
  console.log(`  items: ${vigente.items.length}`);
  for (const it of vigente.items) {
    console.log(`    UC ${it.consumerUnitId}: ${it.percentual}%`);
  }
  console.log(`\nNova vigência retroativa: ${novaVigencia.toISOString().slice(0, 10)}`);

  if (!apply) {
    console.log(`\n[DRY-RUN] Rode com --apply pra executar.`);
    await prisma.$disconnect();
    return;
  }

  const now = new Date();

  const [, novo] = await prisma.$transaction([
    prisma.rateioVersion.update({
      where: { id: vigente.id },
      data: { status: "SUBSTITUIDO", substituidoEm: now },
    }),
    prisma.rateioVersion.create({
      data: {
        plantId: plant.id,
        status: "VIGENTE",
        vigenteAPartirDe: novaVigencia,
        aceitoEm: now,
        observacao:
          "Rateio retroativo criado via script para cobrir faturas anteriores. Cópia dos items do rateio cadastrado em " +
          vigente.vigenteAPartirDe.toISOString().slice(0, 10) +
          (vigente.observacao ? ` ("${vigente.observacao}")` : "") +
          ".",
        criadoPorUserId: vigente.criadoPorUserId,
        items: {
          create: vigente.items.map((it) => ({
            consumerUnitId: it.consumerUnitId,
            percentual: it.percentual,
          })),
        },
      },
      select: { id: true },
    }),
  ]);

  console.log(`\n✓ Rateio retroativo criado (id=${novo.id}).`);
  console.log(`  Anterior (id=${vigente.id}) marcado como SUBSTITUIDO.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
