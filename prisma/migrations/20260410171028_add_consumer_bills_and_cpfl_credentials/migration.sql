-- AlterTable
ALTER TABLE "plants" ADD COLUMN "inversor_marca" TEXT;
ALTER TABLE "plants" ADD COLUMN "inversor_modelo" TEXT;
ALTER TABLE "plants" ADD COLUMN "monitoramento_login" TEXT;
ALTER TABLE "plants" ADD COLUMN "monitoramento_plataforma" TEXT;
ALTER TABLE "plants" ADD COLUMN "monitoramento_senha" TEXT;
ALTER TABLE "plants" ADD COLUMN "monitoramento_url" TEXT;

-- CreateTable
CREATE TABLE "consumer_bills" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consumer_id" TEXT NOT NULL,
    "plant_id" TEXT,
    "mes_referencia" INTEGER NOT NULL,
    "ano_referencia" INTEGER NOT NULL,
    "instalacao" TEXT,
    "valor_total" REAL,
    "vencimento" DATETIME,
    "conta_paga" BOOLEAN NOT NULL DEFAULT false,
    "codigo_barras" TEXT,
    "consumo_kwh" REAL,
    "leitura_anterior" REAL,
    "leitura_atual" REAL,
    "dias_faturamento" INTEGER,
    "energia_injetada" REAL,
    "energia_compensada" REAL,
    "saldo_creditos" REAL,
    "tarifa_te" REAL,
    "tarifa_tusd" REAL,
    "bandeira_tarifaria" TEXT,
    "icms" REAL,
    "pis" REAL,
    "cofins" REAL,
    "fonte_consulta" TEXT,
    "pdf_url" TEXT,
    "raw_json" TEXT,
    "synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "consumer_bills_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consumer_bills_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cpfl_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consumer_id" TEXT NOT NULL,
    "email_cpfl" TEXT NOT NULL,
    "senha_cpfl" TEXT NOT NULL,
    "instalacao" TEXT NOT NULL,
    "distribuidora" TEXT NOT NULL DEFAULT 'RGE',
    "ultima_sync" DATETIME,
    "status_sync" TEXT,
    "erro_sync" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "cpfl_credentials_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "consumer_bills_consumer_id_ano_referencia_idx" ON "consumer_bills"("consumer_id", "ano_referencia");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_bills_consumer_id_ano_referencia_mes_referencia_key" ON "consumer_bills"("consumer_id", "ano_referencia", "mes_referencia");

-- CreateIndex
CREATE UNIQUE INDEX "cpfl_credentials_consumer_id_key" ON "cpfl_credentials"("consumer_id");
