-- Marca o que foi excluído no CRM (proposta, adesão ou UC tirada do termo).
-- Aditiva: só colunas anuláveis, nenhum dado existente muda.
ALTER TABLE "crm_venda_importada" ADD COLUMN "excluida_no_crm_em" TIMESTAMP(3);
ALTER TABLE "crm_venda_importada" ADD COLUMN "motivo_exclusao_crm" TEXT;
ALTER TABLE "crm_uc_importada" ADD COLUMN "excluida_no_crm_em" TIMESTAMP(3);
ALTER TABLE "crm_uc_importada" ADD COLUMN "motivo_exclusao_crm" TEXT;
