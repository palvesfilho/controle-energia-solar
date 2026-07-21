-- Migração RGE jul/2026: código de instalação antigo preservado em cada modelo
-- que cadastra UC (usina, cliente monitorado, proprietário titular, beneficiária).
-- Espelha o "codigo_uc_antigo" já existente em consumer_units.

-- AlterTable
ALTER TABLE "plants" ADD COLUMN "unidade_consumidora_antiga" TEXT;

-- AlterTable
ALTER TABLE "brasil_solar_clients" ADD COLUMN "codigo_uc_antigo" TEXT;

-- AlterTable
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "codigo_uc_antigo" TEXT;

-- AlterTable
ALTER TABLE "brasil_solar_beneficiarias" ADD COLUMN "codigo_uc_antigo" TEXT;
