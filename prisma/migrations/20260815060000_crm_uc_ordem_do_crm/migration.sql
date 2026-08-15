-- Ordem de exibicao copiada do CRM.
--
-- A fila ordenava por nome do cliente, o que obrigava a procurar linha por
-- linha ao conferir contra a tela do gerador de propostas. O CRM lista adesoes
-- por `criado_em` DESCENDENTE (backend/src/routes/adesoes.js, rota GET /), e
-- dentro de cada adesao as UCs saem na ordem do array -- que e a ordem do
-- termo assinado. Guardar as duas coisas deixa as duas listas lado a lado.
--
-- Aditiva: `adesao_criada_em` anulavel e `ordem_na_adesao` com default 0. As
-- 34 linhas existentes ficam com 0 ate o proximo sync preencher.

ALTER TABLE "crm_uc_importada"
    ADD COLUMN "adesao_criada_em" TIMESTAMP(3),
    ADD COLUMN "ordem_na_adesao" INTEGER NOT NULL DEFAULT 0;

-- A fila lista sempre filtrando por situacao e ordenando por estes dois.
CREATE INDEX "crm_uc_importada_ordem_idx"
    ON "crm_uc_importada"("situacao", "adesao_criada_em" DESC, "ordem_na_adesao");
