"use client";

import { ProdutosCrm } from "@/components/crm/produtos-crm";

/**
 * De-para produto do CRM → destino no Gestor.
 *
 * Mora em Personalizações desde 15/08/2026, a pedido do Paulo: é configuração,
 * não fila de trabalho. Antes eram duas rotas espelhadas (uma por módulo), só
 * para o sidebar não trocar de módulo no clique; o hub é único e resolve isso.
 */
export default function ProdutosCrmPersonalizacoesPage() {
  return <ProdutosCrm />;
}
