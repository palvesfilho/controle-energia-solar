-- AlterTable
ALTER TABLE "obras" ADD COLUMN "aprovacao" TEXT NOT NULL DEFAULT 'PENDENTE';

-- Backfill: obras já existentes passam direto para ACEITA (já estão no cronograma)
UPDATE "obras" SET "aprovacao" = 'ACEITA';

-- CreateIndex
CREATE INDEX "obras_aprovacao_idx" ON "obras"("aprovacao");
