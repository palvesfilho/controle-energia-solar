-- Economia mensal herdada do Lumi (até nov/2026). Só CREATE TABLE: não mexe
-- em dado nenhum das cobranças existentes.
CREATE TABLE "economia_historica_lumi" (
    "id" TEXT NOT NULL,
    "consumer_unit_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor_economia" DOUBLE PRECISION NOT NULL,
    "valor_devido" DOUBLE PRECISION,
    "codigo_uc_lumi" TEXT NOT NULL,
    "nome_uc_lumi" TEXT,
    "arquivo_origem" TEXT,
    "importado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "economia_historica_lumi_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "economia_historica_lumi_consumer_unit_id_ano_mes_key" ON "economia_historica_lumi"("consumer_unit_id", "ano", "mes");

ALTER TABLE "economia_historica_lumi" ADD CONSTRAINT "economia_historica_lumi_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
