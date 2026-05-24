-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "vigencia_inicio" TIMESTAMP(3) NOT NULL,
    "percentual" DOUBLE PRECISION NOT NULL,
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_costs" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "valor_padrao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_cost_entries" (
    "id" TEXT NOT NULL,
    "recurring_cost_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "valor_padrao_no_mes" DOUBLE PRECISION,
    "confirmado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmado_por_user_id" TEXT,
    "observacao" TEXT,

    CONSTRAINT "recurring_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_vigencia_inicio_key" ON "tax_rates"("vigencia_inicio");

-- CreateIndex
CREATE INDEX "recurring_costs_ativo_ordem_idx" ON "recurring_costs"("ativo", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_costs_nome_key" ON "recurring_costs"("nome");

-- CreateIndex
CREATE INDEX "recurring_cost_entries_ano_mes_idx" ON "recurring_cost_entries"("ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_cost_entries_recurring_cost_id_ano_mes_key" ON "recurring_cost_entries"("recurring_cost_id", "ano", "mes");

-- AddForeignKey
ALTER TABLE "recurring_cost_entries" ADD CONSTRAINT "recurring_cost_entries_recurring_cost_id_fkey" FOREIGN KEY ("recurring_cost_id") REFERENCES "recurring_costs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
