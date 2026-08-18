import { CampanhaDetalhe } from "@/components/mensagens/campanha-detalhe";

export default async function CampanhaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CampanhaDetalhe campanhaId={id} />;
}
