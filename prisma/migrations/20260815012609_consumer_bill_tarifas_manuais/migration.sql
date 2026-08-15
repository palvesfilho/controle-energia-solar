-- Marca que TE/TUSD foram preenchidos a mao (OCR rotacionado corrompeu a tarifa).
-- Marcado, o reparse do PDF nao sobrescreve mais esses campos.
-- AlterTable
ALTER TABLE "consumer_bills" ADD COLUMN     "tarifas_manuais_em" TIMESTAMP(3);
