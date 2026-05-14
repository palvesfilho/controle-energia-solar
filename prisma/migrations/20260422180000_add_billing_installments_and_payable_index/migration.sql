-- Adiciona suporte a parcelamento esporádico (até 10 boletos no mesmo mês)
-- e fragmentação proporcional do payable do investidor.

-- 1) JSON de parcelas no ConsumerUnitBilling
ALTER TABLE "consumer_unit_billings" ADD COLUMN "installments" TEXT;

-- 2) parcelaIndex no InvestorPayable (default 0 para registros existentes)
ALTER TABLE "investor_payables" ADD COLUMN "parcela_index" INTEGER NOT NULL DEFAULT 0;

-- 3) Recria unique constraint incluindo parcelaIndex
DROP INDEX "investor_payables_investor_id_consumer_unit_id_ano_referencia_mes_referencia_key";
CREATE UNIQUE INDEX "investor_payables_investor_id_consumer_unit_id_ano_referencia_mes_referencia_parcela_index_key"
  ON "investor_payables" ("investor_id", "consumer_unit_id", "ano_referencia", "mes_referencia", "parcela_index");
