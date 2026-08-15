-- Uma linha por UNIDADE CONSUMIDORA assinada no Termo de Adesao do CRM.
--
-- Aditiva: cria tabela nova, nao toca em nada existente. `crm_venda_importada`
-- continua como esta (uma linha por proposta); esta tabela e o nivel em que o
-- operador trabalha, porque a UC e o que se interliga com a usina.

CREATE TABLE "crm_uc_importada" (
    "id" TEXT NOT NULL,
    "proposta_id_crm" INTEGER NOT NULL,
    "adesao_id_crm" INTEGER NOT NULL,
    "codigo_uc" TEXT NOT NULL,
    "codigo_uc_bruto" TEXT,
    "media_mensal_kwh" DOUBLE PRECISION,
    "cliente_nome" TEXT NOT NULL,
    "cliente_documento" TEXT,
    "cliente_tipo" TEXT,
    "cliente_email" TEXT,
    "cliente_telefone" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "representante_nome" TEXT,
    "representante_cpf" TEXT,
    "representante_cargo" TEXT,
    "concessionaria" TEXT,
    "proprietario_usina" BOOLEAN NOT NULL DEFAULT false,
    "assinatura_status" TEXT,
    "assinado_em" TIMESTAMP(3),
    "envelope_id_crm" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "consumer_unit_id" TEXT,
    "primeira_leitura_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_leitura_em" TIMESTAMP(3) NOT NULL,
    "processada_em" TIMESTAMP(3),

    CONSTRAINT "crm_uc_importada_pkey" PRIMARY KEY ("id")
);

-- (adesao, codigo) e nao (proposta, codigo): uma proposta pode ter varias
-- adesoes assinadas, cada uma com suas UCs.
CREATE UNIQUE INDEX "crm_uc_importada_adesao_id_crm_codigo_uc_key"
    ON "crm_uc_importada"("adesao_id_crm", "codigo_uc");

CREATE INDEX "crm_uc_importada_situacao_idx" ON "crm_uc_importada"("situacao");
CREATE INDEX "crm_uc_importada_proposta_id_crm_idx" ON "crm_uc_importada"("proposta_id_crm");
CREATE INDEX "crm_uc_importada_codigo_uc_idx" ON "crm_uc_importada"("codigo_uc");

-- Documentos da adesao alojados na propria UC.
--
-- Todas anulaveis e sem default: nenhuma UC existente e afetada. O arquivo em
-- si e gravado uma vez por adesao no storage; varias UCs do mesmo titular
-- apontam para o mesmo caminho.
ALTER TABLE "consumer_units"
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
