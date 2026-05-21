// Normaliza datas das obras (dataInicio/FimPrevista, dataInicio/FimReal)
// para UTC noon do mesmo dia UTC, eliminando o bug "-1 dia" causado por
// dates armazenadas em UTC midnight (que viram dia anterior em BRT).
//
// Uso:
//   npx tsx scripts/backfill-obra-dates-utc-noon.ts        (dry run)
//   npx tsx scripts/backfill-obra-dates-utc-noon.ts --apply (aplica)

import { prisma } from "../src/lib/prisma";

function toUtcNoon(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(12, 0, 0, 0);
  return x;
}

function isUtcNoon(d: Date | null): boolean {
  if (!d) return true;
  return d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const obras = await prisma.obra.findMany({
    select: {
      id: true,
      nome: true,
      dataInicioPrevista: true,
      dataFimPrevista: true,
      dataInicioReal: true,
      dataFimReal: true,
    },
  });

  let toUpdate = 0;
  for (const o of obras) {
    const ini = o.dataInicioPrevista;
    const fim = o.dataFimPrevista;
    const iniReal = o.dataInicioReal;
    const fimReal = o.dataFimReal;
    if (isUtcNoon(ini) && isUtcNoon(fim) && isUtcNoon(iniReal) && isUtcNoon(fimReal)) {
      continue;
    }
    toUpdate++;
    const novoIni = ini ? toUtcNoon(ini) : null;
    const novoFim = fim ? toUtcNoon(fim) : null;
    const novoIniReal = iniReal ? toUtcNoon(iniReal) : null;
    const novoFimReal = fimReal ? toUtcNoon(fimReal) : null;
    console.log(`- ${o.nome} (${o.id})`);
    if (ini) console.log(`    ini: ${ini.toISOString()} -> ${novoIni!.toISOString()}`);
    if (fim) console.log(`    fim: ${fim.toISOString()} -> ${novoFim!.toISOString()}`);
    if (iniReal) console.log(`    iniReal: ${iniReal.toISOString()} -> ${novoIniReal!.toISOString()}`);
    if (fimReal) console.log(`    fimReal: ${fimReal.toISOString()} -> ${novoFimReal!.toISOString()}`);
    if (apply) {
      await prisma.obra.update({
        where: { id: o.id },
        data: {
          dataInicioPrevista: novoIni,
          dataFimPrevista: novoFim,
          dataInicioReal: novoIniReal,
          dataFimReal: novoFimReal,
        },
      });
    }
  }

  console.log(`\n${apply ? "APLICADO" : "DRY RUN"} — ${toUpdate} obra(s) ${apply ? "atualizada(s)" : "seriam atualizadas"} de ${obras.length} total.`);
  if (!apply && toUpdate > 0) console.log("Rode com --apply pra persistir.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
