/**
 * Protege a regra que separa, na fatura do destino, o crédito TRANSFERIDO do
 * resto (geração própria e rateio) — `src/lib/transferencia-creditos.ts`.
 *
 * Por que uma guarda de build: se a regra escorregar, nada quebra na tela. O
 * saldo da transferência só passa a cair errado — devagar, ou nunca — e o
 * operador confia num número que a fatura não confirma. Os casos abaixo são
 * faturas REAIS medidas em 10/10/2026, e fecham kWh por kWh.
 *
 * Rodar:  npx tsx scripts/verifica-transferencia-creditos.ts
 */
import {
  acompanharUc,
  diasDesdeEnvio,
  montarDocumentoRge,
  validarEntrada,
  type FaturaDestino,
} from "../src/lib/transferencia-creditos";

const erros: string[] = [];
function checa(condicao: boolean, mensagem: string) {
  if (!condicao) erros.push(mensagem);
}

function det(...linhas: [string, number][]): string {
  return JSON.stringify(linhas.map(([mesOrigem, kwh]) => ({ mesOrigem, teKwh: kwh, tusdKwh: kwh })));
}
function fat(ano: number, mes: number, comp: number | null, saldo: number | null, detalhes: string | null): FaturaDestino {
  return { ano, mes, consumoKwh: null, energiaCompensada: comp, saldoKwh: saldo, injetadaDetalhes: detalhes };
}
const meioDia = (s: string) => new Date(`${s}T12:00:00.000Z`);

// 1. SUBWAY Fernando Ferrari — geração própria (FEV/26) + transferência (JUL/25).
{
  const r = acompanharUc(
    [
      fat(2026, 1, 867, 0, det(["JAN/26", 867])), // antes do aceite: só geração própria
      fat(2026, 2, 5885, 58809, det(["FEV/26", 894], ["JUL/25", 4991])),
    ],
    [{ itemId: "subway", status: "ACEITA", aceitoEm: meioDia("2026-01-30"), kwh: 63800 }],
  ).get("subway")!;
  checa(r.usadoKwh === 4991, `SUBWAY: usado deveria ser 4.991 (só JUL/25), veio ${r.usadoKwh}`);
  checa(r.restanteKwh === 58809, `SUBWAY: restante deveria bater com o saldo da fatura (58.809), veio ${r.restanteKwh}`);
  checa(r.meses.length === 2 && r.meses[0].kwhTransferencia === 0, "SUBWAY: a fatura de 01/2026 (geração própria) não pode contar como transferência");
  checa(r.origens.join() === "JUL/25", `SUBWAY: origem deveria ser JUL/25, veio ${r.origens.join()}`);
  checa(r.venceEm?.ano === 2030 && r.venceEm?.mes === 7, "SUBWAY: crédito de JUL/25 vence em JUL/2030");
  checa(r.situacao === "EM_CONSUMO", `SUBWAY: situação deveria ser EM_CONSUMO, veio ${r.situacao}`);
}

// 2. ELTERONICA FRAZZON — 70.840 kWh, só NOV/25; o saldo cai exatamente o compensado.
{
  const comp = [3507, 2494, 1963, 1316, 1164, 2118];
  const saldos = [67333, 64839, 62876, 61560, 60396, 58278];
  const r = acompanharUc(
    [fat(2026, 1, null, null, null), ...comp.map((c, i) => fat(2026, i + 2, c, saldos[i], det(["NOV/25", c])))],
    [{ itemId: "frazzon", status: "ACEITA", aceitoEm: meioDia("2026-02-02"), kwh: 70840 }],
  ).get("frazzon")!;
  checa(r.meses.every((m) => m.saldoFaturaKwh === m.restanteKwh), "ELTERONICA: o restante de cada mês tem de bater com o saldo impresso na fatura");
  checa(r.usadoKwh === 12562, `ELTERONICA: usado deveria ser 12.562, veio ${r.usadoKwh}`);
  checa(r.ultimaFatura?.mes === 7, "ELTERONICA: última fatura é 07/2026");
  checa(r.previsaoEsgotar !== null, "ELTERONICA: com consumo, tem de haver previsão de esgotar");
}

// 3. Teto: nunca conta mais do que foi transferido.
{
  const r = acompanharUc(
    [fat(2026, 3, 9000, 0, det(["JAN/25", 9000]))],
    [{ itemId: "t", status: "ACEITA", aceitoEm: meioDia("2026-02-10"), kwh: 5000 }],
  ).get("t")!;
  checa(r.usadoKwh === 5000 && r.restanteKwh === 0 && r.situacao === "ESGOTADA", "teto: 9.000 kWh antigos contra 5.000 transferidos → usa 5.000 e esgota");
}

// 4. Duas transferências na mesma UC: a mais antiga consome primeiro, sem contar o mesmo kWh duas vezes.
{
  const r = acompanharUc(
    [fat(2026, 6, 3000, null, det(["JAN/25", 3000]))],
    [
      { itemId: "nova", status: "ACEITA", aceitoEm: meioDia("2026-05-01"), kwh: 10000 },
      { itemId: "velha", status: "ACEITA", aceitoEm: meioDia("2026-03-01"), kwh: 2000 },
    ],
  );
  checa(r.get("velha")!.usadoKwh === 2000, "FIFO: a transferência mais antiga leva primeiro (2.000)");
  checa(r.get("nova")!.usadoKwh === 1000, "FIFO: a mais nova leva só o que sobrou (1.000), nunca os 3.000 de novo");
}

// 5. Não aceita = não consome; rejeitada fica marcada.
{
  const fs = [fat(2026, 6, 3000, null, det(["JAN/25", 3000]))];
  const r = acompanharUc(fs, [
    { itemId: "env", status: "ENVIADA", aceitoEm: null, kwh: 1000 },
    { itemId: "rej", status: "REJEITADA", aceitoEm: meioDia("2026-01-01"), kwh: 1000 },
  ]);
  checa(r.get("env")!.situacao === "AGUARDANDO_ACEITE" && r.get("env")!.usadoKwh === 0, "enviada sem aceite não consome");
  checa(r.get("rej")!.situacao === "REJEITADA" && r.get("rej")!.usadoKwh === 0, "rejeitada não consome");
}

// 6. Aceite gravado à meia-noite UTC do dia 1º não pode cair no mês anterior.
{
  const r = acompanharUc(
    [fat(2026, 1, 500, null, det(["DEZ/25", 500]))],
    [{ itemId: "t", status: "ACEITA", aceitoEm: new Date("2026-02-01T00:00:00.000Z"), kwh: 1000 }],
  ).get("t")!;
  checa(r.usadoKwh === 0, "aceite em 01/02 (00h UTC) não pode consumir a fatura de 01/2026");
}

// 7. Validação da entrada — destinos em %, como no documento da RGE.
{
  const base = { ucOrigemCodigo: "4003820948", kwhTotal: 63800, status: "ACEITA", aceitoEm: "2026-01-30", itens: [{ consumerUnitId: "a", percentual: 100 }] };
  const v = validarEntrada(base);
  checa(v.ok, "entrada válida do SUBWAY foi recusada");
  checa(v.ok && v.valor.itens[0].kwh === 63800, "100% de 63.800 tem de gravar 63.800 kWh no destino");
  checa(v.ok && v.valor.aceitoEm?.toISOString() === "2026-01-30T12:00:00.000Z", "data do aceite deve ser gravada ao meio-dia UTC");
  checa(!validarEntrada({ ...base, aceitoEm: "" }).ok, "ACEITA sem data do aceite tem de ser recusada");
  checa(!validarEntrada({ ...base, itens: [{ consumerUnitId: "a", percentual: 90 }] }).ok, "percentuais que não somam 100% têm de ser recusados");
  checa(!validarEntrada({ ...base, itens: [] }).ok, "sem destino tem de ser recusada");
  checa(
    !validarEntrada({ ...base, itens: [{ consumerUnitId: "a", percentual: 33.333 }, { consumerUnitId: "b", percentual: 66.667 }] }).ok,
    "mais de 2 casas decimais no percentual tem de ser recusado (regra do formulário da RGE)",
  );

  // No dia do envio só se conhece o %: o total em kWh é opcional.
  const semTotal = validarEntrada({ ...base, kwhTotal: null, status: "ENVIADA", aceitoEm: "", enviadoEm: "2026-01-09", itens: [{ consumerUnitId: "a", percentual: 60 }, { consumerUnitId: "b", percentual: 40 }] });
  checa(semTotal.ok, "transferência sem total em kWh (só %) tem de ser aceita");
  checa(semTotal.ok && semTotal.valor.kwhTotal === null && semTotal.valor.itens.every((x) => x.kwh === null), "sem total, o kWh de cada destino fica nulo");
  const dividido = validarEntrada({ ...base, kwhTotal: 1000, itens: [{ consumerUnitId: "a", percentual: 60 }, { consumerUnitId: "b", percentual: 40 }] });
  checa(dividido.ok && dividido.valor.itens[0].kwh === 600 && dividido.valor.itens[1].kwh === 400, "60/40 de 1.000 kWh → 600 e 400");
}

// 8. Sem o total em kWh: acompanha o consumo, não inventa saldo, e mostra a pista da 1ª fatura.
{
  const r = acompanharUc(
    [fat(2026, 2, 5885, 58809, det(["FEV/26", 894], ["JUL/25", 4991])), fat(2026, 3, 4996, 54482, det(["MAR/26", 669], ["JUL/25", 4327]))],
    [{ itemId: "s", status: "ACEITA", aceitoEm: meioDia("2026-01-30"), kwh: null }],
  ).get("s")!;
  checa(r.usadoKwh === 9318, `sem total: usado deveria ser 9.318, veio ${r.usadoKwh}`);
  checa(r.restanteKwh === null && r.previsaoEsgotar === null, "sem total: saldo e previsão têm de ficar nulos, nunca um número inventado");
  checa(r.sugestaoKwh === 63800, `sem total: a pista da 1ª fatura (4.991 + 58.809) deveria ser 63.800, veio ${r.sugestaoKwh}`);
  checa(r.situacao === "EM_CONSUMO", "sem total: continua EM_CONSUMO, não ESGOTADA");
}

// 9. Prazo de 30 dias da RGE.
{
  checa(diasDesdeEnvio("2026-01-09T12:00:00.000Z", meioDia("2026-01-30")) === 21, "09/01 → 30/01 são 21 dias");
  checa(diasDesdeEnvio(null) === null, "sem data de envio não há contagem");
}

// 10. Documento da RGE — sempre no código ANTIGO; o caso real do SUBWAY.
{
  const base = {
    ucOrigemCodigo: "361531700123",
    usinaCodigoAntigo: "4003820948",
    usinaCodigo: "361531700123",
    titularNome: "PAULO FERNANDO ALVES FILHO",
    titularEmail: "contratos@dommosolucoes.com.br",
    destinos: [{ nome: "SUBWAY", codigoUc: "158223400110", codigoUcAntigo: "3090657500", percentual: 100 }],
  };
  const d = montarDocumentoRge(base);
  checa(d.ok && d.valor.doadora === "4003820948", "documento: a doadora vai no código antigo (4003820948)");
  checa(d.ok && d.valor.favorecidas[0].codigo === "3090657500" && d.valor.favorecidas[0].percentual === "100%", "documento: favorecida 3090657500 — 100%");
  checa(!montarDocumentoRge({ ...base, destinos: [{ ...base.destinos[0], codigoUcAntigo: null }] }).ok, "documento: UC favorecida só com código novo tem de barrar a emissão");
  checa(!montarDocumentoRge({ ...base, usinaCodigoAntigo: null }).ok, "documento: doadora só com código novo tem de barrar a emissão");
  checa(!montarDocumentoRge({ ...base, titularNome: null }).ok, "documento: sem titular não emite");
  const dois = montarDocumentoRge({ ...base, destinos: [{ ...base.destinos[0], percentual: 33.33 }, { nome: "B", codigoUc: "3090000001", codigoUcAntigo: null, percentual: 66.67 }] });
  checa(dois.ok && dois.valor.favorecidas[0].percentual === "33,33%" && dois.valor.favorecidas[1].codigo === "3090000001", "documento: percentual com vírgula; UC que ainda está no código antigo usa o próprio código");
}

if (erros.length) {
  console.error("\n✗ verifica-transferencia-creditos — a separação do crédito transferido saiu do lugar:\n");
  for (const e of erros) console.error("  - " + e);
  console.error("\nOs casos 1 e 2 são faturas reais (SUBWAY e ELTERONICA, 10/10/2026). Confira na fatura antes de mexer no script.\n");
  process.exit(1);
}
console.log("✓ verifica-transferencia-creditos: SUBWAY e ELTERONICA fecham kWh por kWh; teto, ordem de consumo, percentuais, prazo e documento da RGE conferidos.");
