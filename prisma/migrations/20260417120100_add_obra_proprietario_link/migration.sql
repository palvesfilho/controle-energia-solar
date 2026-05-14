-- AlterTable
ALTER TABLE "obras" ADD COLUMN "brasil_solar_proprietario_id" TEXT;

-- CreateIndex
CREATE INDEX "obras_brasil_solar_proprietario_id_idx" ON "obras"("brasil_solar_proprietario_id");
