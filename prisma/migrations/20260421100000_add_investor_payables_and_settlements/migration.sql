-- CreateTable
CREATE TABLE "investor_settlements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investor_id" TEXT NOT NULL,
    "ano_fechamento" INTEGER NOT NULL,
    "mes_fechamento" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total_kwh" REAL NOT NULL DEFAULT 0,
    "total_bruto" REAL NOT NULL DEFAULT 0,
    "total_ajuste" REAL NOT NULL DEFAULT 0,
    "total_liquido" REAL NOT NULL DEFAULT 0,
    "total_payables" INTEGER NOT NULL DEFAULT 0,
    "gestao_fixa_aplicada" REAL NOT NULL DEFAULT 0,
    "outros_ajustes" REAL NOT NULL DEFAULT 0,
    "outros_notas" TEXT,
    "valor_a_pagar" REAL NOT NULL DEFAULT 0,
    "gerado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_em" DATETIME,
    "pago_em" DATETIME,
    "pago_comprovante" TEXT,
    "observacoes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "investor_settlements_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "investor_payables" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investor_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "consumer_unit_id" TEXT NOT NULL,
    "mes_referencia" INTEGER NOT NULL,
    "ano_referencia" INTEGER NOT NULL,
    "share_percent" REAL NOT NULL,
    "valor_kwh_contrato" REAL NOT NULL,
    "rateio_version_id" TEXT,
    "kwh_compensado_base" REAL NOT NULL,
    "kwh_compensado_ajuste" REAL NOT NULL DEFAULT 0,
    "valor_bruto" REAL NOT NULL,
    "valor_ajuste" REAL NOT NULL DEFAULT 0,
    "valor_liquido" REAL NOT NULL,
    "motivo_ajuste" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_COMPENSACAO',
    "consumer_bill_id" TEXT,
    "consumer_unit_billing_id" TEXT,
    "investor_settlement_id" TEXT,
    "compensado_em" DATETIME,
    "pago_cliente_em" DATETIME,
    "disponibilizado_em" DATETIME,
    "pago_investidor_em" DATETIME,
    "cobranca_judicial_em" DATETIME,
    "cobranca_judicial_nota" TEXT,
    "observacoes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "investor_payables_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "investor_payables_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "investor_payables_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "investor_payables_consumer_bill_id_fkey" FOREIGN KEY ("consumer_bill_id") REFERENCES "consumer_bills" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "investor_payables_consumer_unit_billing_id_fkey" FOREIGN KEY ("consumer_unit_billing_id") REFERENCES "consumer_unit_billings" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "investor_payables_investor_settlement_id_fkey" FOREIGN KEY ("investor_settlement_id") REFERENCES "investor_settlements" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "investor_payables_rateio_version_id_fkey" FOREIGN KEY ("rateio_version_id") REFERENCES "rateio_versions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "investor_settlements_investor_id_ano_fechamento_mes_fechamento_key" ON "investor_settlements"("investor_id", "ano_fechamento", "mes_fechamento");

-- CreateIndex
CREATE INDEX "investor_settlements_status_ano_fechamento_mes_fechamento_idx" ON "investor_settlements"("status", "ano_fechamento", "mes_fechamento");

-- CreateIndex
CREATE UNIQUE INDEX "investor_payables_investor_id_consumer_unit_id_ano_referencia_mes_referencia_key" ON "investor_payables"("investor_id", "consumer_unit_id", "ano_referencia", "mes_referencia");

-- CreateIndex
CREATE INDEX "investor_payables_status_ano_referencia_mes_referencia_idx" ON "investor_payables"("status", "ano_referencia", "mes_referencia");

-- CreateIndex
CREATE INDEX "investor_payables_investor_id_status_idx" ON "investor_payables"("investor_id", "status");

-- CreateIndex
CREATE INDEX "investor_payables_plant_id_ano_referencia_mes_referencia_idx" ON "investor_payables"("plant_id", "ano_referencia", "mes_referencia");
