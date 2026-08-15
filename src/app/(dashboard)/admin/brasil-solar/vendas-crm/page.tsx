"use client";

import { FilaCrm } from "@/components/crm/fila-crm";

/**
 * Fila do CRM no módulo Brasil Solar: monitoramento e produto sem de-para.
 *
 * Mora sob `/admin/brasil-solar/` de propósito — é o path que faz
 * `detectAdminModule` manter o sidebar da Brasil Solar. Ver [[fila-crm]].
 */
export default function FilaCrmBrasilSolarPage() {
  return <FilaCrm modulo="bs" />;
}
