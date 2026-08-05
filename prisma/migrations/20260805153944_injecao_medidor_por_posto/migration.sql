-- AlterTable
ALTER TABLE "consumer_bills" ADD COLUMN     "energia_injetada_medidor_fora_ponta_kwh" DOUBLE PRECISION,
ADD COLUMN     "energia_injetada_medidor_ponta_kwh" DOUBLE PRECISION,
ADD COLUMN     "leitura_injetada_fora_ponta_anterior" DOUBLE PRECISION,
ADD COLUMN     "leitura_injetada_fora_ponta_atual" DOUBLE PRECISION,
ADD COLUMN     "leitura_injetada_ponta_anterior" DOUBLE PRECISION,
ADD COLUMN     "leitura_injetada_ponta_atual" DOUBLE PRECISION;
