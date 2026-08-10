/**
 * Coleta intradiária de 15 em 15 minutos — entrada do cron do Railway.
 *
 * Varre a frota ativa nas 4 plataformas, normaliza tudo em slots de 15 min
 * (`InverterSample`) e atualiza a geração do dia (`MonitoringLog`). Alimenta o
 * gráfico "Geração diária" do portal do cliente e das telas internas.
 *
 * Idempotente: rodar de novo na mesma janela reescreve os mesmos slots.
 *
 * ┌─ MODO CRON ────────────────────────────────────────────────────────────┐
 * │ `--cron` faz ESTE script sozinho dar conta das três rotinas, em vez de │
 * │ exigir três serviços no Railway:                                       │
 * │   • toda rodada  → coleta a janela recente + fecha a geração do dia    │
 * │   • última rodada do dia (23:45 UTC) → varre o dia solar inteiro, pra  │
 * │     que o total não fique capado se alguma rodada falhou               │
 * │   • domingo, na última rodada → poda as amostras antigas               │
 * │ Um serviço de cron só, porque serviço que precisa ser criado à mão é   │
 * │ serviço que não roda: o `backfill-monitoring-gaps` nunca rodou por     │
 * │ isso.                                                                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Uso:
 *   npx tsx scripts/collect-intraday-15min.ts
 *   npx tsx scripts/collect-intraday-15min.ts --plataformas=SUNGROW,FRONIUS
 *   npx tsx scripts/collect-intraday-15min.ts --minutos=180     # recupera atraso
 *   npx tsx scripts/collect-intraday-15min.ts --limite=5        # amostra, pra teste
 *   npx tsx scripts/collect-intraday-15min.ts --forcar          # ignora janela solar
 *   npx tsx scripts/collect-intraday-15min.ts --sem-geracao     # só amostras
 *   npx tsx scripts/collect-intraday-15min.ts --fechamento      # varre o dia inteiro
 *   npx tsx scripts/collect-intraday-15min.ts --fechamento --dia=2026-08-05
 *
 * O modo `--fechamento` existe porque uma rodada normal só enxerga os últimos
 * 45 min: se a última rodada do dia falhar, o total fica capado. É exatamente
 * o que acontecia antes — sync rodava às 15h54 e congelava 20,76 kWh num dia
 * que fechou em 123,07. O fechamento varre 5h–20h BRT e recalcula o total.
 */
import { prisma } from "../src/lib/prisma";
import {
  coletarIntradia,
  PLATAFORMAS_INTRADIA,
  type PlataformaIntradia,
} from "../src/lib/intraday-collector";
import { atualizarGeracaoDoDia } from "../src/lib/intraday-generation";
import { podarAmostras } from "../src/lib/intraday-prune";
import { runAlertSync } from "../src/lib/sync-alerts";

function arg(nome: string): string | undefined {
  const flag = `--${nome}=`;
  const a = process.argv.find((x) => x.startsWith(flag));
  return a ? a.slice(flag.length) : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

async function main() {
  const plataformas = (arg("plataformas")?.split(",").map((p) => p.trim().toUpperCase()) ??
    PLATAFORMAS_INTRADIA) as PlataformaIntradia[];
  const minutos = Number(arg("minutos") ?? 45);
  const limite = arg("limite") ? Number(arg("limite")) : undefined;

  // `--limite` e `--nome` existem pra sondar em produção sem varrer 1.819 usinas.
  let clientIds: string[] | undefined;
  const nome = arg("nome");

  if (nome) {
    const achadas = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        monitoramentoPlantId: { not: null },
        OR: nome.split(",").map((n) => ({ nome: { contains: n.trim(), mode: "insensitive" as const } })),
      },
      select: { id: true, nome: true },
    });
    clientIds = achadas.map((u) => u.id);
    console.log(`[intraday] filtro por nome: ${achadas.length} usinas — ${achadas.map((u) => u.nome).join(", ")}`);
  } else if (limite) {
    const amostra = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        plataformaMonitoramento: { in: plataformas },
        monitoramentoPlantId: { not: null },
      },
      select: { id: true, plataformaMonitoramento: true },
      orderBy: { nome: "asc" },
    });
    const porPlataforma = new Map<string, string[]>();
    for (const u of amostra) {
      const lista = porPlataforma.get(u.plataformaMonitoramento!) ?? [];
      if (lista.length < limite) lista.push(u.id);
      porPlataforma.set(u.plataformaMonitoramento!, lista);
    }
    clientIds = [...porPlataforma.values()].flat();
    console.log(`[intraday] modo amostra: ${clientIds.length} usinas (${limite} por plataforma)`);
  }

  // No modo cron, a última rodada do dia (23h UTC em diante) é o fechamento.
  // A geração termina por volta das 23h UTC (20h BRT), então nada se perde.
  const modoCron = temFlag("cron");
  const agoraUtc = new Date();
  const ultimaRodadaDoDia = modoCron && agoraUtc.getUTCHours() === 23 && agoraUtc.getUTCMinutes() >= 40;

  // No fechamento a janela é o dia solar inteiro (8h–23h UTC = 5h–20h BRT),
  // ancorada no fim do dia — assim nenhum slot fica de fora do total.
  const fechamento = temFlag("fechamento") || ultimaRodadaDoDia;
  const diaAlvo = arg("dia");
  const agoraFechamento = (() => {
    if (!fechamento) return undefined;
    const base = diaAlvo ? new Date(`${diaAlvo}T00:00:00Z`) : new Date();
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 23, 0, 0));
  })();

  const resumo = await coletarIntradia({
    plataformas,
    clientIds,
    minutos: fechamento ? 15 * 60 : minutos,
    agora: agoraFechamento,
    ignorarJanelaSolar: fechamento || temFlag("forcar"),
  });

  if (resumo.puladoPorJanelaSolar) {
    console.log("[intraday] fora da janela solar (5h–20h BRT) — nada a coletar");
    return;
  }

  const jan = `${resumo.janelaInicio.toISOString().slice(11, 16)}–${resumo.janelaFim.toISOString().slice(11, 16)}Z`;
  console.log(`[intraday] janela ${jan} · ${(resumo.duracaoMs / 1000).toFixed(1)}s · ${resumo.slotsGravados} slots`);

  for (const p of resumo.plataformas) {
    if (p.usinas === 0) continue;
    console.log(
      `  ${p.plataforma.padEnd(9)} ${String(p.usinasComDado).padStart(4)}/${String(p.usinas).padEnd(5)} usinas com dado · ` +
        `${String(p.chamadas).padStart(4)} chamadas · ${String(p.slotsGravados).padStart(5)} slots · ` +
        `${(p.duracaoMs / 1000).toFixed(1)}s`,
    );
    for (const e of p.erros.slice(0, 5)) console.log(`      ✗ ${e}`);
    if (p.erros.length > 5) console.log(`      … +${p.erros.length - 5} erros`);
  }

  if (!temFlag("sem-geracao")) {
    const g = await atualizarGeracaoDoDia({
      clientIds,
      plataformas,
      dia: agoraFechamento,
    });
    console.log(
      `[intraday] geração do dia: ${g.usinasAtualizadas} usinas · ${g.logsGravados} MonitoringLog · ${(g.duracaoMs / 1000).toFixed(1)}s`,
    );
  }

  // Detecção de usina parada, toda rodada. É consulta ao banco e custa quase
  // nada; o que custa cota é buscar o CÓDIGO do erro em cada plataforma, e
  // isso só na virada da hora — código de fabricante não muda a cada 15 min.
  if (modoCron) {
    const comMotivo = agoraUtc.getUTCMinutes() < 15;
    const a = await runAlertSync({ incluirMotivoDoErro: comMotivo });
    console.log(
      `[intraday] alertas: ${a.alertsCreated} criados · ${a.offlineDetected} usina(s) muda(s)` +
        `${comMotivo ? ` · ${a.erroInversorDetected} erro(s) de inversor` : " · motivo não buscado nesta rodada"}`,
    );
  }

  // Domingo, depois do fechamento: poda as amostras fora da janela de retenção.
  if (ultimaRodadaDoDia && agoraUtc.getUTCDay() === 0) {
    const p = await podarAmostras({ aplicar: true });
    console.log(
      `[intraday] poda: corte em ${p.corte.toISOString().slice(0, 10)} · ` +
        `${p.linhasApagadas.toLocaleString("pt-BR")} de ${p.linhasTotal.toLocaleString("pt-BR")} linhas · ` +
        `${(p.duracaoMs / 1000).toFixed(1)}s`,
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[intraday] FALHA:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
