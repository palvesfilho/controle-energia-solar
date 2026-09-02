/**
 * Impede que a TRAVA DE FATURAMENTO seja removida sem querer.
 *
 * A regra que este script existe para proteger: **UC que nunca teve fatura com
 * compensacao nao pode ser cobrada**. Ate 02/09/2026 a separacao
 * "Em implantacao x Faturando" era so visual — marcava a linha e tocava o sino,
 * mas nada impedia validar o demonstrativo e emitir boleto real no Asaas para
 * uma UC que ainda nao recebeu abatimento nenhum.
 *
 * Por que uma guarda e nao so um teste: a trava e uma linha de guarda no meio
 * de funcoes grandes (`emitBillingToAsaas` tem ~200 linhas). Quem refatora nao
 * quebra nada visivel ao remove-la — o efeito e uma cobranca indevida, semanas
 * depois, no boleto de um cliente. Mesmo desenho de `verifica-origem-uc.ts`.
 *
 * O que e exigido de cada arquivo esta em ALVOS. Se um caminho novo de emissao
 * aparecer, ele entra aqui.
 *
 * Rodar:  npx tsx scripts/verifica-trava-faturamento.ts
 */
import { readFileSync, existsSync } from "node:fs";

interface Alvo {
  arquivo: string;
  /** Por que este arquivo precisa da trava. Sai na mensagem de erro. */
  porque: string;
  /** Todos precisam aparecer no texto do arquivo. */
  exige: string[];
}

const ALVOS: Alvo[] = [
  {
    arquivo: "src/lib/uc-trava-faturamento.ts",
    porque:
      "e o modulo da trava — sem ele nao ha regra nenhuma para os outros chamarem",
    exige: ["ucJaCompensou", "ucsQueJaCompensaram", "FATURA_COMPENSADA"],
  },
  {
    arquivo: "src/lib/billing-asaas.ts",
    porque:
      "e o ponto UNICO por onde passam a emissao avulsa, o lote e o pipeline do demonstrativo",
    exige: ["ucJaCompensou", "SKIP_SEM_COMPENSACAO"],
  },
  {
    arquivo: "src/lib/emit-cobranca.ts",
    porque:
      "e o pipeline do demonstrativo — a recusa precisa chegar antes de qualquer ida ao Asaas",
    exige: ["ucJaCompensou", "MENSAGEM_SEM_COMPENSACAO"],
  },
  {
    arquivo:
      "src/app/api/admin/faturamento/unidades-consumidoras/[id]/validar-demonstrativo/route.ts",
    porque:
      "validar e o gesto que ACENDE o botao 'Realizar Cobranca' — deixar validar e prometer uma cobranca que a emissao recusa",
    exige: ["ucJaCompensou", "MENSAGEM_SEM_COMPENSACAO"],
  },
  {
    arquivo: "src/app/api/billing/consumer-units/route.ts",
    porque:
      "alimenta a tela do mes — sem `emImplantacao` o botao fica aceso e o operador clica pra ouvir 'nao'",
    exige: ["ucsQueJaCompensaram", "emImplantacao"],
  },
  {
    arquivo:
      "src/app/(dashboard)/admin/faturamento/unidades-consumidoras/[mes]/page.tsx",
    porque:
      "e a tela onde a cobranca acontece — a UC travada tem que ficar visivelmente travada",
    exige: ["emImplantacao", "travadoPorImplantacao"],
  },
];

/**
 * A regra de "compensou" e UMA so: `FATURA_COMPENSADA` / `faturaTemCompensacao`
 * em lib/uc-implantacao.ts. Se a trava passar a olhar so `energiaCompensada`,
 * UC que compensa por `injetadaOuc*` (Grupo A, que injeta em ponta e fora ponta
 * separados) seria barrada de cobrar, calada.
 */
const TRES_CAMPOS = ["energiaCompensada", "injetadaOucTeKwh", "injetadaOucTusdKwh"];

const falhas: string[] = [];

for (const alvo of ALVOS) {
  if (!existsSync(alvo.arquivo)) {
    falhas.push(`FALTA O ARQUIVO  ${alvo.arquivo}\n    ${alvo.porque}`);
    continue;
  }
  const texto = readFileSync(alvo.arquivo, "utf8");
  const faltando = alvo.exige.filter((termo) => !texto.includes(termo));
  if (faltando.length > 0) {
    falhas.push(
      `${alvo.arquivo}\n    ${alvo.porque}\n    nao encontrei: ${faltando.join(", ")}`,
    );
  }
}

// A regra dos 3 campos vive em uc-implantacao.ts e a trava a importa de la.
const implantacao = existsSync("src/lib/uc-implantacao.ts")
  ? readFileSync("src/lib/uc-implantacao.ts", "utf8")
  : "";
const semCampo = TRES_CAMPOS.filter((c) => !implantacao.includes(c));
if (semCampo.length > 0) {
  falhas.push(
    `src/lib/uc-implantacao.ts\n    FATURA_COMPENSADA precisa olhar os 3 campos (Grupo A injeta em ponta e fora ponta separados)\n    nao encontrei: ${semCampo.join(", ")}`,
  );
}

if (falhas.length > 0) {
  console.error("\n❌ TRAVA DE FATURAMENTO incompleta — UC sem compensacao poderia ser cobrada:\n");
  for (const f of falhas) console.error(`  ${f}\n`);
  console.error("  Detalhe da regra: src/lib/uc-trava-faturamento.ts\n");
  process.exit(1);
}

console.log(`✅ trava de faturamento: ${ALVOS.length} pontos com a trava no lugar`);
