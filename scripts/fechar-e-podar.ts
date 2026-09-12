/**
 * Manutenção noturna da curva intradiária: fecha os dias pendentes e poda.
 *
 * POR QUE É UM CRON SEPARADO, e não mais um passo do coletor de 15 min:
 *
 * Antes isto rodava no fim da rodada das 20:40, a mesma que faz a coleta de
 * FECHAMENTO — 15 h de janela, com a Fronius sozinha disparando 1.274 chamadas.
 * Quando essa rodada morre no meio (o serviço é `restartPolicyType: NEVER`),
 * tudo que vinha depois simplesmente não acontecia. Foi o que se viu em
 * 15–17/08/26: as amostras chegavam ao banco e o `MonitoringLog` não era
 * gravado para ~181 usinas por dia — sempre as mesmas.
 *
 * Rodando às 2h da manhã, sozinho e sem disputa com a coleta:
 *   - o dado atrasado do dia anterior JÁ CHEGOU (essas usinas entregam com 7,5
 *     a 10 h de atraso, medido em 18/08/26), então o fechamento acha tudo;
 *   - a poda só apaga curva de dia que já tem o kWh salvo — e essa garantia
 *     deixa de depender da rodada mais pesada do dia.
 *
 * Uso:
 *   npx tsx scripts/fechar-e-podar.ts            # simula, não grava nem apaga
 *   npx tsx scripts/fechar-e-podar.ts --apply
 *   npx tsx scripts/fechar-e-podar.ts --apply --dias=14
 *   npx tsx scripts/fechar-e-podar.ts --apply --pares=200   # orçamento maior
 *   npx tsx scripts/fechar-e-podar.ts --apply --sem-recuperar
 *
 * ORDEM, e ela importa: RECUPERAR a curva que faltou → FECHAR o kWh do dia →
 * PODAR. Invertida, a poda apagaria a janela antes de o dia recuperado virar
 * `MonitoringLog`, e o dia sumiria de vez.
 */
import { prisma } from "../src/lib/prisma";
import { podarAmostras } from "../src/lib/intraday-prune";
import { recuperarDiasFaltantes } from "../src/lib/intraday-gapfill";

function arg(nome: string): string | undefined {
  const flag = `--${nome}=`;
  const a = process.argv.find((x) => x.startsWith(flag));
  return a ? a.slice(flag.length) : undefined;
}

/** Hora de Brasília — o Railway roda em UTC e o log é lido por gente. */
function agoraBrt(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function main() {
  const aplicar = process.argv.includes("--apply");
  console.log(`[manutencao] ${agoraBrt()} (Brasília) · modo ${aplicar ? "APLICAR" : "SIMULAÇÃO"}`);

  // 1. Recupera a curva dos dias que faltaram. Antes disto, nada no sistema
  //    voltava a pedir dia passado — só o botão manual da tela da usina.
  if (!process.argv.includes("--sem-recuperar")) {
    const g = await recuperarDiasFaltantes({
      dias: arg("dias") ? Number(arg("dias")) : undefined,
      maxPares: arg("pares") ? Number(arg("pares")) : undefined,
      aplicar,
    });
    console.log(
      `[manutencao] recuperação da curva: ${g.paresFaltando} dia(s)-usina sem curva · ` +
        `${g.paresParciais} parcial(is) · ${g.paresPulados} no teto de tentativas · ` +
        `${g.paresTentados} tentado(s) em ${(g.duracaoMs / 1000).toFixed(1)}s`,
    );
    if (g.aplicado) {
      console.log(
        `[manutencao] recuperados: ${g.paresRecuperados} · sem dado no portal: ${g.paresVazios} · ` +
          `${g.slotsGravados} slots · ${g.chamadas} chamadas`,
      );
    }
    for (const p of g.amostra.slice(0, 8)) {
      console.log(`      ${p.plataforma.padEnd(10)} ${p.dia} ${String(p.slots).padStart(3)} slots · ${p.nome.slice(0, 34)}`);
    }
    // Buraco que não para de crescer é sintoma de coleta, não de portal: a
    // rodada de 15 min não está alcançando essas usinas.
    if (g.paresFaltando > 300) {
      console.log(`[manutencao] ⚠️ ${g.paresFaltando} dias-usina sem curva — investigar a janela por plataforma.`);
    }
  }

  // `podarAmostras` chama `fecharDiasPendentes` internamente, antes de apagar:
  // é essa ordem que garante que o kWh diário está salvo quando a curva se vai.
  const r = await podarAmostras({
    dias: arg("dias") ? Number(arg("dias")) : undefined,
    aplicar,
  });

  const f = r.fechamento;
  if (f) {
    console.log(
      `[manutencao] fechamento: ${f.diasVerificados} dia(s) verificado(s) · ` +
        `${f.paresSemLog} par(es) usina/dia sem log · ` +
        `${f.logsGravados} MonitoringLog ${aplicar ? "gravado(s)" : "a gravar"} · ` +
        `${f.paresSemGeracao} sem geração medida (datalogger mudo)`,
    );
    // Se este número for alto TODO DIA, a coleta das rodadas normais não está
    // alcançando essas usinas — ver o atraso por usina em `janelaDaPlataforma`.
    if (f.logsGravados > 50) {
      console.log(
        `[manutencao] ⚠️ ${f.logsGravados} logs vieram só agora: a coleta do dia ` +
          `não cobriu essas usinas. Investigar a janela por plataforma.`,
      );
    }
  }

  const pct = r.linhasTotal > 0 ? ((r.linhasAlvo / r.linhasTotal) * 100).toFixed(1) : "0";
  console.log(
    `[manutencao] poda: corte em ${r.corte.toISOString().slice(0, 10)} · ` +
      `${r.linhasTotal.toLocaleString("pt-BR")} linhas · ` +
      `${r.linhasAlvo.toLocaleString("pt-BR")} fora da janela (${pct}%) · ` +
      `${r.linhasApagadas.toLocaleString("pt-BR")} apagada(s) · ` +
      `${(r.duracaoMs / 1000).toFixed(1)}s`,
  );
  if (!r.aplicado) console.log("[manutencao] simulação — rode com --apply pra valer");
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error("[manutencao] FALHA:", e); await prisma.$disconnect(); process.exit(1); });
