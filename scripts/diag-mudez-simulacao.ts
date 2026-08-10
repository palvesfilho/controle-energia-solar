/**
 * Simula, SEM GRAVAR NADA, quantas usinas o alerta de mudez acusaria agora.
 *
 * Existe porque a primeira execução de um detector novo em cima de uma base
 * antiga costuma despejar centenas de alertas de uma vez. Alerta em massa no
 * dia 1 afoga o sinal e ensina o operador a ignorar a tela — o oposto do que
 * um serviço de suporte precisa.
 *
 * Uso: npx tsx scripts/diag-mudez-simulacao.ts [--limiar=8]
 */
import { prisma } from "../src/lib/prisma";
import { horasSolaresEntre } from "../src/lib/janela-solar";

const brt = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(d);

function arg(nome: string): string | undefined {
  const flag = `--${nome}=`;
  const a = process.argv.find((x) => x.startsWith(flag));
  return a ? a.slice(flag.length) : undefined;
}

async function main() {
  const limiar = Number(arg("limiar") ?? 8);
  const agora = new Date();

  const usinas = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      plataformaMonitoramento: { in: ["FRONIUS", "HUAWEI", "SOLAREDGE", "SUNGROW", "GROWATT"] },
      statusMonitoramento: { not: "SEM_DADOS" },
    },
    select: {
      id: true,
      nome: true,
      plataformaMonitoramento: true,
      ultimaLeitura: true,
      statusMonitoramento: true,
    },
  });

  const nunca = usinas.filter((u) => u.ultimaLeitura == null);
  const comLeitura = usinas.filter((u) => u.ultimaLeitura != null);
  const mudas = comLeitura.filter(
    (u) => horasSolaresEntre(u.ultimaLeitura!, agora) >= limiar,
  );

  console.log(`Agora: ${brt(agora)} · limiar ${limiar}h de sol\n`);
  console.log(`Usinas avaliadas ................ ${usinas.length}`);
  console.log(`Nunca leram nada ................ ${nunca.length}`);
  console.log(`Passariam do limiar ............. ${mudas.length}`);
  console.log(`Total que viraria alerta ........ ${nunca.length + mudas.length}`);

  const porPlataforma = new Map<string, number>();
  for (const u of [...nunca, ...mudas]) {
    const p = u.plataformaMonitoramento ?? "?";
    porPlataforma.set(p, (porPlataforma.get(p) ?? 0) + 1);
  }
  console.log("\nPor plataforma:");
  for (const [p, n] of [...porPlataforma].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p.padEnd(10)} ${n}`);
  }

  // Distribuição do atraso — mostra se é uma frota que parou agora ou uma
  // base velha que nunca teve leitura atualizada.
  const faixas = [
    { rotulo: "8h a 1 dia solar (15h)", min: 8, max: 15 },
    { rotulo: "1 a 3 dias solares", min: 15, max: 45 },
    { rotulo: "3 a 10 dias solares", min: 45, max: 150 },
    { rotulo: "mais de 10 dias solares", min: 150, max: Infinity },
  ];
  console.log("\nHá quanto tempo estão mudas:");
  for (const f of faixas) {
    const n = mudas.filter((u) => {
      const h = horasSolaresEntre(u.ultimaLeitura!, agora);
      return h >= f.min && h < f.max;
    }).length;
    console.log(`  ${f.rotulo.padEnd(26)} ${n}`);
  }

  console.log("\nAmostra das 10 mais recentes (as que interessam ao suporte):");
  const recentes = mudas
    .map((u) => ({ u, h: horasSolaresEntre(u.ultimaLeitura!, agora) }))
    .sort((a, b) => a.h - b.h)
    .slice(0, 10);
  for (const { u, h } of recentes) {
    console.log(
      `  ${u.nome.slice(0, 38).padEnd(40)} ${h.toFixed(1).padStart(6)}h de sol · última ${brt(u.ultimaLeitura!)}`,
    );
  }

  const abertos = await prisma.monitoringAlert.count({
    where: { tipo: "OFFLINE", status: { in: ["ABERTO", "EM_ANDAMENTO"] } },
  });
  console.log(`\nAlertas OFFLINE já abertos (não seriam duplicados): ${abertos}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
