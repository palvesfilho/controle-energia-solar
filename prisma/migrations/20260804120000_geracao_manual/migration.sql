-- Lançamento manual de geração, para usina cuja plataforma de monitoramento
-- ainda não integra. O total mensal declarado fica em manual_generation_entries
-- (auditoria) e é rateado em linhas diárias de monitoring_logs com
-- origem = 'MANUAL' — é de lá que todos os relatórios somam geração.
--
-- Backfill: tudo que já existe veio de sync, logo origem = 'API' (o default).
ALTER TABLE "monitoring_logs"
  ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'API';

CREATE TABLE "manual_generation_entries" (
  "id"             TEXT NOT NULL,
  "client_id"      TEXT NOT NULL,
  "ano"            INTEGER NOT NULL,
  "mes"            INTEGER NOT NULL,
  "kwh_total"      DOUBLE PRECISION NOT NULL,
  "kwh_rateado"    DOUBLE PRECISION NOT NULL,
  "dias_rateados"  INTEGER NOT NULL,
  "fonte"          TEXT,
  "observacao"     TEXT,
  "registrado_por" TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "manual_generation_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manual_generation_entries_client_id_ano_mes_key"
  ON "manual_generation_entries" ("client_id", "ano", "mes");

CREATE INDEX "manual_generation_entries_ano_mes_idx"
  ON "manual_generation_entries" ("ano", "mes");

ALTER TABLE "manual_generation_entries"
  ADD CONSTRAINT "manual_generation_entries_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "brasil_solar_clients" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
