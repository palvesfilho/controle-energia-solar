"use client";

import { useParams } from "next/navigation";
import { PlantBillingDetail } from "@/components/billing/plant-billing-detail";

/**
 * Rota antiga do detalhe de faturamento da usina. O conteúdo vive em
 * <PlantBillingDetail /> porque a tela nova (/admin/faturamento/usinas)
 * embute o mesmo componente embaixo da régua de meses. Esta rota continua
 * valendo pros links já salvos por aí.
 */
export default function FaturamentoUsinaDetalhePage() {
  const params = useParams();
  const mesParam = params.mes as string;
  const id = params.id as string;

  return <PlantBillingDetail billingId={id} mesParam={mesParam} />;
}
