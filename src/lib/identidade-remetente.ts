/**
 * COMO A EMPRESA SE APRESENTA AO CLIENTE — nome, email de contato, descrição.
 *
 * 🔑 **Por que virou um módulo só.** Até 06/09/2026 o endereço de contato
 * `sac@redebrasilsolar.com.br` estava escrito à mão em quatro lugares (dois
 * PDFs, o template de email e o do WhatsApp). Aí descobriu-se que **esse
 * endereço nunca existiu** — o que significa que todo demonstrativo já emitido
 * mandava o cliente escrever para uma caixa inexistente, e ninguém percebeu
 * porque email para endereço que não existe volta para o REMETENTE, não para
 * nós.
 *
 * Trocar um endereço em quatro arquivos é o tipo de tarefa em que se esquece o
 * quarto. Agora é um lugar só, com a variável de ambiente por cima.
 *
 * ⚠️ Isto é o que o CLIENTE lê. Não confundir com `GOOGLE_SMTP_USER`, que é a
 * conta que AUTENTICA no servidor — pode ser a mesma, mas são perguntas
 * diferentes (o remetente pode ser um alias da conta que autentica).
 */

/** Nome da empresa como assina email, WhatsApp e PDF. */
export function nomeRemetente(): string {
  return process.env.NOTIFICACAO_REMETENTE_NOME || "Associação de Energia Brasil Solar";
}

/** Endereço para onde o cliente responde / escreve com dúvida. */
export function emailSuporte(): string {
  return process.env.NOTIFICACAO_EMAIL_SUPORTE || "gestao@abrasilsolar.com.br";
}

/** Linha de apoio abaixo do nome, nos cabeçalhos de PDF. */
export function descricaoNegocio(): string {
  return process.env.NOTIFICACAO_DESCRICAO || "Aluguel de usinas fotovoltaicas";
}
