import ListaMateriaisClient from "./lista-materiais-client";

export default async function ListaMateriaisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ListaMateriaisClient obraId={id} />;
}
