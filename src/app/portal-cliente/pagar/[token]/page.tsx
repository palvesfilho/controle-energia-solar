import { notFound } from "next/navigation";
import { getCobrancaView } from "@/lib/portal-cobranca";
import PagamentoBranded from "@/components/brasil-solar/pagamento-branded";

// Página PÚBLICA de pagamento branded (ver proxy.ts: /portal-cliente/pagar é
// liberada, pois o pagador ainda não tem conta). Chave = conviteToken.
export const dynamic = "force-dynamic";

export default async function PagarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await getCobrancaView(token);
  if (!view) notFound();

  return <PagamentoBranded token={token} inicial={view} />;
}
