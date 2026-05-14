-- AlterTable
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "latitude" REAL;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "longitude" REAL;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "codigo_uc" TEXT;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "concessionaria" TEXT;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "potencia_instalada" REAL;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "modulos_marca" TEXT;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "modulos_modelo" TEXT;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "modulos_quantidade" INTEGER;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "inversor_marca" TEXT;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "inversor_modelo" TEXT;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "inversor_quantidade" INTEGER;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "inversor_potencia" REAL;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "numero_fases" TEXT;
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "tipo_atendimento" TEXT;

-- CreateIndex
CREATE INDEX "brasil_solar_proprietarios_codigo_uc_idx" ON "brasil_solar_proprietarios"("codigo_uc");
