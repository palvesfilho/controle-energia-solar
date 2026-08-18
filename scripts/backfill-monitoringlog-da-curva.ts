/**
 * Fecha manualmente os `MonitoringLog` pendentes a partir da curva intradiária.
 *
 * A lógica vive em `src/lib/intraday-backfill-logs.ts` — e é a MESMA que
 * `podarAmostras` executa antes de apagar. Este script é só a porta de linha de
 * comando, para rodar sob demanda ou conferir o estado sem podar nada.
 *
 *   npx tsx scripts/backfill-monitoringlog-da-curva.ts            (simula)
 *   npx tsx scripts/backfill-monitoringlog-da-curva.ts --aplicar
 */
import { prisma } from "../src/lib/prisma";
import { fecharDiasPendentes } from "../src/lib/intraday-backfill-logs";

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: SIMULAÇÃO (use --aplicar para gravar)\n");
  const r = await fecharDiasPendentes({ aplicar: APLICAR });
  console.log(`dias verificados ............ ${r.diasVerificados}`);
  console.log(`pares (usina,dia) sem log ... ${r.paresSemLog}`);
  console.log(`${APLICAR ? "gravados" : "gravaria"} .............. ${r.logsGravados}`);
  console.log(`sem geração medida (0 kWh) .. ${r.paresSemGeracao}  <- ficam sem log de propósito`);
  console.log(`duração ..................... ${(r.duracaoMs / 1000).toFixed(1)}s`);
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error("FALHA:", e); await prisma.$disconnect(); process.exit(1); });
