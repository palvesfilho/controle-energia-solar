-- Lead de campanha ganha estado de atendimento: enquanto atendido_em for NULL,
-- o lead aparece no sino do AURA para o pós-venda. Puramente aditiva.

-- AlterTable
ALTER TABLE "campanha_envios" ADD COLUMN     "atendido_em" TIMESTAMP(3),
ADD COLUMN     "atendido_por_nome" TEXT;

-- CreateIndex
CREATE INDEX "campanha_envios_interesse_em_atendido_em_idx" ON "campanha_envios"("interesse_em", "atendido_em");
