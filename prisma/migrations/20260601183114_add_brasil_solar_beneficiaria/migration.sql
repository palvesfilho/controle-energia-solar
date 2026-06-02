-- CreateTable
CREATE TABLE "brasil_solar_beneficiarias" (
    "id" TEXT NOT NULL,
    "proprietario_id" TEXT NOT NULL,
    "codigo_uc" TEXT NOT NULL,
    "nome" TEXT,
    "percentual" DOUBLE PRECISION NOT NULL,
    "observacoes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brasil_solar_beneficiarias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brasil_solar_beneficiarias_proprietario_id_idx" ON "brasil_solar_beneficiarias"("proprietario_id");

-- CreateIndex
CREATE INDEX "brasil_solar_beneficiarias_codigo_uc_idx" ON "brasil_solar_beneficiarias"("codigo_uc");

-- CreateIndex
CREATE UNIQUE INDEX "brasil_solar_beneficiarias_proprietario_id_codigo_uc_key" ON "brasil_solar_beneficiarias"("proprietario_id", "codigo_uc");

-- AddForeignKey
ALTER TABLE "brasil_solar_beneficiarias" ADD CONSTRAINT "brasil_solar_beneficiarias_proprietario_id_fkey" FOREIGN KEY ("proprietario_id") REFERENCES "brasil_solar_proprietarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
