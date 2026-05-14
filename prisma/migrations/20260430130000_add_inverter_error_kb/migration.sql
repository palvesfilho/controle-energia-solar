-- Base de conhecimento de códigos de erro por fabricante de inversor.

-- Código + descrição
CREATE TABLE "inverter_error_codes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fabricante" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "severidade_sugerida" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "inverter_error_codes_fabricante_codigo_key"
  ON "inverter_error_codes"("fabricante", "codigo");
CREATE INDEX "inverter_error_codes_fabricante_idx"
  ON "inverter_error_codes"("fabricante");

-- Ações sugeridas pra cada código (ordenadas)
CREATE TABLE "inverter_error_actions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "error_code_id" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL,
  "descricao" TEXT NOT NULL,
  "acao_requerida" TEXT,
  CONSTRAINT "inverter_error_actions_error_code_id_fkey"
    FOREIGN KEY ("error_code_id") REFERENCES "inverter_error_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "inverter_error_actions_error_code_id_ordem_key"
  ON "inverter_error_actions"("error_code_id", "ordem");
CREATE INDEX "inverter_error_actions_error_code_id_idx"
  ON "inverter_error_actions"("error_code_id");

-- Campo no alerta pra guardar o código que o operador digitou.
ALTER TABLE "monitoring_alerts"
  ADD COLUMN "codigo_erro_fabricante" TEXT;
