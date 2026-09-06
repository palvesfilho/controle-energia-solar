/**
 * Impede que a TRAVA DE CONTATO e a normalizacao de telefone sejam removidas
 * ou quebradas sem querer.
 *
 * A regra protegida: **UC sem email e telefone cadastrados nao pode ser
 * cobrada**, porque desde 05/09/2026 toda emissao dispara email + WhatsApp ao
 * cliente. Sem a trava, a cobranca sai no Asaas e ninguem e avisado — o cliente
 * descobre quando o boleto vence.
 *
 * Duas metades aqui, e as duas importam:
 *
 *  1. ALVOS — os arquivos que precisam continuar chamando a trava. Ela e uma
 *     linha de guarda no meio de funcoes grandes (`emitBillingToAsaas` tem
 *     ~250 linhas); quem refatora nao quebra nada visivel ao remove-la.
 *
 *  2. CASOS_TELEFONE — a normalizacao roda de verdade. O banco guarda numero
 *     em 10 e 11 digitos, SEM DDI: "(55)99976-8597", "5599161375". Um erro
 *     aqui nao da tela vermelha: manda a mensagem para o numero errado, ou
 *     grava "enviado" para uma mensagem que ninguem recebeu.
 *
 * Mesmo desenho de `verifica-trava-faturamento.ts`.
 *
 * Rodar:  npx tsx scripts/verifica-trava-contato.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { normalizarTelefoneBR } from "../src/lib/uc-trava-contato";

interface Alvo {
  arquivo: string;
  /** Por que este arquivo precisa da trava. Sai na mensagem de erro. */
  porque: string;
  /** Todos precisam aparecer no texto do arquivo. */
  exige: string[];
}

const ALVOS: Alvo[] = [
  {
    arquivo: "src/lib/uc-trava-contato.ts",
    porque:
      "e o modulo da trava — sem ele nao ha regra nenhuma para os outros chamarem",
    exige: [
      "normalizarTelefoneBR",
      "emailsDoConsumer",
      "montarContato",
      "avaliarContato",
      "contatosDasUcs",
      "SKIP_SEM_CONTATO",
    ],
  },
  {
    arquivo: "src/lib/billing-asaas.ts",
    porque:
      "e o ponto UNICO por onde passam a emissao avulsa, o lote e o pipeline do demonstrativo",
    exige: ["avaliarContato", "montarContato", "SKIP_SEM_CONTATO"],
  },
  {
    arquivo: "src/lib/emit-cobranca.ts",
    porque:
      "e o pipeline do demonstrativo — a recusa precisa chegar antes de qualquer ida ao Asaas",
    exige: ["avaliarContato", "contatoDaUc", "SKIP_SEM_CONTATO"],
  },
  {
    arquivo:
      "src/app/api/admin/faturamento/unidades-consumidoras/[id]/validar-demonstrativo/route.ts",
    porque:
      "validar e o gesto que ACENDE o botao de cobrar — deixar validar seria prometer uma cobranca que a emissao recusa",
    exige: ["avaliarContato", "contatoDaUc"],
  },
  {
    arquivo: "src/app/api/billing/consumer-units/route.ts",
    porque:
      "alimenta a tela do mes — sem o campo `contato` o operador clica e so descobre o problema no 409",
    exige: ["contatosDasUcs", "contato:"],
  },
  {
    arquivo: "src/lib/notificar-cobranca.ts",
    porque:
      "e quem de fato avisa o cliente — sem ele a trava existiria protegendo um envio que nao acontece",
    exige: ["notificarCobranca", "modoNotificacao", "enviarTextoWhatsapp", "enviarEmail"],
  },
];

/**
 * Entrada do cadastro -> E.164 esperado (ou null quando o numero nao serve).
 * Os cinco primeiros sao formatos REAIS lidos do banco em 05/09/2026.
 */
const CASOS_TELEFONE: [string, string | null][] = [
  ["(55)99976-8597", "5555999768597"],
  ["5599161375", "5555999161375"], // 10 digitos: celular antigo, ganha o nono
  ["55999310485", "5555999310485"],
  ["5598137-8895", "5555981378895"],
  ["55984039386", "5555984039386"],
  ["5555999768597", "5555999768597"], // ja em E.164, passa intacto
  ["5532210000", null], // fixo: nao tem WhatsApp
  ["555532210000", null], // fixo com DDI
  ["999768597", null], // curto demais
  ["1099999999", null], // DDD 10 nao existe
  ["", null],
];

/**
 * Remove os `import`s antes de procurar os simbolos.
 *
 * 🪤 Sem isto a guarda passa quando NAO devia: apagar a chamada da trava no meio
 * da funcao deixa o `import { avaliarContato } ...` la em cima, e a busca por
 * texto simples continua achando o nome. Foi exatamente o que aconteceu no
 * primeiro teste desta guarda, em 05/09/2026 — ela deu "ok" para um
 * `billing-asaas.ts` com a trava arrancada.
 *
 * Consequencia pratica: so vale como prova o uso no CORPO do arquivo.
 */
function corpoSemImports(texto: string): string {
  const linhas = texto.split(/\r?\n/);
  const fora: string[] = [];
  let dentroDeImport = false;
  for (const linha of linhas) {
    if (!dentroDeImport && /^\s*import\b/.test(linha)) {
      // `import x from "y";` numa linha so nao abre bloco.
      dentroDeImport = !/;\s*$/.test(linha) && !/^\s*import\s+["']/.test(linha);
      continue;
    }
    if (dentroDeImport) {
      if (/;\s*$/.test(linha)) dentroDeImport = false;
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
  const texto = corpoSemImports(readFileSync(alvo.arquivo, "utf8"));
  const ausentes = alvo.exige.filter((t) => !texto.includes(t));
  if (ausentes.length > 0) {
    erros.push(
      `${alvo.arquivo} perdeu a trava de contato.\n` +
        `  Nao encontrei: ${ausentes.join(", ")}\n` +
        `  Este arquivo precisa da trava porque ${alvo.porque}.`,
    );
  }
}

for (const [entrada, esperado] of CASOS_TELEFONE) {
  const obtido = normalizarTelefoneBR(entrada).e164;
  if (obtido !== esperado) {
    erros.push(
      `normalizarTelefoneBR(${JSON.stringify(entrada)}) devolveu ${JSON.stringify(obtido)}, ` +
        `esperado ${JSON.stringify(esperado)}.\n` +
        "  Um numero normalizado errado manda a cobranca para o WhatsApp de outra pessoa.",
    );
  }
}

if (erros.length > 0) {
  console.error("\n[verifica-trava-contato] FALHOU\n");
  for (const e of erros) console.error(`- ${e}\n`);
  console.error(
    "Se a mudanca foi intencional, atualize scripts/verifica-trava-contato.ts junto.\n",
  );
  process.exit(1);
}

console.log(
  `[verifica-trava-contato] ok — ${ALVOS.length} arquivos com a trava, ` +
    `${CASOS_TELEFONE.length} casos de telefone conferidos`,
);
