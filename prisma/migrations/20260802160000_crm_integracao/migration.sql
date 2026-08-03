-- Integração de leitura com o CRM (GERADOR_PROPOSTA / Supabase).
-- Só cria tabelas novas: não altera nem uma coluna existente.

-- CreateTable
CREATE TABLE "crm_produto_destino" (
    "id" TEXT NOT NULL,
    "codigo_produto" TEXT NOT NULL,
    "nome_produto" TEXT NOT NULL,
    "gera_obra" BOOLEAN NOT NULL DEFAULT false,
    "tipo_obra" TEXT,
    "destino_gestao" TEXT NOT NULL DEFAULT 'NENHUM',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_produto_destino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_venda_importada" (
    "id" TEXT NOT NULL,
    "proposta_id_crm" INTEGER NOT NULL,
    "numero_proposta" TEXT,
    "codigo_produto" TEXT NOT NULL,
    "nome_produto" TEXT NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cliente_documento" TEXT,
    "cliente_id_crm" INTEGER,
    "cidade" TEXT,
    "vendedor_email" TEXT,
    "valor_investimento" DOUBLE PRECISION,
    "fechado_em" TIMESTAMP(3),
    "status_negocio" TEXT NOT NULL,
    "adesao_id_crm" INTEGER,
    "concessionaria" TEXT,
    "codigos_uc" TEXT,
    "media_mensal_kwh" DOUBLE PRECISION,
    "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "obra_id" TEXT,
    "observacao" TEXT,
    "primeira_leitura_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_leitura_em" TIMESTAMP(3) NOT NULL,
    "processada_em" TIMESTAMP(3),
    "processada_por_id" TEXT,

    CONSTRAINT "crm_venda_importada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_produto_destino_codigo_produto_key" ON "crm_produto_destino"("codigo_produto");

-- CreateIndex
CREATE UNIQUE INDEX "crm_venda_importada_proposta_id_crm_key" ON "crm_venda_importada"("proposta_id_crm");

-- CreateIndex
CREATE INDEX "crm_venda_importada_situacao_idx" ON "crm_venda_importada"("situacao");

-- CreateIndex
CREATE INDEX "crm_venda_importada_codigo_produto_idx" ON "crm_venda_importada"("codigo_produto");
