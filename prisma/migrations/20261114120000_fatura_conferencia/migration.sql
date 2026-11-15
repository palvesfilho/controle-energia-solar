-- Dupla conferência da fatura (Infosimples × PDF) — lib/fatura-conferencia.ts
-- Só ADD COLUMN, todas opcionais: não mexe em dado nenhum.
ALTER TABLE "consumer_bills" ADD COLUMN "conferencia_status" TEXT,
ADD COLUMN "conferencia_divergencias" TEXT,
ADD COLUMN "conferencia_em" TIMESTAMP(3),
ADD COLUMN "conferencia_liberada_por" TEXT,
ADD COLUMN "conferencia_liberada_em" TIMESTAMP(3);
