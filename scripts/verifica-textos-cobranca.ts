/**
 * Protege os TEXTOS DE COBRANÇA — a redação que o cliente recebe, agora
 * editável em Personalizações → Textos de cobrança.
 *
 * Texto editável é entrada de usuário que vai direto para o cliente, sem
 * ninguém no meio. As oito regras abaixo quebram CALADAS, cada uma do seu
 * jeito — as cinco primeiras estão detalhadas aqui, as outras três junto do
 * código que as verifica:
 *
 * 1. **Variável declarada que ninguém preenche.** A tela oferece
 *    `{{mesExtenso}}`, o operador usa, e o envio manda `{{mesExtenso}}` escrito
 *    no email porque `valoresDasVariaveis` não conhece o nome.
 *
 * 2. **Texto quebrado derruba a cobrança.** Se o render lançasse no disparo,
 *    uma vírgula errada na tela travaria o faturamento do mês.
 *
 * 3. **Zero de multa virando zero no Asaas.** A conta tem multa e juros
 *    globais no painel; a doc do Asaas avisa que mandar `fine`/`interest`
 *    SOBRESCREVE. `encargosParaAsaas` tem que devolver `{}` no zero — senão o
 *    sistema apaga em silêncio uma regra configurada por fora.
 *
 * 4. **HTML injetado pelo corpo.** O texto do operador entra dentro de um
 *    email; sem escapar, um `<` quebra o documento e uma tag viaja junto.
 *
 * 5. **O degrau do tom.** `ATRASO_FIRME` só existe se `estagioDoLembrete`
 *    virar a chave no dia configurado. Se ele nunca virar, a tela tem um campo
 *    que não faz nada.
 *
 * Rodar:  npx tsx scripts/verifica-textos-cobranca.ts
 */
import {
  ESTAGIOS,
  TEXTOS_PADRAO,
  ENCARGOS_PADRAO,
  VARIAVEIS,
  encargosParaAsaas,
  variaveisDesconhecidas,
  type EncargosCobranca,
  type TextosCobranca,
} from "../src/lib/cobranca-textos";
import { APP_SETTING_DEFAULTS, APP_SETTING_KEYS } from "../src/lib/app-settings";
import {
  assuntoLembrete,
  estagioDoLembrete,
  htmlEmailCobranca,
  htmlLembrete,
  textoLembreteEmail,
  textoLembreteWhatsapp,
  textoWhatsappCobranca,
  assuntoEmailCobranca,
  textoEmailCobranca,
  chavesPreenchidasPeloEnvio,
} from "../src/lib/cobranca-mensagens";

const erros: string[] = [];

const ENCARGOS: EncargosCobranca = {
  multaPercentual: 2,
  jurosMensalPercentual: 1,
  atrasoFirmeDias: 15,
};

const FATURA = {
  clienteNome: "Maria Aparecida da Silva",
  codigoUc: "3090656984",
  mes: 9,
  ano: 2026,
  valor: 487.32,
  vencimento: new Date(2026, 8, 20),
  linkPagamento: "https://exemplo/fatura/x",
};

const LEMBRETE = {
  clienteNome: "Maria Aparecida da Silva",
  codigoUc: "3090656984",
  mes: 9,
  ano: 2026,
  valor: 487.32,
  vencimento: new Date(2026, 8, 20),
  link: "https://exemplo/fatura/x",
  tipo: "ATRASO" as const,
  diasAtraso: 20,
};

// ── 1. Toda variável declarada é preenchida de fato ─────────────────────────
//
// O teste usa um texto que cita TODAS as variáveis de uma vez. Se alguma não
// for resolvida, ela sobra escrita na saída.
const TODAS = VARIAVEIS.map((v) => `{{${v.chave}}}`).join(" | ");
const textosTodasVars: TextosCobranca = Object.fromEntries(
  ESTAGIOS.map((e) => [e, { assunto: TODAS, corpoEmail: TODAS, corpoWhatsapp: TODAS }]),
) as TextosCobranca;

const saidaTodas = [
  assuntoLembrete(LEMBRETE, textosTodasVars, ENCARGOS),
  textoLembreteEmail(LEMBRETE, textosTodasVars, ENCARGOS),
  textoLembreteWhatsapp(LEMBRETE, textosTodasVars, ENCARGOS),
].join("\n");

if (saidaTodas.includes("{{")) {
  const sobrou = [...saidaTodas.matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]);
  erros.push(`Sobrou variável escrita na mensagem: ${[...new Set(sobrou)].join(", ")}`);
}

// 🪤 **Conferir só a SAÍDA não basta**, e isto foi descoberto testando a
// guarda com a trava arrancada, em 06/09/2026: uma variável declarada e não
// preenchida virava string vazia e SUMIA da frase, então a busca por `{{`
// aprovava o defeito. A comparação que pega é entre as duas LISTAS.
const declaradas = VARIAVEIS.map((v) => v.chave as string);
const preenchidas = chavesPreenchidasPeloEnvio();
const semValor = declaradas.filter((c) => !preenchidas.includes(c));
const semDeclaracao = preenchidas.filter((c) => !declaradas.includes(c));

if (semValor.length > 0) {
  erros.push(
    `Variável declarada em VARIAVEIS que o envio NÃO preenche: ${semValor.join(", ")}\n` +
      "  A tela oferece essa variável; no envio ela deixaria um buraco na frase.\n" +
      "  Toda entrada de VARIAVEIS precisa de um valor em `valoresDasVariaveis`.",
  );
}
if (semDeclaracao.length > 0) {
  erros.push(
    `O envio preenche variável que a tela não oferece: ${semDeclaracao.join(", ")}\n` +
      "  Ninguém consegue usar — ou entra em VARIAVEIS, ou sai de `valoresDasVariaveis`.",
  );
}

// ── 2. Texto com defeito NÃO derruba o envio ────────────────────────────────
const quebrado: TextosCobranca = Object.fromEntries(
  ESTAGIOS.map((e) => [
    e,
    { assunto: "{{naoExiste}}", corpoEmail: "{{tambemNao}}", corpoWhatsapp: "{{nemEste}}" },
  ]),
) as TextosCobranca;

try {
  const saida = [
    assuntoLembrete(LEMBRETE, quebrado, ENCARGOS),
    textoLembreteEmail(LEMBRETE, quebrado, ENCARGOS),
    htmlLembrete(LEMBRETE, quebrado, ENCARGOS),
  ].join("\n");
  if (saida.includes("{{naoExiste}}") || saida.includes("{{tambemNao}}")) {
    erros.push(
      "Um texto com variável inválida VAZOU para a mensagem em vez de cair no padrão.\n" +
        "  O cliente receberia `{{naoExiste}}` escrito no meio da cobrança.",
    );
  }
} catch (e) {
  erros.push(
    `Texto com variável inválida LANÇOU no envio: ${(e as Error).message}\n` +
      "  Isso trava o disparo da cobrança inteira. O caminho certo é cair no texto padrão.",
  );
}

// ── 3. Encargo zerado não fala com o Asaas ──────────────────────────────────
const vazio = encargosParaAsaas({ multaPercentual: 0, jurosMensalPercentual: 0, atrasoFirmeDias: 15 });
if (Object.keys(vazio).length !== 0) {
  erros.push(
    `encargosParaAsaas devolveu ${JSON.stringify(vazio)} para multa e juros ZERADOS.\n` +
      "  Mandar `fine`/`interest` zerado SOBRESCREVE a configuração global do painel do Asaas —\n" +
      "  o sistema apagaria em silêncio uma regra que alguém configurou por fora.",
  );
}
const cheio = encargosParaAsaas(ENCARGOS);
if (cheio.fine?.value !== 2 || cheio.fine?.type !== "PERCENTAGE" || cheio.interest?.value !== 1) {
  erros.push(
    `encargosParaAsaas não montou o payload esperado: ${JSON.stringify(cheio)}\n` +
      "  Esperado fine {value:2,type:PERCENTAGE} e interest {value:1}.",
  );
}

// ── 4. O corpo do operador é ESCAPADO no HTML ───────────────────────────────
const comTag: TextosCobranca = {
  ...TEXTOS_PADRAO,
  FATURA: {
    ...TEXTOS_PADRAO.FATURA,
    corpoEmail: '<script>alert(1)</script> e um sinal de menor: 5 < 7',
  },
};
const html = htmlEmailCobranca(FATURA, comTag.FATURA, ENCARGOS);
if (html.includes("<script>")) {
  erros.push(
    "O texto do operador entrou CRU no HTML do email.\n" +
      "  Uma tag digitada na tela quebra o documento e viaja para a caixa do cliente.",
  );
}
if (!html.includes("5 &lt; 7")) {
  erros.push(
    "O `<` do texto do operador não foi escapado no HTML do email.\n" +
      "  Quem escrever \"consumo < 100 kWh\" perderia metade da frase.",
  );
}

// ── 5. O degrau do tom vira no dia configurado ──────────────────────────────
const antesDoCorte = estagioDoLembrete({ tipo: "ATRASO", diasAtraso: 14 }, ENCARGOS);
const noCorte = estagioDoLembrete({ tipo: "ATRASO", diasAtraso: 15 }, ENCARGOS);
const vespera = estagioDoLembrete({ tipo: "ANTES", diasAtraso: 0 }, ENCARGOS);
if (antesDoCorte !== "ATRASO" || noCorte !== "ATRASO_FIRME" || vespera !== "ANTES") {
  erros.push(
    `estagioDoLembrete não escalona: 14 dias → ${antesDoCorte}, 15 dias → ${noCorte}, véspera → ${vespera}.\n` +
      '  Esperado ATRASO, ATRASO_FIRME e ANTES. Sem isso o campo "tom firme a partir do dia" não faz nada.',
  );
}

// ── 6. Os textos PADRÃO são válidos ─────────────────────────────────────────
//
// Eles são a rede de segurança de tudo acima. Um padrão inválido faria o
// fallback do item 2 lançar — e aí não sobraria rede nenhuma.
for (const estagio of ESTAGIOS) {
  for (const campo of ["assunto", "corpoEmail", "corpoWhatsapp"] as const) {
    const texto = TEXTOS_PADRAO[estagio][campo];
    const ruins = variaveisDesconhecidas(texto);
    if (ruins.length > 0) {
      erros.push(
        `O texto PADRÃO de ${estagio}/${campo} usa variável que não existe: ${ruins.join(", ")}.\n` +
          "  O padrão é o fallback de tudo — se ele quebra, não há para onde cair.",
      );
    }
    if (!texto.trim()) {
      erros.push(`O texto PADRÃO de ${estagio}/${campo} está vazio.`);
    }
  }
}

// ── 7. O texto PADRÃO faz sentido na configuração PADRÃO ────────────────────
//
// 🪤 Descoberto olhando a prévia em produção, em 06/09/2026: o texto de atraso
// prolongado citava `{{multa}}` e `{{juros}}`, que nascem ZERADOS e viram um
// travessão. A frase que chegaria ao cliente era "já contempla multa de — e
// juros de —". Texto de fábrica tem que funcionar na configuração de fábrica.
// As duas coisas se movem JUNTAS: se um texto padrão cita o encargo, o encargo
// padrão precisa existir. Zerar `ENCARGOS_PADRAO` sem mexer no texto traz o
// travessão de volta.
for (const estagio of ESTAGIOS) {
  for (const campo of ["assunto", "corpoEmail", "corpoWhatsapp"] as const) {
    const texto = TEXTOS_PADRAO[estagio][campo];
    if (texto.includes("{{multa}}") && ENCARGOS_PADRAO.multaPercentual <= 0) {
      erros.push(
        `O texto PADRÃO de ${estagio}/${campo} cita {{multa}}, mas ENCARGOS_PADRAO.multaPercentual é ${ENCARGOS_PADRAO.multaPercentual}.\n` +
          '  O cliente leria "multa de —". Ou o texto para de citar, ou o encargo padrão volta a existir.',
      );
    }
    if (texto.includes("{{juros}}") && ENCARGOS_PADRAO.jurosMensalPercentual <= 0) {
      erros.push(
        `O texto PADRÃO de ${estagio}/${campo} cita {{juros}}, mas ENCARGOS_PADRAO.jurosMensalPercentual é ${ENCARGOS_PADRAO.jurosMensalPercentual}.\n` +
          '  O cliente leria "juros de —". Ou o texto para de citar, ou o encargo padrão volta a existir.',
      );
    }
  }
}

const padraoNaMensagem = [
  textoLembreteEmail({ ...LEMBRETE, diasAtraso: 20 }, TEXTOS_PADRAO, ENCARGOS_PADRAO),
  textoLembreteWhatsapp({ ...LEMBRETE, diasAtraso: 20 }, TEXTOS_PADRAO, ENCARGOS_PADRAO),
].join("\n");
if (/\bde —/.test(padraoNaMensagem)) {
  erros.push(
    'A mensagem padrão saiu com "de —" na configuração PADRÃO.\n' +
      "  É o buraco do encargo não preenchido aparecendo no texto do cliente.",
  );
}

// ── 8. Os DOIS lugares que guardam os percentuais dizem a mesma coisa ───────
//
// 🪤 `ENCARGOS_PADRAO` e `APP_SETTING_DEFAULTS` guardam os mesmos números em
// arquivos diferentes — `cobranca-textos.ts` importa `app-settings.ts`, então
// um não pode derivar do outro sem ciclo. A divergência seria silenciosa: a
// tela mostraria um valor e o boleto sairia com outro.
const paresDeEncargo: [string, number, number][] = [
  ["multa", ENCARGOS_PADRAO.multaPercentual, APP_SETTING_DEFAULTS[APP_SETTING_KEYS.cobrancaMultaPercentual]],
  ["juros", ENCARGOS_PADRAO.jurosMensalPercentual, APP_SETTING_DEFAULTS[APP_SETTING_KEYS.cobrancaJurosMensalPercentual]],
  ["dias do tom firme", ENCARGOS_PADRAO.atrasoFirmeDias, APP_SETTING_DEFAULTS[APP_SETTING_KEYS.cobrancaAtrasoFirmeDias]],
];
for (const [nome, aqui, la] of paresDeEncargo) {
  if (aqui !== la) {
    erros.push(
      `O padrão de ${nome} está DIFERENTE nos dois arquivos: ENCARGOS_PADRAO tem ${aqui}, APP_SETTING_DEFAULTS tem ${la}.\n` +
        "  A tela leria um e a cobrança sairia com outro, sem nada apitar.",
    );
  }
}

// A fatura também passa pelos seus próprios construtores, que têm assinatura
// diferente da dos lembretes e por isso não são cobertos pelos testes acima.
const saidaFatura = [
  assuntoEmailCobranca(FATURA, TEXTOS_PADRAO.FATURA, ENCARGOS),
  textoEmailCobranca(FATURA, TEXTOS_PADRAO.FATURA, ENCARGOS),
  textoWhatsappCobranca(FATURA, TEXTOS_PADRAO.FATURA, ENCARGOS),
].join("\n");
if (saidaFatura.includes("{{")) {
  erros.push("A mensagem da FATURA saiu com `{{` — alguma variável não foi resolvida.");
}
if (!saidaFatura.includes("R$")) {
  erros.push("A mensagem da FATURA saiu sem o valor em reais.");
}

if (erros.length > 0) {
  console.error("\n[verifica-textos-cobranca] FALHOU\n");
  for (const e of erros) console.error(`- ${e}\n`);
  console.error("Se a mudança foi intencional, atualize scripts/verifica-textos-cobranca.ts junto.\n");
  process.exit(1);
}

console.log(
  `[verifica-textos-cobranca] ok — ${ESTAGIOS.length} estágios e ${VARIAVEIS.length} variáveis conferidos`,
);
