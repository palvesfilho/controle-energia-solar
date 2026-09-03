/**
 * Devolve ao status certo as usinas marcadas SEM_DADOS que TÊM geração medida
 * no MonitoringLog.
 *
 * É a limpeza do estrago descrito em `project_import_plantas_rebaixa_status`: a
 * importação de plantas derivava status da ausência de um campo opcional e
 * gravava "não sei" por cima de "sei que está bem". A causa foi corrigida nas
 * rotas de import (03/09/2026); isto conserta o dado que ficou.
 *
 * Só MELHORA o rótulo — nunca rebaixa ninguém, e só age sobre quem está em
 * SEM_DADOS com log de geração real. Critério igual ao do WEG: gerou ontem =
 * ONLINE, até 3 dias = ALERTA, além disso = OFFLINE.
 *
 *   npx tsx scripts/corrige-status-sem-dados-com-geracao.ts --dry-run
 *   npx tsx scripts/corrige-status-sem-dados-com-geracao.ts --somente-melhora
 *   npx tsx scripts/corrige-status-sem-dados-com-geracao.ts
 *
 * 🚨 `--somente-melhora` existe por causa do ALERTA. `sync-alerts.ts:128`
 * exclui `SEM_DADOS` da detecção de mudez, então usina parada há meses está
 * hoje CALADA por causa do rótulo errado. Promovê-la a OFFLINE é a verdade —
 * e abre um alerta para cada uma, de uma vez. Com a flag, só sobem as que vão
 * para ONLINE/ALERTA (usina que está gerando e aparecia como "sem dados");
 * as OFFLINE ficam para uma decisão consciente de quem opera.
 *
 * ⚠️ `DATABASE_URL` do `.env` aponta para PRODUÇÃO.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const somenteMelhora = process.argv.includes("--somente-melhora");

  const semDados = await prisma.brasilSolarClient.findMany({
    where: { active: true, statusMonitoramento: "SEM_DADOS" },
    select: { id: true, nome: true, plataformaMonitoramento: true, ultimaLeitura: true },
  });

  const ultimos = await prisma.monitoringLog.groupBy({
    by: ["clientId"],
    where: { clientId: { in: semDados.map((c) => c.id) }, geracaoDiaria: { gt: 0 } },
    _max: { data: true },
  });
  const ultimoPorCliente = new Map(ultimos.map((u) => [u.clientId, u._max.data!]));

  const hoje = new Date();
  const hojeMeioDia = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0);

  const alvos = semDados
    .filter((c) => ultimoPorCliente.has(c.id))
    .map((c) => {
      const ultimo = ultimoPorCliente.get(c.id)!;
      const diasParado = Math.round((hojeMeioDia - ultimo.getTime()) / 86_400_000);
      const status = diasParado <= 1 ? "ONLINE" : diasParado <= 3 ? "ALERTA" : "OFFLINE";
      return { ...c, ultimo, diasParado, status };
    });

  console.log(`Em SEM_DADOS e ativas: ${semDados.length}`);
  console.log(`Delas, COM geração medida no histórico: ${alvos.length}${dryRun ? " (ENSAIO, não grava)" : ""}\n`);

  const porDestino = new Map<string, number>();
  alvos.forEach((a) => porDestino.set(a.status, (porDestino.get(a.status) ?? 0) + 1));
  [...porDestino.entries()].forEach(([s, n]) => console.log(`  SEM_DADOS -> ${s}: ${n}`));

  console.log("\nDetalhe:");
  alvos
    .sort((a, b) => a.diasParado - b.diasParado)
    .forEach((a) =>
      console.log(
        `  ${String(a.plataformaMonitoramento).padEnd(10)} ${a.status.padEnd(8)} último dia com geração=${a.ultimo.toISOString().slice(0, 10)} (${a.diasParado}d)  ${a.nome}`,
      ),
    );

  if (dryRun || alvos.length === 0) return;

  const aplicar = somenteMelhora ? alvos.filter((a) => a.status !== "OFFLINE") : alvos;
  if (somenteMelhora) {
    console.log(
      `\n--somente-melhora: aplicando ${aplicar.length} (ONLINE/ALERTA) e deixando ` +
        `${alvos.length - aplicar.length} em SEM_DADOS para nao abrir alerta em massa.`,
    );
  }

  let mudados = 0;
  for (const a of aplicar) {
    await prisma.brasilSolarClient.update({
      where: { id: a.id },
      data: {
        statusMonitoramento: a.status,
        // Carimbo só AVANÇA, e sempre para o último dia MEDIDO — nunca para
        // "agora", que cegaria o alerta de mudez por horas solares.
        ...(!a.ultimaLeitura || a.ultimo > a.ultimaLeitura ? { ultimaLeitura: a.ultimo } : {}),
      },
    });
    mudados++;
  }
  console.log(`\n${mudados} usina(s) corrigida(s).`);
}

main()
  .catch((e) => {
    console.error("ERRO:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
