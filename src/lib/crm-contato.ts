/**
 * Contato do cliente vindo da adesão assinada no CRM → cadastro daqui.
 *
 * 🔑 **O buraco que isto fecha.** O email e o telefone do cliente nascem no
 * gerador de propostas, viajam no sync (`CrmUcImportada.clienteEmail` /
 * `clienteTelefone`) e são até EXIBIDOS na fila do CRM — mas nunca eram
 * gravados no `Consumer`. O formulário de UC só *escolhe* um cliente já
 * cadastrado, e a rota `vincular` copiava apenas documentos. Medido em
 * 06/09/2026: dos 43 clientes da Associação sem telefone, 19 tinham o número
 * parado na adesão; e os 16 que não tinham contato NENHUM tinham os dois lá.
 *
 * Agora quem faz o transporte é este par de módulos, chamado de dois lugares:
 *   - `POST /api/crm/ucs/[id]/vincular` — no ato do cadastro, daqui pra frente;
 *   - `scripts/backfill-contatos-crm.ts` — o retroativo, para quem já entrou.
 *
 * ⚠️ **Este arquivo não importa NADA de servidor — nem `@/lib/prisma`, nem
 * `uc-trava-contato` (que importa prisma).** A fila do CRM e a tela de nova UC
 * são `"use client"` e consomem `frasePreenchimentoContato` daqui; qualquer um
 * dos dois arrastaria o cliente do banco para o bundle do navegador. Foi por
 * isso que a fila já tinha um `formatarTelefone` local em vez de reusar o da
 * trava. O que valida telefone e o que escreve moram em
 * `crm-contato-cadastro.ts`.
 *
 * 📏 **Só preenche o que está VAZIO.** Nunca sobrescreve contato existente: a
 * TONETO tem `financeiro@tonetoempreendimentos.com` no cadastro e `vendas@...`
 * na adesão. O do cadastro é o certo para cobrança, e foi alguém que o
 * escolheu — a adesão não tem autoridade para desfazer isso.
 *
 * 🚫 **Telefone inválido não vira cadastro.** Fixo, DDD inexistente ou dígito
 * a menos são recusados aqui e não no envio: gravar um número que a Uazapi vai
 * rejeitar troca "sem telefone" (que a trava mostra) por "telefone que não
 * funciona" (que ninguém vê até a cobrança sair muda).
 */
/** Mesma limpeza usada no resto da integração do CRM. */
export function apenasDigitos(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\D/g, "") : "";
}

/**
 * Frase do que a vinculação aproveitou do contato da adesão. Null quando o
 * cliente já tinha tudo — nesse caso não há o que anunciar.
 *
 * Existe porque o preenchimento é silencioso por natureza: sem isto, ninguém
 * saberia que o telefone da cobrança acabou de entrar no cadastro.
 */
export function frasePreenchimentoContato(contato?: {
  emailGravado?: string | null;
  telefoneGravado?: string | null;
} | null): string | null {
  if (!contato) return null;
  const partes: string[] = [];
  if (contato.emailGravado) partes.push(`email ${contato.emailGravado}`);
  if (contato.telefoneGravado) partes.push(`telefone ${contato.telefoneGravado}`);
  if (partes.length === 0) return null;
  return `Contato da adesão gravado no cliente: ${partes.join(" e ")}.`;
}
