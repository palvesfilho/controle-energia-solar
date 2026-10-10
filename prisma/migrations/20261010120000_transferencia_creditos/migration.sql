-- CreateTable
CREATE TABLE "credit_transfers" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT,
    "uc_origem_codigo" TEXT NOT NULL,
    "kwh_total" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENVIADA',
    "enviado_em" TIMESTAMP(3),
    "aceito_em" TIMESTAMP(3),
    "observacao" TEXT,
    "documento_url" TEXT,
    "documento_nome" TEXT,
    "criado_por_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transfer_items" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "consumer_unit_id" TEXT NOT NULL,
    "kwh" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "credit_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_transfers_plant_id_idx" ON "credit_transfers"("plant_id");

-- CreateIndex
CREATE INDEX "credit_transfer_items_consumer_unit_id_idx" ON "credit_transfer_items"("consumer_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_transfer_items_transfer_id_consumer_unit_id_key" ON "credit_transfer_items"("transfer_id", "consumer_unit_id");

-- AddForeignKey
ALTER TABLE "credit_transfers" ADD CONSTRAINT "credit_transfers_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transfer_items" ADD CONSTRAINT "credit_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "credit_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transfer_items" ADD CONSTRAINT "credit_transfer_items_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

