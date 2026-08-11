/**
 * Saúde da curva intradiária, plataforma por plataforma, em um comando.
 *
 * Existe porque a pergunta "a curva está atualizando?" só tinha resposta
 * abrindo usina por usina na tela — e o modo de falha mais comum NÃO dá erro:
 * a API responde 200 com lista vazia e a curva simplesmente para de crescer.
 * Foi assim que a Sungrow passou uma manhã inteira congelada em 11/08/26,
 * enquanto as outras quatro plataformas seguiam normais.
 *
 * NÃO ESCREVE NADA. Só lê o banco.
 *
 * Uso:
 *   npx tsx scripts/diag-plataformas.ts
 *   npx tsx scripts/diag-plataformas.ts --dia=2026-08-10
 */
import { prisma } from "../src/lib/prisma";
import { PLATAFORMAS_INTRADIA } from "../src/lib/plataformas-intradia";
import { JANELA_SOLAR_UTC, dentroDaJanelaSolar } from "../src/lib/janela-solar";

/**
 * Atraso NORMAL de cada plataforma, medido em 11/08/26 contra a API real.
 *
 * A Sungrow entrega o dado com mais de duas horas de atraso e isso é dela, não
 * defeito nosso — o coletor já recua a janela sozinha pra alcançar. Sem esse
 * número por plataforma, o diagnóstico apontaria a Sungrow como quebrada toda
 * vez, e um alerta que sempre acende é um alerta que ninguém mais lê.
 */
const ATRASO_ESPERADO_MIN: Record<string, number> = {
  SUNGROW: 150,
  SOLAREDGE: 30,
  FRONIUS: 30,
  HUAWEI: 30,
  GROWATT: 30,
};
/** Margem em cima do esperado antes de chamar de atraso anormal. */
const MARGEM_MIN = 60;

function arg(n: string) {
  return process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
}

/** UTC → BRT (UTC−3), só a hora do relógio. */
const hhmm = (d: Date | null) =>
  d
    ? `${String((d.getUTCHours() + 21) % 24).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    : "--:--";

async function main() {
  const diaArg = arg("dia");
  const agora = new Date();
  const dia = diaArg ? new Date(`${diaArg}T12:00:00Z`) : agora;
  const inicioDia = new Date(
    Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), JANELA_SOLAR_UTC.inicio),
  );
  const fimDia = new Date(
    Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), JANELA_SOLAR_UTC.fim),
  );
  const hoje = !diaArg;

  const linhas = await prisma.$queryRaw<
    Array<{
      plataforma: string | null;
      frota: bigint;
      comDado: bigint;
      amostras: bigint;
      ultimo: Date | null;
    }>
  >`
    SELECT c.plataforma_monitoramento                                  AS plataforma,
           COUNT(DISTINCT c.id)                                        AS frota,
           COUNT(DISTINCT s.client_id)                                 AS "comDado",
           COUNT(s.id)                                                 AS amostras,
           MAX(s.time_stamp)                                           AS ultimo
      FROM brasil_solar_clients c
      LEFT JOIN inverter_samples s
             ON s.client_id = c.id
            AND s.p_ac_w IS NOT NULL
            AND s.time_stamp >= ${inicioDia}
            AND s.time_stamp <  ${fimDia}
     WHERE c.active = true
       AND c.monitoramento_plant_id IS NOT NULL
     GROUP BY 1
     ORDER BY 2 DESC
  `;

  const dataLegivel = `${String(dia.getUTCDate()).padStart(2, "0")}/${String(dia.getUTCMonth() + 1).padStart(2, "0")}`;
  console.log(
    `\nCurva intradiária — ${dataLegivel} (janela solar ${JANELA_SOLAR_UTC.inicio - 3}h–${JANELA_SOLAR_UTC.fim - 3}h BRT)` +
      (hoje ? `  ·  agora ${hhmm(agora)} BRT` : ""),
  );
  if (hoje && !dentroDaJanelaSolar(agora)) {
    console.log("(fora da janela solar — o coletor não roda agora, atraso alto é esperado)");
  }
  console.log(
    "\n  plataforma    frota   com dado   amostras   último   atraso   situação",
  );
  console.log("  " + "-".repeat(74));

  const problemas: string[] = [];

  for (const l of linhas) {
    const nome = l.plataforma ?? "(sem plataforma)";
    const frota = Number(l.frota);
    const comDado = Number(l.comDado);
    const atrasoMin =
      hoje && l.ultimo ? Math.round((agora.getTime() - l.ultimo.getTime()) / 60000) : null;
    const cobertura = frota > 0 ? Math.round((comDado / frota) * 100) : 0;

    let situacao = "ok";
    if (!PLATAFORMAS_INTRADIA.includes(nome as never)) {
      situacao = "sem coletor — geração manual";
    } else if (comDado === 0) {
      situacao = "SEM NENHUM DADO NO DIA";
      problemas.push(`${nome}: nenhuma das ${frota} usinas gravou amostra`);
    } else if (cobertura < 50) {
      situacao = `só ${cobertura}% da frota`;
      problemas.push(`${nome}: ${comDado} de ${frota} usinas com dado (${cobertura}%)`);
    } else if (
      atrasoMin != null &&
      atrasoMin > (ATRASO_ESPERADO_MIN[nome] ?? 30) + MARGEM_MIN &&
      dentroDaJanelaSolar(agora)
    ) {
      situacao = `ATRASADA ${atrasoMin} min (normal ≤ ${ATRASO_ESPERADO_MIN[nome] ?? 30})`;
      problemas.push(
        `${nome}: último dado há ${atrasoMin} min (o normal desta plataforma é ${ATRASO_ESPERADO_MIN[nome] ?? 30} min)`,
      );
    } else if (cobertura < 80) {
      situacao = `${cobertura}% da frota`;
    }

    console.log(
      `  ${nome.padEnd(13)} ${String(frota).padStart(5)}   ${String(comDado).padStart(8)}   ` +
        `${String(Number(l.amostras)).padStart(8)}   ${hhmm(l.ultimo).padStart(6)}   ` +
        `${(atrasoMin != null ? `${atrasoMin}m` : "-").padStart(6)}   ${situacao}`,
    );
  }

  // Histórico curto: separa "quebrou agora" de "nunca funcionou". Uma
  // plataforma com cobertura boa nos dias fechados e ruim hoje está com atraso
  // de entrega, não com integração quebrada.
  const hist = await prisma.$queryRaw<
    Array<{ plataforma: string | null; dia: Date; usinas: bigint }>
  >`
    SELECT c.plataforma_monitoramento AS plataforma,
           date_trunc('day', s.time_stamp) AS dia,
           COUNT(DISTINCT s.client_id)     AS usinas
      FROM inverter_samples s
      JOIN brasil_solar_clients c ON c.id = s.client_id AND c.active = true
     WHERE s.p_ac_w IS NOT NULL
       AND s.time_stamp >= ${new Date(inicioDia.getTime() - 5 * 24 * 60 * 60 * 1000)}
       AND s.time_stamp <  ${fimDia}
     GROUP BY 1, 2
     ORDER BY 2
  `;
  const dias = [...new Set(hist.map((h) => h.dia.toISOString().slice(0, 10)))];
  if (dias.length > 1) {
    console.log(`\n  usinas com dado por dia (${dias.length} dias)`);
    console.log("  " + "-".repeat(74));
    console.log(
      "  " + "plataforma".padEnd(13) + dias.map((d) => d.slice(8) + "/" + d.slice(5, 7)).map((d) => d.padStart(8)).join(""),
    );
    for (const p of PLATAFORMAS_INTRADIA) {
      const porDia = dias.map((d) => {
        const r = hist.find((h) => h.plataforma === p && h.dia.toISOString().slice(0, 10) === d);
        return String(r ? Number(r.usinas) : 0).padStart(8);
      });
      console.log(`  ${p.padEnd(13)}${porDia.join("")}`);
    }
  }

  if (problemas.length === 0) {
    console.log("\n✅ as 5 plataformas atualizando dentro do esperado\n");
  } else {
    console.log("\n⚠️  pendências:");
    for (const p of problemas) console.log(`   • ${p}`);
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
