/**
 * Casos à mão para `lib/ultima-leitura` — a regra que decide QUANDO o sistema
 * pode dizer "esta usina comunicou". Errar aqui não quebra tela nenhuma: só
 * apaga o alarme de usina parada, em silêncio.
 *
 * Rodar: npx tsx scripts/verifica-ultima-leitura.ts
 */
import {
  avancoDeLeitura,
  leituraDoDia,
  leituraDoLog,
  leituraDoUltimoDiaComGeracao,
  statusPorEvidencia,
} from "../src/lib/ultima-leitura";

let falhas = 0;
function ok(nome: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    console.log(`  ✓ ${nome}`);
  } else {
    falhas++;
    console.log(`  ✗ ${nome} ${detalhe}`);
  }
}

// 12/09/2026, 20:00 BRT = 23:00Z
const agora = new Date("2026-09-12T23:00:00Z");
const dias = (...ds: Array<[number, number]>) =>
  ds.map(([day, energyKwh]) => ({ day, energyKwh }));

console.log("\nlib/ultima-leitura\n");

// 1. Dia corrente: a prova é de hoje, o teto é agora (carimbo no futuro
//    apareceria como "há -3h" na tela).
ok(
  "dia corrente carimba 'agora', nunca o futuro",
  leituraDoDia(2026, 9, 12, agora).getTime() === agora.getTime(),
);

// 2. Dia passado: o mais tarde que pode ter comunicado é o fim daquele dia.
ok(
  "dia passado carimba o fim do dia em Brasília (02:59:59Z do seguinte)",
  leituraDoDia(2026, 9, 10, agora).toISOString() === "2026-09-11T02:59:59.000Z",
  leituraDoDia(2026, 9, 10, agora).toISOString(),
);

// 3. Zero não prova nada: é o que o datalogger mudo da Growatt responde.
ok(
  "lote só com 0,0 kWh não vira carimbo",
  leituraDoUltimoDiaComGeracao(dias([9, 0], [10, 0], [11, 0]), 2026, 9, agora) === undefined,
);

// 4. Sem resposta nenhuma, nada se escreve.
ok("lote vazio não vira carimbo", leituraDoUltimoDiaComGeracao([], 2026, 9, agora) === undefined);

// 5. Vale o ÚLTIMO dia com geração, não o último dia do lote.
ok(
  "pega o último dia COM geração, ignorando os zeros depois dele",
  leituraDoUltimoDiaComGeracao(dias([8, 31.2], [9, 28.4], [10, 0], [11, 0]), 2026, 9, agora)
    ?.toISOString() === "2026-09-10T02:59:59.000Z",
);

// 6. O carimbo não anda para trás: uma rodada de mês passado traz o último dia
//    DAQUELE mês, e gravá-lo por cima de uma leitura de hoje acende alerta falso.
const hoje = new Date("2026-09-12T12:00:00Z");
const mesPassado = new Date("2026-08-31T02:59:59Z");
ok("não retrocede o carimbo", Object.keys(avancoDeLeitura(hoje, mesPassado)).length === 0);
ok("avança quando é mais novo", avancoDeLeitura(mesPassado, hoje).ultimaLeitura === hoje);
ok("usina sem leitura anterior recebe o carimbo", avancoDeLeitura(null, hoje).ultimaLeitura === hoje);
ok("sem candidato não escreve nada", Object.keys(avancoDeLeitura(hoje, undefined)).length === 0);

// 7. MonitoringLog é gravado a 12:00Z do dia; o carimbo é o fim daquele dia.
ok(
  "carimbo a partir de um MonitoringLog",
  leituraDoLog(new Date("2026-09-09T12:00:00Z"), agora).toISOString() === "2026-09-10T02:59:59.000Z",
);

// 8. Status: gerou hoje/ontem = ONLINE; mais velho não rebaixa, só não promove.
ok("leitura de ontem promove a ONLINE", statusPorEvidencia(leituraDoDia(2026, 9, 11, agora), agora) === "ONLINE");
ok("leitura de 4 dias não promove", statusPorEvidencia(leituraDoDia(2026, 9, 8, agora), agora) === undefined);
ok("sem leitura não escreve status", statusPorEvidencia(undefined, agora) === undefined);

console.log(falhas === 0 ? "\n  todos os casos passam\n" : `\n  ${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
