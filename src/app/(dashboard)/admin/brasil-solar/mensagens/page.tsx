"use client";

import { MensagensPainel } from "@/components/mensagens/mensagens-painel";

/**
 * Módulo MENSAGENS — campanhas para a base de clientes da Rede Brasil Solar.
 *
 * Mora sob `/admin/brasil-solar/` porque `detectAdminModule` lê o PATH: uma
 * rota fora daqui trocaria o sidebar para o da Associação no meio da campanha.
 * O público também é daqui — quem tem app, portal e usina é o cliente BS.
 */
export default function MensagensPage() {
  return <MensagensPainel />;
}
