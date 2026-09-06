/**
 * Protege os COMUNICADOS — a mensagem em massa por email e WhatsApp.
 *
 * Aqui um defeito não atinge um cliente: atinge a lista inteira de uma vez, e
 * não tem desfazer. As regras abaixo quebram CALADAS:
 *
 * 1. **Email inventado voltando para a lista.** 11 dos 19 investidores têm
 *    `fulano@sem-email.dommo.local`, gerado na importação das usinas Dommo.
 *    Passam em qualquer validação de formato. Mandar para eles é um lote de
 *    bounces, e reputação de remetente se perde muito mais rápido do que se
 *    constrói.
 *
 * 2. **UC do Brasil Solar entrando no público da Associação.** É o mesmo
 *    vazamento que já custou quatro correções na cobrança. São duas relações
 *    comerciais diferentes; um aviso de reajuste da Associação não faz sentido
 *    nenhum para quem é cliente de monitoramento.
 *
 * 3. **Reenvio.** A trava é o índice único de `comunicado_envios`, e a linha
 *    gravada ANTES do envio. Sem os dois, um clique repetido ou um restart no
 *    meio manda tudo de novo.
 *
 * 4. **Rajada de WhatsApp.** Disparar dezenas de mensagens seguidas por API
 *    não-oficial é o comportamento que faz o número ser banido.
 *
 * 5. **Nascer em modo real.** Se o padrão de `COMUNICADOS_MODO` virasse `real`,
 *    o primeiro disparo de teste de alguém iria para clientes de verdade.
 *
 * Rodar:  npx tsx scripts/verifica-comunicados.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { emailUtilizavel } from "../src/lib/comunicados-publico";
import { modoComunicado } from "../src/lib/comunicados-envio";
import { TIPOS, htmlComunicado, DESENHOS, desenhoIgnoraPeso } from "../src/lib/comunicados-textos";

const erros: string[] = [];

// ── 1. Endereço inventado NÃO é endereço ────────────────────────────────────
const RECUSAR = [
  "andreia-fatima-escobar@sem-email.dommo.local",
  "fulano@qualquer.local",
  "x@teste.invalid",
  "y@algo.test",
  "z@dominio.example",
  "sem-arroba",
  "@sem-usuario.com",
  "sem-ponto@dominio",
];
const ACEITAR = [
  "paulo@solvesm.eng.br",
  "gestao@abrasilsolar.com.br",
  "financeiro@dommosolucoes.com.br",
  "alguem@gmail.com",
  "contato@empresa.local.com.br", // `.local` no MEIO do domínio é legítimo
];
for (const e of RECUSAR) {
  if (emailUtilizavel(e)) {
    erros.push(
      `emailUtilizavel("${e}") devolveu TRUE.\n` +
        "  Este endereço não existe e viraria bounce num disparo em massa.",
    );
  }
}
for (const e of ACEITAR) {
  if (!emailUtilizavel(e)) {
    erros.push(
      `emailUtilizavel("${e}") devolveu FALSE.\n` +
        "  É um endereço legítimo — recusar aqui tira um cliente real da lista, em silêncio.",
    );
  }
}

// ── 5. O modo nasce em ENSAIO ───────────────────────────────────────────────
const modoSalvo = process.env.COMUNICADOS_MODO;
delete process.env.COMUNICADOS_MODO;
if (modoComunicado() !== "simulacao") {
  erros.push(
    "Sem `COMUNICADOS_MODO` configurado, o disparo NÃO caiu em simulação.\n" +
      "  O primeiro teste de alguém iria para a carteira inteira.",
  );
}
if (modoSalvo !== undefined) process.env.COMUNICADOS_MODO = modoSalvo;

// ── 2/3/4. O que precisa estar escrito no código ────────────────────────────
interface Alvo {
  arquivo: string;
  porque: string;
  exige: { trecho: string; motivo: string }[];
}

const ALVOS: Alvo[] = [
  {
    arquivo: "src/lib/comunicados-publico.ts",
    porque: "é quem monta a lista de quem recebe",
    exige: [
      {
        trecho: "isOrigemBrasilSolar",
        motivo:
          "sem esta exclusão, cliente de monitoramento da Rede Brasil Solar recebe aviso da Associação",
      },
      {
        trecho: "emailUtilizavel",
        motivo: "sem o crivo, os 11 endereços inventados dos investidores voltam para a lista",
      },
      {
        trecho: "ucsQueJaCompensaram",
        motivo:
          'o recorte "já faturando" tem de usar a MESMA regra da cobrança, senão as duas telas discordam',
      },
    ],
  },
  {
    arquivo: "src/lib/comunicados-envio.ts",
    porque: "é o disparo — onde o dano de um defeito é multiplicado pela lista",
    exige: [
      {
        trecho: "comunicadoEnvio.create",
        motivo:
          "a linha do destinatário tem de ser gravada ANTES do envio; é ela que trava o reenvio",
      },
      {
        // 🪤 `esperar(` sozinho NÃO serve: a DEFINIÇÃO da função satisfaz a
        // busca, e a guarda aprova o código com a espera arrancada da chamada.
        // Descoberto testando esta guarda com a trava fora, em 06/09/2026 —
        // primo do furo do `import` documentado em `verifica-trava-contato.ts`.
        trecho: "await esperar(",
        motivo:
          "sem intervalo entre os WhatsApps, o número é banido — rajada é exatamente o que se detecta",
      },
      {
        trecho: "variaveisDesconhecidas",
        motivo:
          "o texto é revalidado no disparo; entre salvar e mandar alguém pode ter quebrado uma variável",
      },
    ],
  },
  {
    arquivo: "src/app/api/admin/comunicados/[id]/enviar/route.ts",
    porque: "é a porta do disparo",
    exige: [
      {
        trecho: "confirmar",
        motivo:
          "mandar para dezenas de clientes não pode acontecer por um POST solto ou um clique duplo",
      },
      {
        trecho: "maxDuration",
        motivo:
          "o disparo com WhatsApp espaçado leva minutos; sem o limite estendido ele morre no meio da lista",
      },
    ],
  },
  {
    arquivo: "src/components/comunicados/comunicado-editor.tsx",
    porque: "é onde o operador vê o recorte antes de mandar",
    exige: [
      {
        trecho: "pelaMetade",
        motivo:
          "sem distinguir ENVIANDO de ENVIADO, um disparo que morreu no meio fica sem como continuar e metade da lista não recebe, em silêncio",
      },
      {
        trecho: "somenteComWhatsapp",
        motivo:
          "o filtro existe no backend; sem ele na tela, o contador promete gente que não tem o canal escolhido",
      },
      {
        trecho: "dados.usinas",
        motivo: "o recorte por usina geradora existe no backend e ficaria inalcançável",
      },
    ],
  },
];

/** Remove comentários: a guarda não pode ser satisfeita por quem só DOCUMENTA a regra. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Remove imports: um nome citado só no `import` não prova uso nenhum. */
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

for (const alvo of ALVOS) {
  if (!existsSync(alvo.arquivo)) {
    erros.push(`FALTA O ARQUIVO ${alvo.arquivo}\n  (${alvo.porque})`);
    continue;
  }
  const corpo = corpoSemImports(semComentarios(readFileSync(alvo.arquivo, "utf8")));
  for (const { trecho, motivo } of alvo.exige) {
    if (!corpo.includes(trecho)) {
      erros.push(`${alvo.arquivo} perdeu "${trecho}".\n  ${motivo}.`);
    }
  }
}

// ── 3. O índice único existe na migração ────────────────────────────────────
//
// 🔑 A trava de reenvio é do BANCO, não do código: o `try/catch` do disparo só
// funciona porque o índice recusa a segunda linha. Sem o índice, o catch nunca
// dispara e todo mundo recebe duas vezes.
const MIGRACAO = "prisma/migrations/20260906120000_comunicados/migration.sql";
if (!existsSync(MIGRACAO)) {
  erros.push(`FALTA a migração ${MIGRACAO} — sem ela as tabelas não existem em produção.`);
} else {
  const sql = readFileSync(MIGRACAO, "utf8");
  const temUnico =
    /CREATE\s+UNIQUE\s+INDEX[\s\S]*?comunicado_envios[\s\S]*?comunicado_id[\s\S]*?destinatario_tipo[\s\S]*?destinatario_id/i.test(
      sql,
    );
  if (!temUnico) {
    erros.push(
      "A migração não cria o índice ÚNICO (comunicado, tipo, destinatário) em `comunicado_envios`.\n" +
        "  É esse índice que impede o mesmo cliente de receber o comunicado duas vezes —\n" +
        "  o try/catch do disparo depende dele para funcionar.",
    );
  }
}

// ── 6. Os três pesos são REALMENTE diferentes, e nenhum quebra ──────────────
//
// 🪤 Um seletor de "peso da mensagem" que produz três emails idênticos é pior
// do que não existir: o operador escolhe, confia, e o cliente recebe sempre a
// mesma coisa. A guarda compara os HTMLs de verdade.
const htmls = TIPOS.map((t) => htmlComunicado("Assunto de teste", "Corpo de teste.", t));
if (new Set(htmls).size !== TIPOS.length) {
  erros.push(
    "Os tipos de comunicado produzem HTML IDÊNTICO.\n" +
      "  O seletor de peso na tela não mudaria nada no email que o cliente abre.",
  );
}
for (const rotulo of ["ATENÇÃO", "URGENTE"]) {
  const tipo = rotulo === "ATENÇÃO" ? "ATENCAO" : "URGENTE";
  const html = htmlComunicado("x", "y", tipo as (typeof TIPOS)[number]);
  if (!html.includes(rotulo)) {
    erros.push(`O email do tipo ${tipo} não traz o selo "${rotulo}".`);
  }
}
// Tipo estranho (migração antiga, escrita por outra via) cai no informativo em
// vez de gerar um email sem cor nenhuma — ou lançar no meio de um disparo.
const comLixo = htmlComunicado("x", "y", "TIPO_QUE_NAO_EXISTE" as (typeof TIPOS)[number]);
if (comLixo !== htmlComunicado("x", "y", "INFORMATIVO")) {
  erros.push(
    "Tipo desconhecido NÃO caiu em INFORMATIVO.\n" +
      "  Um valor inesperado no banco não pode mudar nem derrubar o email.",
  );
}

// ── 7. Os SETE desenhos são realmente diferentes entre si ───────────────────
//
// Mesmo teste da regra 6, no outro eixo. Um seletor com sete opções que geram o
// mesmo email é sete vezes pior do que um seletor de cor inútil.
const EXTRAS = {
  destaqueRotulo: "Reajuste da RGE",
  destaqueValor: "+8,4%",
  destaqueNota: "a partir de setembro",
  botaoTexto: "Ver a minha fatura",
  botaoUrl: "https://exemplo/fatura",
  botaoNota: "Abre a fatura do mês.",
};
const porDesenho = DESENHOS.map((d) =>
  htmlComunicado("Assunto", "Corpo do aviso.", "INFORMATIVO", d, EXTRAS),
);
if (new Set(porDesenho).size !== DESENHOS.length) {
  const repetidos = DESENHOS.filter((_, i) => porDesenho.indexOf(porDesenho[i]) !== i);
  erros.push(
    `Desenhos que produzem HTML IDÊNTICO a outro: ${repetidos.join(", ")}\n` +
      "  O seletor de desenho na tela não mudaria nada no email que o cliente abre.",
  );
}

// ── 8. Os dois desenhos com campo extra REALMENTE o usam ────────────────────
//
// 🪤 Um desenho que promete uma cifra e não a mostra é pior do que o padrão: o
// operador preenche o campo, confia, e o cliente recebe o email sem o número.
const comDestaque = htmlComunicado("A", "B", "INFORMATIVO", "DESTAQUE", EXTRAS);
if (!comDestaque.includes("+8,4%")) {
  erros.push("O desenho DESTAQUE não mostrou o valor em destaque no email.");
}
const comBotao = htmlComunicado("A", "B", "INFORMATIVO", "BOTAO", EXTRAS);
if (!comBotao.includes("Ver a minha fatura") || !comBotao.includes("https://exemplo/fatura")) {
  erros.push("O desenho BOTAO não montou o botão com o texto e o link.");
}
// Sem os campos o bloco SOME, em vez de sair vazio: caixa colorida sem número e
// botão sem destino são piores do que a ausência deles.
if (htmlComunicado("A", "B", "INFORMATIVO", "DESTAQUE", {}).includes("border-radius:8px")) {
  erros.push("DESTAQUE sem valor deixou a caixa vazia no email, em vez de omiti-la.");
}

// ── 9. Link de botão só pode ser http(s) ────────────────────────────────────
//
// 🔒 `javascript:` num href montado com texto do operador é a porta óbvia — e o
// email já saiu quando alguém percebe. A rota recusa; aqui se prova que recusa.
const rotaCriacao = readFileSync("src/app/api/admin/comunicados/route.ts", "utf8");
if (!rotaCriacao.includes("^https?:")) {
  erros.push(
    "A rota não valida o link do botão como http(s).\n" +
      "  Um `javascript:` digitado na tela viraria link executável no email de dezenas de pessoas.",
  );
}

// ── 10. CARTA ignora o peso, e isso é deliberado ────────────────────────────
//
// Se um dia ela passar a mudar com o peso, ou outro desenho passar a ignorá-lo,
// tem de ser decisão de desenho — não acidente de refactor.
if (!desenhoIgnoraPeso("CARTA")) {
  erros.push("CARTA deixou de ignorar o peso. Era deliberado: carta urgente vermelha é contradição.");
}
for (const d of DESENHOS) {
  const ignora = desenhoIgnoraPeso(d);
  const mudaComPeso =
    htmlComunicado("A", "B", "INFORMATIVO", d, EXTRAS) !==
    htmlComunicado("A", "B", "URGENTE", d, EXTRAS);
  if (ignora && mudaComPeso) {
    erros.push(`${d} deveria ignorar o peso, mas o email muda com ele.`);
  }
  if (!ignora && !mudaComPeso) {
    erros.push(
      `${d} NÃO muda quando o peso vai de informativo para urgente.\n` +
        "  O operador escolhe o peso, confia, e o cliente recebe sempre a mesma coisa.",
    );
  }
}

// ── 11. Um disparo pela metade PODE ser continuado ──────────────────────────
//
// 🪤 Com o WhatsApp espaçado, 75 pessoas levam uns dez minutos e o limite de
// execução é de cinco: o disparo morrer no meio não é hipótese remota, é o caso
// comum. Se `dispararComunicado` recusasse `ENVIANDO`, as pessoas que faltam
// nunca receberiam — e ninguém veria erro nenhum.
const motorEnvio = readFileSync("src/lib/comunicados-envio.ts", "utf8");
if (!motorEnvio.includes('status === "ENVIADO"')) {
  erros.push(
    "O disparo não recusa mais o comunicado já ENVIADO.\n" +
      "  Sem isso, reabrir um comunicado terminado tentaria mandar tudo de novo.",
  );
}
if (/status === "ENVIANDO"[\s\S]{0,120}throw/.test(motorEnvio)) {
  erros.push(
    "O disparo passou a RECUSAR um comunicado em ENVIANDO.\n" +
      "  É justamente o que morreu no meio: sem continuar, metade da lista fica sem a mensagem.",
  );
}

if (erros.length > 0) {
  console.error("\n[verifica-comunicados] FALHOU\n");
  for (const e of erros) console.error(`- ${e}\n`);
  console.error("Se a mudança foi intencional, atualize scripts/verifica-comunicados.ts junto.\n");
  process.exit(1);
}

console.log(
  `[verifica-comunicados] ok — ${RECUSAR.length + ACEITAR.length} endereços, ${DESENHOS.length} desenhos × ${TIPOS.length} pesos, ${ALVOS.length} arquivos e o índice de reenvio conferidos`,
);
