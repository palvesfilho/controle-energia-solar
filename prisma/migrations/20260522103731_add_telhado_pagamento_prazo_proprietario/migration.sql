-- AlterTable
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN     "data_pagamento" TIMESTAMP(3),
ADD COLUMN     "prazo_contrato_dias" INTEGER,
ADD COLUMN     "tipo_telhado" TEXT,
ADD COLUMN     "tipo_telhado_outro" TEXT;
