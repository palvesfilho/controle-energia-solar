-- AlterTable
ALTER TABLE "brasil_solar_beneficiarias" ADD COLUMN     "consumer_unit_id" TEXT;

-- CreateIndex
CREATE INDEX "brasil_solar_beneficiarias_consumer_unit_id_idx" ON "brasil_solar_beneficiarias"("consumer_unit_id");

-- AddForeignKey
ALTER TABLE "brasil_solar_beneficiarias" ADD CONSTRAINT "brasil_solar_beneficiarias_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
