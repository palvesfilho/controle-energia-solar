-- Documentos da adesao tambem no proprietario de usina.
--
-- Quem cede o telhado entra como investidor e NAO gera unidade consumidora,
-- entao os campos criados em consumer_units nao o alcancavam: ele era
-- cadastrado sem a papelada alojada nele. Mesmos nomes de coluna, para a
-- rotina de copia servir os dois cadastros sem duas versoes da mesma regra.
--
-- Aditiva: todas anulaveis, nenhum investidor existente e afetado.

ALTER TABLE "investors"
    ADD COLUMN "doc_termo_adesao" TEXT,
    ADD COLUMN "doc_termo_adesao_nome" TEXT,
    ADD COLUMN "doc_procuracao" TEXT,
    ADD COLUMN "doc_procuracao_nome" TEXT,
    ADD COLUMN "doc_identidade" TEXT,
    ADD COLUMN "doc_identidade_nome" TEXT,
    ADD COLUMN "doc_cartao_cnpj" TEXT,
    ADD COLUMN "doc_cartao_cnpj_nome" TEXT,
    ADD COLUMN "doc_contrato_social" TEXT,
    ADD COLUMN "doc_contrato_social_nome" TEXT,
    ADD COLUMN "doc_outros" TEXT,
    ADD COLUMN "doc_outros_nome" TEXT,
    ADD COLUMN "docs_adesao_id_crm" INTEGER,
    ADD COLUMN "docs_copiados_em" TIMESTAMP(3);
