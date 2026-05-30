-- CreateTable
CREATE TABLE "consumo_baseline" (
    "id" TEXT NOT NULL,
    "consumer_unit_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "observacao" TEXT,
    "valido_ate_mes" INTEGER NOT NULL,
    "valido_ate_ano" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por_user_id" TEXT,

    CONSTRAINT "consumo_baseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumo_baseline_consumer_unit_id_valido_ate_ano_valido_ate_idx" ON "consumo_baseline"("consumer_unit_id", "valido_ate_ano", "valido_ate_mes");

-- AddForeignKey
ALTER TABLE "consumo_baseline" ADD CONSTRAINT "consumo_baseline_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
