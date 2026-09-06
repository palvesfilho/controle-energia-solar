/**
 * Protege a fatura publica — a pagina /fatura/<token> que o cliente abre pelo
 * link do email e do WhatsApp.
 *
 * Sao tres regras, e as tres quebram CALADAS:
 *
 * 1. **As rotas precisam estar declaradas como publicas no `proxy.ts`.** Sem
 *    isso o middleware devolve 401 ANTES do handler. Nada quebra no build, nada
 *    aparece no log da aplicacao, e o defeito so chega como "o link que voces
 *    mandaram nao abre" — dias depois, pela boca do cliente.
 *
 * 2. **A chave do PDF tem que ser DERIVADA do billing.** Se alguem passar a
 *    montar o caminho com dado vindo da URL, uma rota publica vira leitura
 *    arbitraria do bucket. O `/api/files/[...path]`, que aceita caminho, existe
 *    atras de sessao de admin exatamente por isso.
 *
 * 3. **A pagina nao pode ser indexada.** A URL E a credencial: um link de
 *    fatura no Google e a conta de um cliente aberta para qualquer um.
 *
 * Mesmo desenho de `verifica-trava-contato.ts`, inclusive o cuidado de ignorar
 * os imports: um simbolo citado so no `import` nao prova uso nenhum.
 *
 * Rodar:  npx tsx scripts/verifica-fatura-publica.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { formatarLinhaDigitavel } from "../src/lib/linha-digitavel";

interface Alvo {
  arquivo: string;
  porque: string;
  exige: string[];
  /** Não pode aparecer no corpo. */
  proibe?: { trecho: string; motivo: string }[];
}

const ALVOS: Alvo[] = [
  {
    arquivo: "src/proxy.ts",
    porque:
      "e o middleware — sem a rota declarada publica, o cliente leva 401 e ninguem fica sabendo",
    exige: ['"/api/fatura/(.*)"', '"/fatura/(.*)"'],
  },
  {
    arquivo: "src/lib/fatura-publica.ts",
    porque: "e quem resolve o token e monta a chave do PDF",
    exige: ["resolverFaturaPorToken", "chaveDoDemonstrativo", "linkPublicoDaFatura"],
  },
  {
    arquivo: "src/app/api/fatura/[token]/demonstrativo/route.ts",
    porque:
      "serve o PDF numa rota publica — a chave do arquivo precisa vir do billing, nunca da URL",
    exige: ["chaveDoDemonstrativo", "resolverFaturaPorToken"],
    proibe: [
      {
        trecho: "demonstrativoUrl",
        motivo:
          "montar o caminho a partir de um campo de URL abre a porta para ler outro arquivo do bucket",
      },
      {
        trecho: "params.path",
        motivo: "caminho vindo da URL numa rota publica e leitura arbitraria do storage",
      },
    ],
  },
  {
    arquivo: "src/app/fatura/[token]/page.tsx",
    porque: "a URL E a credencial — a pagina nao pode ser indexada por buscador",
    exige: ["robots", "index: false"],
  },
  {
    arquivo: "src/lib/notificar-cobranca.ts",
    porque:
      "e quem escolhe o link da mensagem — sem isto o cliente volta a ser mandado para o checkout do Asaas",
    exige: ["linkPublicoDaFatura", "tokenPublico"],
  },
  {
    arquivo: "src/components/pagamento/abas-pagamento.tsx",
    porque:
      "mostra a linha digitavel e o PDF do boleto — a fatura de energia aponta para o NOSSO demonstrativo",
    exige: ["formatarLinhaDigitavel", "pdfHref"],
  },
  {
    arquivo: "src/lib/cobranca-lembretes.ts",
    porque:
      "e o motor dos lembretes — a idempotencia e a regra, nao um detalhe de implementacao",
    exige: ["cobrancaLembrete", "diaReferencia", "SEM_UC_BRASIL_SOLAR", "modoNotificacao"],
  },
];

/**
 * Remove COMENTARIOS antes de procurar os trechos proibidos.
 *
 * 🪤 Sem isto a guarda pune quem documenta o risco: o comentario que explica
 * "a chave e derivada do billing, nunca tirada de `demonstrativoUrl`" contem a
 * palavra proibida e reprova o arquivo. Aconteceu na primeira execucao desta
 * guarda, em 06/09/2026. O efeito seria pior do que o falso positivo — ensinaria
 * a apagar o comentario que existe justamente para avisar o proximo.
 */
function semComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Remove os `import`s antes de procurar os simbolos — um nome citado so no
 * import nao prova uso. Mesma armadilha documentada em
 * `verifica-trava-contato.ts`, onde a guarda chegou a aprovar codigo com a
 * trava arrancada.
 */
function corpoSemImports(texto: string): string {
  const linhas = texto.split(/\r?\n/);
  const fora: string[] = [];
  let dentro = false;
  for (const linha of linhas) {
    if (!dentro && /^\s*import\b/.test(linha)) {
      dentro = !/;\s*$/.test(linha) && !/^\s*import\s+["']/.test(linha);
      continue;
    }
    if (dentro) {
      if (/;\s*$/.test(linha)) dentro = false;
      continue;
    }
    fora.push(linha);
  }
  return fora.join("\n");
}

const erros: string[] = [];

for (const alvo of ALVOS) {
  if (!existsSync(alvo.arquivo)) {
    erros.push(`FALTA O ARQUIVO ${alvo.arquivo}\n  (${alvo.porque})`);
    continue;
  }
  const corpo = corpoSemImports(semComentarios(readFileSync(alvo.arquivo, "utf8")));

  const ausentes = alvo.exige.filter((t) => !corpo.includes(t));
  if (ausentes.length > 0) {
    erros.push(
      `${alvo.arquivo} perdeu a protecao da fatura publica.\n` +
        `  Nao encontrei: ${ausentes.join(", ")}\n` +
        `  Este arquivo importa porque ${alvo.porque}.`,
    );
  }

  for (const p of alvo.proibe ?? []) {
    if (corpo.includes(p.trecho)) {
      erros.push(
        `${alvo.arquivo} usa "${p.trecho}", que nao pode aparecer aqui.\n  ${p.motivo}.`,
      );
    }
  }
}

/**
 * A linha digitavel so pode ser AGRUPADA, nunca alterada.
 *
 * Um digito perdido ou trocado na formatacao manda o pagamento para outro
 * boleto — e ninguem confere 47 digitos a olho. Por isso a guarda nao verifica
 * so o agrupamento: verifica que os digitos que saem sao exatamente os que
 * entraram.
 */
const LINHAS = [
  "46191110000000000004282981993015715830000000500",
  "836100000009123420240610000012345678901234567890",
  "12345",
  "",
];
for (const bruto of LINHAS) {
  const saida = formatarLinhaDigitavel(bruto);
  const antes = bruto.replace(/\D/g, "");
  const depois = saida.replace(/\D/g, "");
  if (antes !== depois) {
    erros.push(
      `formatarLinhaDigitavel ALTEROU os digitos de "${bruto}":
` +
        `  entrou ${antes}
  saiu   ${depois}
` +
        "  Formatacao de linha digitavel so agrupa. Digito trocado manda o pagamento para outro boleto.",
    );
  }
}
if (formatarLinhaDigitavel(LINHAS[0]).split(" ").length !== 5) {
  erros.push(
    "formatarLinhaDigitavel nao devolveu os 5 campos do boleto bancario (47 digitos).",
  );
}

if (erros.length > 0) {
  console.error("\n[verifica-fatura-publica] FALHOU\n");
  for (const e of erros) console.error(`- ${e}\n`);
  console.error(
    "Se a mudanca foi intencional, atualize scripts/verifica-fatura-publica.ts junto.\n",
  );
  process.exit(1);
}

console.log(
  `[verifica-fatura-publica] ok — ${ALVOS.length} arquivos e ${LINHAS.length} linhas digitaveis conferidos`,
);
