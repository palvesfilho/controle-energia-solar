-- Valor de execução da obra (obrigatório no aceite) + teto vindo da venda.
ALTER TABLE "obras" ADD COLUMN "valor_execucao" DOUBLE PRECISION;
ALTER TABLE "obras" ADD COLUMN "teto_execucao" DOUBLE PRECISION;
ALTER TABLE "obras" ADD COLUMN "valor_execucao_informado_em" TIMESTAMP(3);
ALTER TABLE "obras" ADD COLUMN "valor_execucao_informado_por" TEXT;
ALTER TABLE "obras" ADD COLUMN "teto_execucao_autorizado" DOUBLE PRECISION;
ALTER TABLE "obras" ADD COLUMN "teto_execucao_autorizado_motivo" TEXT;
ALTER TABLE "obras" ADD COLUMN "teto_execucao_autorizado_por" TEXT;
ALTER TABLE "obras" ADD COLUMN "teto_execucao_autorizado_em" TIMESTAMP(3);

ALTER TABLE "crm_produto_destino" ADD COLUMN "valor_execucao_unitario" DOUBLE PRECISION;
ALTER TABLE "crm_produto_destino" ADD COLUMN "valor_execucao_minimo" DOUBLE PRECISION;
ALTER TABLE "crm_produto_destino" ADD COLUMN "qtd_max_teto_automatico" DOUBLE PRECISION;

ALTER TABLE "crm_venda_importada" ADD COLUMN "qtd_execucao" DOUBLE PRECISION;
ALTER TABLE "crm_venda_importada" ADD COLUMN "unidade_execucao" TEXT;
