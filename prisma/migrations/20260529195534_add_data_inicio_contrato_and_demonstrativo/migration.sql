-- AlterTable
ALTER TABLE "consumer_unit_billings" ADD COLUMN     "demonstrativo_gerado_em" TIMESTAMP(3),
ADD COLUMN     "demonstrativo_url" TEXT,
ADD COLUMN     "demonstrativo_validado_em" TIMESTAMP(3),
ADD COLUMN     "demonstrativo_validado_por" TEXT,
ADD COLUMN     "email_enviado_em" TIMESTAMP(3),
ADD COLUMN     "email_erro" TEXT;

-- AlterTable
ALTER TABLE "consumer_units" ADD COLUMN     "data_inicio_contrato" TIMESTAMP(3);
