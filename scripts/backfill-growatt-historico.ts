/**
 * BACKFILL do histórico Growatt: puxa a geração DIÁRIA de /v1/plant/energy dos
 * últimos N meses das 78 usinas e grava em MonitoringLog.
 *
 * Por que existe: a única fonte Growatt até hoje era o coletor intradiário
 * (/v1/plant/power), que exige datalogger VIVO. O plant/energy tem o diário
 * consolidado mesmo com o datalogger parado — por isso 10 usinas dadas como
 * "mudas" na verdade têm histórico.
 *
 * ⚠️ GRAVA EM PRODUÇÃO (DATABASE_URL). Rodar com "go" explícito do Paulo.
 *
 * Regras:
 *  - Dia que volta 0,0 kWh NÃO é gravado. A Growatt devolve 0 tanto para "não
 *    gerou" quanto para "o datalogger não mandou nada" — gravar esse 0 faz o
 *    relatório AFIRMAR que a usina não gerou. Ver `src/lib/dia-sem-dado.ts`.
 *    (A regra antiga pulava só a usina com o período INTEIRO zerado, e por isso
 *    escreveu 79 zeros na 620604, que parou de comunicar no meio do período.)
 *  - `ultimaLeitura` e `statusMonitoramento` NÃO são tocados: são de quem lê ao
 *    vivo, e carimbá-los aqui cegaria o alerta de mudez por horas solares.
 *  - Dado medido vence lançamento MANUAL (upsert grava origem="API").
 *
 * npx tsx --env-file=.env scripts/backfill-growatt-historico.ts [--meses=12] [--dry]
 */
import { prisma } from "../src/lib/prisma";
import { getDailyGeneration } from "../src/lib/growatt";
import { esperadaDoDiaDaUsina, performanceRatioMesAtual } from "../src/lib/geracao-esperada";
import { ehDiaSemDado } from "../src/lib/dia-sem-dado";

const MESES = Number(process.argv.find((a) => a.startsWith("--meses="))?.split("=")[1] ?? 12);
const DRY = process.argv.includes("--dry");
const CONCORRENCIA = 5; // plantas diferentes em paralelo: medido OK (o 10012 é por requisição idêntica)

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`);
}

interface Alvo {
  id: string;
  nome: string;
  monitoramentoPlantId: string | null;
  geracaoMediaEsperada: number | null;
  geracaoAnualEsperada: number | null;
}

interface Saida {
  nome: string;
  plantId: string;
  dias: number;
  kwh: number;
  gravados: number;
  limitados: string[];
  erros: string[];
  pulada: boolean;
  /** Dias que a Growatt devolveu zerados (datalogger mudo) e NÃO foram gravados. */
  diasSemDado: number;
}

async function processar(c: Alvo): Promise<Saida> {
  const plantId = c.monitoramentoPlantId!;
  const now = new Date();
  const out: Saida = {
    nome: c.nome,
    plantId,
    dias: 0,
    kwh: 0,
    gravados: 0,
    limitados: [],
    erros: [],
    pulada: false,
    diasSemDado: 0,
  };

  // 1) LÊ tudo antes de gravar — precisa do total do período para decidir se a
  //    usina é muda (e então não escrever zeros).
  const colhido: { data: Date; kwh: number }[] = [];

  for (let i = 0; i < MESES; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const rotulo = `${String(month).padStart(2, "0")}/${year}`;

    let tentativas = 0;
    for (;;) {
      try {
        const daily = await getDailyGeneration(plantId, year, month);
        for (const dia of daily) {
          // 0,0 kWh = "não recebi dado", não "medi zero". Não entra no banco.
          if (ehDiaSemDado(dia.energyKwh)) {
            out.diasSemDado++;
            continue;
          }
          // Data-calendário: meio-dia UTC, senão o fuso empurra o dia.
          colhido.push({
            data: new Date(Date.UTC(year, month - 1, dia.day, 12, 0, 0)),
            kwh: dia.energyKwh,
          });
        }
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 10012 = requisição idêntica cedo demais. Uma folga resolve; não é
        // "mês sem geração" e não pode virar zero no banco.
        if (msg.includes("10012") && tentativas < 3) {
          tentativas++;
          await new Promise((r) => setTimeout(r, 3000 * tentativas));
          continue;
        }
        if (msg.includes("10012")) out.limitados.push(rotulo);
        else out.erros.push(`${rotulo}: ${msg.slice(0, 60)}`);
        break;
      }
    }
  }

  out.dias = colhido.length;
  out.kwh = colhido.reduce((s, x) => s + x.kwh, 0);

  // 2) Usina sem NENHUMA geração no período: não escreve zeros.
  if (out.kwh <= 0) {
    out.pulada = true;
    return out;
  }

  if (DRY) return out;

  for (const linha of colhido) {
    await prisma.monitoringLog.upsert({
      where: { clientId_data: { clientId: c.id, data: linha.data } },
      update: { origem: "API", geracaoDiaria: linha.kwh },
      create: {
        clientId: c.id,
        data: linha.data,
        geracaoDiaria: linha.kwh,
        geracaoEsperada: esperadaDoDiaDaUsina(c, linha.data),
      },
    });
    out.gravados++;
  }

  // 3) KPIs desnormalizados que a lista mostra. NÃO toca ultimaLeitura nem
  //    statusMonitoramento — ver cabeçalho.
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const trintaDias = new Date();
  trintaDias.setDate(trintaDias.getDate() - 30);

  const [mes, ultimos] = await Promise.all([
    prisma.monitoringLog.aggregate({
      where: { clientId: c.id, data: { gte: startOfMonth } },
      _sum: { geracaoDiaria: true },
    }),
    prisma.monitoringLog.findMany({
      where: { clientId: c.id, data: { gte: trintaDias } },
      orderBy: { data: "desc" },
      take: 1,
      select: { geracaoDiaria: true },
    }),
  ]);

  const geracaoMes = mes._sum.geracaoDiaria ?? 0;
  await prisma.brasilSolarClient.update({
    where: { id: c.id },
    data: {
      geracaoMesAtual: geracaoMes,
      ultimaGeracao: ultimos[0]?.geracaoDiaria ?? null,
      performanceRatio: performanceRatioMesAtual(c, geracaoMes, now),
    },
  });

  return out;
}

async function main() {
  const clients = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      plataformaMonitoramento: "GROWATT",
      monitoramentoPlantId: { not: null },
    },
    select: {
      id: true,
      nome: true,
      monitoramentoPlantId: true,
      geracaoMediaEsperada: true,
      geracaoAnualEsperada: true,
    },
    orderBy: { nome: "asc" },
  });

  log(`${clients.length} usinas Growatt · ${MESES} meses${DRY ? " · ENSAIO SECO (não grava)" : " · GRAVANDO EM PRODUÇÃO"}`);
  const t0 = Date.now();
  const saidas: Saida[] = [];

  for (let i = 0; i < clients.length; i += CONCORRENCIA) {
    const bloco = clients.slice(i, i + CONCORRENCIA);
    const res = await Promise.all(bloco.map((c) => processar(c as Alvo)));
    saidas.push(...res);
    for (const r of res) {
      const marca = r.pulada ? "MUDA " : "OK   ";
      const extra = [
        r.limitados.length ? `LIMITE em ${r.limitados.length} mês(es)` : "",
        r.erros.length ? `ERRO em ${r.erros.length} mês(es)` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      log(
        `  ${saidas.length}/${clients.length} ${marca}${r.plantId.padEnd(8)} ` +
          `${r.nome.slice(0, 32).padEnd(32)} ${r.gravados.toString().padStart(4)} dia(s) ` +
          `${r.kwh.toFixed(0).padStart(7)} kWh ${extra}`,
      );
    }
  }

  const gravados = saidas.reduce((s, r) => s + r.gravados, 0);
  const kwh = saidas.reduce((s, r) => s + r.kwh, 0);
  const comDado = saidas.filter((r) => !r.pulada).length;
  const mudas = saidas.filter((r) => r.pulada);
  const comLimite = saidas.filter((r) => r.limitados.length);
  const comErro = saidas.filter((r) => r.erros.length);

  console.log("");
  log(`FIM em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  log(`  ${comDado} usinas com geração · ${gravados} linha(s) gravada(s) · ${kwh.toFixed(1)} kWh`);
  log(`  ${mudas.length} usinas sem geração no período (puladas, nenhum zero escrito)`);
  const semDado = saidas.filter((r) => r.diasSemDado > 0);
  if (semDado.length) {
    log(
      `  ⚠️ ${semDado.length} usina(s) com dia(s) zerados NÃO gravados ` +
        `(datalogger mudo — a energia pode estar indo pra rede assim mesmo):`,
    );
    for (const r of semDado.sort((a, b) => b.diasSemDado - a.diasSemDado))
      log(`       ${r.plantId.padEnd(8)} ${r.nome.slice(0, 32).padEnd(32)} ${r.diasSemDado} dia(s)`);
  }
  if (comLimite.length) {
    log(`  🔴 ${comLimite.length} com mês NÃO lido por limite 10012 (rodar de novo):`);
    for (const r of comLimite) log(`       ${r.plantId} ${r.nome} -> ${r.limitados.join(", ")}`);
  }
  if (comErro.length) {
    log(`  🔴 ${comErro.length} com erro:`);
    for (const r of comErro) log(`       ${r.plantId} ${r.nome} -> ${r.erros.join(" | ")}`);
  }
}

main().finally(() => prisma.$disconnect());
