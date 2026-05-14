-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'INVESTOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "investors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "phone" TEXT,
    "document" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "investors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "plants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "potencia_modulos" REAL,
    "potencia_inversor" REAL,
    "geracao_media_mensal" REAL,
    "enquadramento" TEXT,
    "unidade_consumidora" TEXT,
    "concessionaria" TEXT,
    "formato_leitura" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "investor_plants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investor_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "share_percent" REAL,
    "valor_kwh_contrato" REAL,
    "gestao_fixa_contrato" REAL,
    CONSTRAINT "investor_plants_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "investor_plants_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plant_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "numero_relatorio" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "injecao_periodo" REAL,
    "creditos_anteriores" REAL,
    "creditos_utilizados" REAL,
    "consumo_instantaneo" REAL,
    "auto_consumo_usina" REAL,
    "creditos_atuais" REAL,
    "creditos_vencer" REAL,
    "creditos_utilizados_fin" REAL,
    "valor_kwh_contrato" REAL,
    "valor_bruto_gerador" REAL,
    "gestao_mensal_fixa" REAL,
    "taxa_minima_conc" REAL,
    "inadimplencia" REAL,
    "multas_outros" REAL,
    "remuneracao_periodo" REAL,
    "observacoes" TEXT,
    "ai_analysis" TEXT,
    "ai_validation_status" TEXT,
    "upload_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "published_at" DATETIME,
    CONSTRAINT "monthly_reports_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "monthly_reports_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "monthly_reports_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "plant_monthly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plant_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "geracao_total" REAL,
    "injecao_total" REAL,
    "auto_consumo" REAL,
    "disponibilidade" REAL,
    "observacoes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "plant_monthly_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "consumer_monthly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consumer_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "consumo_total" REAL,
    "creditos_recebidos" REAL,
    "creditos_utilizados" REAL,
    "saldo_creditos" REAL,
    "economia_gerada" REAL,
    "observacoes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "consumer_monthly_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "consumer_monthly_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "consumers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "document" TEXT,
    "endereco" TEXT,
    "unidade_consumidora" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "consumer_plants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consumer_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "cota_percent" REAL,
    "desconto_percent" REAL,
    CONSTRAINT "consumer_plants_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consumer_plants_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "processed_at" DATETIME,
    "processing_error" TEXT,
    "raw_data" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uploads_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "investors_user_id_key" ON "investors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_plants_investor_id_plant_id_key" ON "investor_plants"("investor_id", "plant_id");

-- CreateIndex
CREATE INDEX "monthly_reports_investor_id_ano_mes_idx" ON "monthly_reports"("investor_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reports_plant_id_investor_id_ano_mes_key" ON "monthly_reports"("plant_id", "investor_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "plant_monthly_plant_id_ano_mes_key" ON "plant_monthly"("plant_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_monthly_consumer_id_plant_id_ano_mes_key" ON "consumer_monthly"("consumer_id", "plant_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_plants_consumer_id_plant_id_key" ON "consumer_plants"("consumer_id", "plant_id");
