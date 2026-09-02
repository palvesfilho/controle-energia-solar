/**
 * Protege a leitura do status do protocolo na RGE — e, com ela, o ACEITE
 * AUTOMÁTICO do rateio.
 *
 * Por que uma guarda de build e não só um teste: quando o robô lê o status
 * errado, nada quebra na hora. O rateio da usina troca sozinho, o crédito passa
 * a ser distribuído por percentuais que a concessionária não aprovou, e isso só
 * aparece na fatura do cliente semanas depois. É o mesmo desenho de
 * `verifica-trava-faturamento.ts`: o efeito de afrouxar a regra é invisível no
 * dia em que se afrouxa.
 *
 * As três coisas que este script não deixa passar:
 *   1. aceite automático fora de VALIDADO;
 *   2. status conhecido da CPFL virando DESCONHECIDO (ou pior, VALIDADO);
 *   3. "0" e afins voltando a ser aceitos como protocolo.
 *
 * Rodar:  npx tsx scripts/verifica-rge-protocolo.ts
 */
import {
  SituacaoProtocolo,
  aceiteAutomaticoPermitido,
  periodosDaBusca,
  protocoloConsultavel,
  protocoloDegenerado,
  situacaoDoStatusRge,
} from "../src/lib/rge-protocolo";

const erros: string[] = [];

function checa(condicao: boolean, mensagem: string) {
  if (!condicao) erros.push(mensagem);
}

// ── 1. Aceite automático: whitelist de UM valor ─────────────────────────────
const TODAS: SituacaoProtocolo[] = [
  "VALIDADO",
  "EM_ANDAMENTO",
  "REJEITADO",
  "NAO_ENCONTRADO",
  "DESCONHECIDO",
  "SEM_CREDENCIAL",
  "PROTOCOLO_INVALIDO",
  "FORA_DA_RGE",
  "ERRO",
];
for (const s of TODAS) {
  const esperado = s === "VALIDADO";
  checa(
    aceiteAutomaticoPermitido(s) === esperado,
    `aceite automático em "${s}" deveria ser ${esperado}. Só VALIDADO pode ` +
      `promover um rateio a VIGENTE sozinho.`,
  );
}

// ── 2. Os status que a CPFL realmente devolve ───────────────────────────────
// Os valores de `StatusFiltro` do AngularJS da CPFL, lidos do ng-class da linha
// do tempo pelo robô do Joel, mais as grafias do badge do cartão.
const CASOS: Array<[string, SituacaoProtocolo]> = [
  ["Finalizada", "VALIDADO"],
  ["Concluída", "VALIDADO"],
  ["CONCLUIDO", "VALIDADO"],
  ["Atendida", "VALIDADO"],
  ["EmAberto", "EM_ANDAMENTO"],
  ["Em aberto", "EM_ANDAMENTO"],
  ["Em análise", "EM_ANDAMENTO"],
  ["Atraso", "EM_ANDAMENTO"],
  ["Rejeitada", "REJEITADO"],
  ["Cancelada", "REJEITADO"],
  ["Indeferido", "REJEITADO"],
  // O que não conhecemos NÃO pode virar palpite — e muito menos VALIDADO.
  ["Aguardando vistoria do cliente XPTO", "EM_ANDAMENTO"],
  ["Status novo que a CPFL inventou", "DESCONHECIDO"],
  ["", "DESCONHECIDO"],
];
for (const [texto, esperado] of CASOS) {
  const obtido = situacaoDoStatusRge(texto);
  checa(
    obtido === esperado,
    `situacaoDoStatusRge("${texto}") deu "${obtido}", esperava "${esperado}".`,
  );
}

// ── 3. O protocolo de fuga ──────────────────────────────────────────────────
// Em 22/08/2026 dois rateios entraram com protocolo "0" só para escapar da
// obrigatoriedade do campo. São exatamente os que a RGE não tem como procurar.
for (const lixo of ["0", "00", "0000000000", "", "   ", "abc"]) {
  checa(
    protocoloDegenerado(lixo),
    `"${lixo}" deveria ser recusado no cadastro (protocoloDegenerado).`,
  );
  checa(
    !protocoloConsultavel(lixo),
    `"${lixo}" não pode ser dado como consultável na RGE.`,
  );
}
// Os 5 protocolos reais do banco em 02/09/2026 — o formato que tem de passar.
for (const real of [
  "2206638554",
  "2196979342",
  "2206568035",
  "2206601932",
  "2206563232",
]) {
  checa(!protocoloDegenerado(real), `o protocolo real ${real} foi recusado no cadastro.`);
  checa(protocoloConsultavel(real), `o protocolo real ${real} não foi dado como consultável.`);
}

// ── 4. A janela de meses ────────────────────────────────────────────────────
// 🔴 O filtro da CPFL é pelo mês em que o PEDIDO FOI ABERTO, não "pedidos em
// aberto naquele mês". Olhar só o mês corrente perde todo pedido antigo que
// continua tramitando — foi o falso negativo de 17/08/2026 no robô.
const meses = periodosDaBusca(new Date(2026, 6, 10), new Date(2026, 8, 2));
checa(
  meses.includes("07/2026"),
  `a janela precisa conter o mês da criação do rateio (07/2026); veio [${meses.join(", ")}].`,
);
checa(
  meses.includes("09/2026"),
  `a janela precisa chegar até o mês corrente (09/2026); veio [${meses.join(", ")}].`,
);
checa(
  meses.includes("06/2026"),
  `a janela precisa incluir o mês anterior à criação (06/2026), para o caso de ` +
    `o operador registrar o protocolo com atraso; veio [${meses.join(", ")}].`,
);
checa(
  periodosDaBusca(new Date(2026, 11, 1), new Date(2026, 8, 2)).length > 0,
  "rateio agendado para o futuro não pode gerar janela vazia — o robô buscaria nada.",
);

if (erros.length) {
  console.error("\n✗ verifica-rge-protocolo — a leitura do status da RGE saiu do lugar:\n");
  for (const e of erros) console.error("  - " + e);
  console.error(
    "\nAntes de ajustar o script, confirme com o portal da CPFL o que o status " +
      "realmente significa. Aceite automático é troca de rateio vigente.\n",
  );
  process.exit(1);
}

console.log(
  `✓ verifica-rge-protocolo: ${TODAS.length} situações, ${CASOS.length} status da CPFL e a janela de meses conferidos.`,
);
