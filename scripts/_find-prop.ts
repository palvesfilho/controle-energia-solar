import { prisma } from "../src/lib/prisma";

async function main() {
  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: "cmomq01bf1bsestgh127sgakj" },
    include: {
      plantas: {
        include: {
          plant: { include: { consumerUnits: true, rateioVersions: { orderBy: { vigenteAPartirDe: "desc" }, take: 3 }, reports: { orderBy: [{ ano: "desc" }, { mes: "desc" }], take: 3 } } },
        },
      },
    },
  });

  if (!prop) { console.log("Proprietário não encontrado"); process.exit(1); }

  console.log(`=== Proprietário: ${prop.nome} (${prop.id}) ===`);
  console.log(`CPF/CNPJ: ${prop.cpfCnpj}`);
  console.log(`Cidade: ${prop.cidade}/${prop.uf}`);
  console.log(`UC própria do proprietário: ${prop.codigoUc} (${prop.concessionaria})`);
  console.log(`Potência instalada: ${prop.potenciaInstalada}`);
  console.log(`Total clientes Brasil Solar vinculados: ${prop.plantas.length}\n`);

  for (const c of prop.plantas) {
    console.log(`--- BSC: ${c.nome} (${c.id}) ---`);
    console.log(`  CPF: ${c.cpfCnpj}`);
    console.log(`  Plataforma: ${c.plataformaMonitoramento ?? "-"} ps_id: ${c.monitoramentoPlantId ?? "-"}`);
    console.log(`  plantId: ${c.plantId ?? "NULL"}`);
    console.log(`  codigoUc do BSC: ${c.codigoUc ?? "-"}`);
    if (c.plant) {
      const p = c.plant;
      console.log(`  Plant vinculada: ${p.name} (${p.id})`);
      console.log(`    UCs (${p.consumerUnits.length}): ${p.consumerUnits.map((u) => u.codigoUc).join(", ")}`);
      console.log(`    Rateios: ${p.rateioVersions.length} versões${p.rateioVersions[0] ? ` (vigente desde ${p.rateioVersions[0].vigenteAPartirDe.toISOString().slice(0,10)})` : ""}`);
      console.log(`    Reports: ${p.reports.length}`);
    } else {
      console.log(`  Plant vinculada: NENHUMA`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
