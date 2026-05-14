import { prisma } from "../src/lib/prisma";

const PLANT_ID = "c92bd286-6c47-4609-9edb-9443bc30cb77";

async function main() {
  const payables = await prisma.investorPayable.findMany({
    where: { plantId: PLANT_ID },
    select: {
      kwhCompensadoBase: true,
      valorLiquido: true,
      status: true,
      consumerUnit: { select: { codigoUc: true, nome: true } },
      originatedByPlantBill: {
        select: { anoReferencia: true, mesReferencia: true },
      },
    },
  });

  const byCompetencia = new Map<string, {
    ano: number;
    mes: number;
    ucs: Array<{ codigoUc: string; nome: string; kwh: number; valor: number; status: string }>;
    totalKwh: number;
    totalValor: number;
  }>();

  for (const p of payables) {
    if (!p.originatedByPlantBill) continue;
    const k = `${p.originatedByPlantBill.anoReferencia}-${String(p.originatedByPlantBill.mesReferencia).padStart(2,"0")}`;
    let acc = byCompetencia.get(k);
    if (!acc) {
      acc = {
        ano: p.originatedByPlantBill.anoReferencia,
        mes: p.originatedByPlantBill.mesReferencia,
        ucs: [],
        totalKwh: 0,
        totalValor: 0,
      };
      byCompetencia.set(k, acc);
    }
    acc.ucs.push({
      codigoUc: p.consumerUnit.codigoUc,
      nome: p.consumerUnit.nome,
      kwh: p.kwhCompensadoBase,
      valor: p.valorLiquido,
      status: p.status,
    });
    acc.totalKwh += p.kwhCompensadoBase;
    acc.totalValor += p.valorLiquido;
  }

  // Verifica se PlantBilling existe pra cada competência
  const plantBillings = await prisma.plantBilling.findMany({
    where: { plantId: PLANT_ID },
    select: { ano: true, mes: true, status: true },
  });
  const pbExists = new Set(plantBillings.map((b) => `${b.ano}-${String(b.mes).padStart(2,"0")}`));

  const meses = Array.from(byCompetencia.values()).sort((a, b) =>
    a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes,
  );

  console.log(`Meses de geração com payables prontos pra relatório (${meses.length}):\n`);
  for (const m of meses) {
    const k = `${m.ano}-${String(m.mes).padStart(2,"0")}`;
    const tag = pbExists.has(k) ? "✓ PlantBilling aberto" : "○ PlantBilling será criado ao abrir";
    console.log(`${k}  |  ${m.ucs.length} UC(s)  |  ${m.totalKwh.toFixed(0)} kWh  |  R$${m.totalValor.toFixed(2).padStart(10)}  |  ${tag}`);
    for (const u of m.ucs.sort((a,b) => a.codigoUc.localeCompare(b.codigoUc))) {
      console.log(`         └─ ${u.codigoUc} ${u.nome.padEnd(28)} ${u.kwh.toFixed(0).padStart(6)} kWh  R$${u.valor.toFixed(2).padStart(10)}  [${u.status}]`);
    }
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
