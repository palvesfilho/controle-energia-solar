-- Separa "a venda fechou?" (do CRM) de "eu cadastrei?" (do operador).
--
-- As linhas por UC nasciam sempre PENDENTE, entao adesao assinada cuja
-- proposta ainda estava `em_negociacao` caía na caixa "A cadastrar" como se o
-- negocio estivesse fechado. O RESIDENCIAL MORADA DO LESTE, com 10 UCs numa
-- proposta em negociacao, era 10 das 34 linhas da fila.
--
-- Os dois eixos tem donos diferentes: o sync atualiza `venda_ganha` e
-- `status_negocio` a cada rodada, e nunca toca em `situacao`.
--
-- Default `true` porque, das 34 linhas ja gravadas, 24 sao de venda ganha; o
-- proximo sync corrige as 10 restantes com o valor real.

ALTER TABLE "crm_uc_importada"
    ADD COLUMN "venda_ganha" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "status_negocio" TEXT;

-- A fila filtra por estes dois juntos.
CREATE INDEX "crm_uc_importada_situacao_venda_idx"
    ON "crm_uc_importada"("situacao", "venda_ganha");
