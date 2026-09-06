/**
 * Escrita do contato da adesão no cadastro — a metade de `crm-contato.ts` que
 * toca o banco. Separada porque aquele arquivo é importado por componentes
 * `"use client"`, e prisma não pode entrar no bundle do navegador.
 *
 * 📏 **Só preenche o que está VAZIO.** Nunca sobrescreve contato existente: a
 * TONETO tem `financeiro@tonetoempreendimentos.com` no cadastro e `vendas@...`
 * na adesão. O do cadastro é o certo para cobrança, e foi alguém que o
 * escolheu — a adesão não tem autoridade para desfazer isso.
 */
import { prisma } from "@/lib/prisma";
import { normalizarTelefoneBR } from "@/lib/uc-trava-contato";
import { apenasDigitos } from "@/lib/crm-contato";

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export interface ContatoDaAdesao {
  email: string | null;
  /** Só dígitos, no formato do resto da tabela (DDD + número, sem DDI). */
  telefone: string | null;
}

/**
 * Filtra o que da adesão é aproveitável.
 *
 * O telefone é validado por `normalizarTelefoneBR` mas **guardado em dígitos
 * crus**, e não em E.164: os ~60 cadastros que já existem estão assim
 * (`55999194245`), e o normalizador lê os dois formatos. Gravar E.164 aqui
 * criaria duas convenções na mesma coluna sem ninguém pedir.
 */
export function contatoUtilizavelDaAdesao(
  email?: string | null,
  telefone?: string | null,
): ContatoDaAdesao {
  const e = (email ?? "").trim().toLowerCase();
  const d = apenasDigitos(telefone);
  return {
    email: e && EMAIL_RE.test(e) ? e : null,
    telefone: d && normalizarTelefoneBR(d).e164 ? d : null,
  };
}

export interface ContatoPreenchido {
  emailGravado: string | null;
  telefoneGravado: string | null;
}

const NADA: ContatoPreenchido = { emailGravado: null, telefoneGravado: null };

/**
 * Preenche os campos VAZIOS do cliente com o contato da adesão.
 *
 * Devolve o que efetivamente entrou — a rota usa isso para dizer ao operador o
 * que foi aproveitado, em vez de fazer em silêncio.
 */
export async function preencherContatoDoConsumer(
  consumerId: string,
  contato: ContatoDaAdesao,
): Promise<ContatoPreenchido> {
  if (!contato.email && !contato.telefone) return NADA;

  const atual = await prisma.consumer.findUnique({
    where: { id: consumerId },
    select: { email: true, phone: true },
  });
  if (!atual) return NADA;

  const data: { email?: string; phone?: string } = {};
  if (contato.email && !(atual.email ?? "").trim()) data.email = contato.email;
  // Telefone que está lá mas é INVÁLIDO também é substituído: ele não serve
  // para nada e é a única forma de o cadastro sair do bloqueio da trava.
  if (contato.telefone && !normalizarTelefoneBR(atual.phone).e164) data.phone = contato.telefone;

  if (!data.email && !data.phone) return NADA;
  await prisma.consumer.update({ where: { id: consumerId }, data });
  return { emailGravado: data.email ?? null, telefoneGravado: data.phone ?? null };
}

/**
 * Mesma ideia para o investidor, que entra pela outra ponta da fila do CRM —
 * mas só o TELEFONE.
 *
 * O email do investidor não mora no `Investor`: mora no `User` ligado a ele, é
 * obrigatório e único, e a tela `/admin/investidores/novo` já o pré-preenche a
 * partir de `clienteEmail` da adesão. Quem entra por ali nunca fica sem email;
 * o telefone é que não era pedido em lugar nenhum.
 */
export async function preencherContatoDoInvestidor(
  investorId: string,
  contato: ContatoDaAdesao,
): Promise<ContatoPreenchido> {
  if (!contato.telefone) return NADA;

  const atual = await prisma.investor.findUnique({
    where: { id: investorId },
    select: { phone: true },
  });
  if (!atual) return NADA;
  if (normalizarTelefoneBR(atual.phone).e164) return NADA;

  await prisma.investor.update({ where: { id: investorId }, data: { phone: contato.telefone } });
  return { emailGravado: null, telefoneGravado: contato.telefone };
}
