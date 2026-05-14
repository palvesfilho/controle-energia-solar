/**
 * Tipos compartilhados pra erros ativos reportados pelas APIs dos fabricantes.
 *
 * Cada client (fronius/solaredge/sungrow/huawei) expõe `getActiveAlerts(plantId)`
 * que devolve `InverterErrorEvent[]`. O sync/alerts consome essa lista pra criar
 * MonitoringAlert tipo ERRO_INVERSOR com codigoErroFabricante populado.
 */

export interface InverterErrorEvent {
  /** Código do erro reportado pelo fabricante (ex.: "103", "0x3A", "ALM-2031"). */
  codigo: string;
  /** Texto descritivo do erro vindo da API (quando disponível). */
  descricao: string | null;
  /** Severidade reportada pelo próprio fabricante (quando disponível). */
  severidadeFabricante: string | null;
  /** Data de abertura do evento (ISO). */
  abertoEm: Date | null;
  /** Identificador único do evento na origem (pra dedup quando disponível). */
  externalId: string | null;
}
