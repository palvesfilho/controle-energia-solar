"use client";

import { ProdutosCrm } from "@/components/crm/produtos-crm";

/**
 * De-para do CRM, entrada pelo módulo Brasil Solar.
 *
 * Mesma tela da rota `/admin/crm/produtos` — o de-para é único. Duas rotas
 * existem só para o sidebar não trocar de módulo no clique.
 */
export default function ProdutosCrmBrasilSolarPage() {
  return <ProdutosCrm />;
}
