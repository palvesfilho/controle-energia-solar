/**
 * Importa as plantas da conta Growatt OSS para o cadastro, pela MESMA função
 * que a rota `/api/brasil-solar/sync-growatt` usa — nada aqui reimplementa a
 * regra.
 *
 * Serve para rodar a importação sem sessão logada (foi como as 3 plantas
 * atrasadas entraram em 03/09/2026) e para conferir o que ela FARIA antes de
 * gravar.
 *
 *   npx tsx scripts/importar-plantas-growatt.ts --dry-run
 *   npx tsx scripts/importar-plantas-growatt.ts
 *   npx tsx scripts/importar-plantas-growatt.ts --meses=12
 *
 * ⚠️ `DATABASE_URL` do `.env` aponta para PRODUÇÃO. Sem `--dry-run` isto grava
 * em produção.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getPlantList } from "../src/lib/growatt";
import { importarPlantasGrowatt } from "../src/lib/growatt-import";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const mesesArg = args.find((a) => a.startsWith("--meses="));
  const meses = mesesArg ? Math.max(1, Math.min(12, Number(mesesArg.split("=")[1]))) : 2;

  console.log(`Growatt — importação de plantas${dryRun ? " (ENSAIO, não grava)" : ""}, meses=${meses}\n`);

  if (dryRun) {
    // Mesma leitura da importação, sem escrever: só o diff entre API e cadastro.
    const { plants, count } = await getPlantList(1, 97);
    const existentes = await prisma.brasilSolarClient.findMany({
      where: { plataformaMonitoramento: "GROWATT" },
      select: { nome: true, monitoramentoPlantId: true },
    });
    const ids = new Set(existentes.map((c) => String(c.monitoramentoPlantId)));
    const novas = plants.filter((p) => !ids.has(String(p.plantId)));
    const idsApi = new Set(plants.map((p) => String(p.plantId)));
    const ausentes = existentes.filter((c) => c.monitoramentoPlantId && !idsApi.has(c.monitoramentoPlantId));

    console.log(`API: ${count} plantas · cadastro: ${existentes.length}`);
    console.log(`\nSeriam CRIADAS (${novas.length}):`);
    novas.forEach((p) => console.log(`  ${p.plantId}  ${p.capacityKwp} kWp  ${p.city ?? "-"}  ${p.name}`));
    console.log(`\nNo cadastro e fora da API (${ausentes.length}) — reportadas, nunca desativadas:`);
    ausentes.forEach((c) => console.log(`  ${c.monitoramentoPlantId}  ${c.nome}`));
    return;
  }

  const r = await importarPlantasGrowatt(meses);

  console.log(`Plantas na conta: ${r.total}`);
  console.log(`Criadas: ${r.created} · atualizadas: ${r.updated} · erros: ${r.errors}`);
  if (r.novas.length) {
    console.log("\nNovas:");
    r.novas.forEach((n) => console.log(`  + ${n}`));
  }
  if (r.ausentesNaApi.length) {
    console.log("\nNo cadastro e fora da conta Growatt (não desativadas):");
    r.ausentesNaApi.forEach((n) => console.log(`  ? ${n}`));
  }
  if (r.avisos.length) {
    console.log("\nAvisos:");
    r.avisos.forEach((a) => console.log(`  - ${a}`));
  }
}

main()
  .catch((e) => {
    console.error("ERRO:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
