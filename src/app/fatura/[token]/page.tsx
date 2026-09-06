/**
 * /fatura/<tokenPublico> — página PÚBLICA da fatura de energia.
 *
 * É o link que vai no email e no WhatsApp da cobrança. Fica fora do
 * `isProtected` do `proxy.ts` de propósito: o pagador não tem conta.
 *
 * A primeira leitura acontece no servidor para a página já nascer com valor e
 * vencimento — quem abre um link de cobrança no celular não deve encarar um
 * esqueleto carregando antes de saber quanto deve.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFaturaView } from "@/lib/fatura-publica";
import { descricaoNegocio, emailSuporte, nomeRemetente } from "@/lib/identidade-remetente";
import { LOGO_EMPRESA_PATH } from "@/lib/logo-empresa";
import FaturaPublicaView from "@/components/billing/fatura-publica-view";

// Cobrança muda de situação a qualquer momento (o cliente pode ter pago há um
// minuto). Nada aqui pode ser servido de cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sua fatura de energia",
  // Link de cobrança não pode ser indexado: a URL É a credencial.
  robots: { index: false, follow: false },
};

export default async function FaturaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await getFaturaView(token);
  if (!view) notFound();

  return (
    <FaturaPublicaView
      token={token}
      inicial={view}
      empresa={nomeRemetente()}
      suporte={emailSuporte()}
      descricao={descricaoNegocio()}
      logo={LOGO_EMPRESA_PATH}
    />
  );
}
