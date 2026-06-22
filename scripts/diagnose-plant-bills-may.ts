import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const ANO = 2026;
const MES = 5;

async function main() {
  // Usinas de investidor ativas
  const plants = await prisma.plant.findMany({
    where: { usinaDeInvestidor: true, active: true },
    select: {
      id: true,
      name: true,
      numeroUsina: true,
      unidadeConsumidora: true,
      distribuidora: true,
    },
    orderBy: { name: "asc" },
  });
  console.log(`Usinas de investidor ativas: ${plants.length}\n`);

  let comBill = 0;
  let comPdf = 0;
  let comCredencial = 0;
  let credenciaisErro = 0;
  let semCredencial = 0;

  const semBillDetalhes: { name: string; uc: string | null; credStatus: string; ultimaSync: string; erro: string | null }[] = [];

  for (const p of plants) {
    const bill = await prisma.consumerBill.findFirst({
      where: {
        plantId: p.id,
        consumerUnitId: null,
        anoReferencia: ANO,
        mesReferencia: MES,
      },
      select: { id: true, pdfUrl: true, syncedAt: true },
    });

    const cred = await prisma.cpflCredential.findUnique({
      where: { plantId: p.id },
      select: { active: true, statusSync: true, ultimaSync: true, erroSync: true },
    });

    if (bill) {
      comBill++;
      if (bill.pdfUrl) comPdf++;
    }
    if (cred) {
      comCredencial++;
      if (cred.statusSync === "ERROR") credenciaisErro++;
    } else {
      semCredencial++;
    }

    if (!bill) {
      semBillDetalhes.push({
        name: p.name,
        uc: p.unidadeConsumidora ?? p.numeroUsina,
        credStatus: cred ? `${cred.statusSync}${cred.active ? "" : " (INATIVA)"}` : "SEM CREDENCIAL",
        ultimaSync: cred?.ultimaSync ? cred.ultimaSync.toISOString().slice(0, 10) : "—",
        erro: cred?.erroSync ?? null,
      });
    }
  }

  console.log(`Resumo Maio/${ANO}:`);
  console.log(`  com bill no banco:      ${comBill}/${plants.length}`);
  console.log(`  com PDF baixado:        ${comPdf}/${plants.length}`);
  console.log(`  com credencial CPFL:    ${comCredencial}/${plants.length}`);
  console.log(`  credenciais em ERRO:    ${credenciaisErro}`);
  console.log(`  SEM credencial:         ${semCredencial}\n`);

  console.log(`Usinas SEM fatura de Mai/${ANO} (${semBillDetalhes.length}):\n`);
  for (const d of semBillDetalhes) {
    console.log(`  ${d.name} (UC=${d.uc ?? "?"})`);
    console.log(`    credencial: ${d.credStatus}  última sync: ${d.ultimaSync}`);
    if (d.erro) console.log(`    erro: ${d.erro.slice(0, 150)}`);
  }
}

main().finally(() => prisma.$disconnect());
