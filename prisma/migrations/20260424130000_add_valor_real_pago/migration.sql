-- Valor realmente transferido ao investidor (pode diferir de valorLiquido).
-- Quando preenchido > valorLiquido, a diferença vira InvestorDebit auto.
ALTER TABLE "investor_payables"
  ADD COLUMN "valor_real_pago" REAL;
ALTER TABLE "investor_payables"
  ADD COLUMN "motivo_valor_real_pago" TEXT;

-- Ponteiro do InvestorDebit pra payable que o originou (quando auto-criado).
ALTER TABLE "investor_debits"
  ADD COLUMN "payable_origem_id" TEXT
    REFERENCES "investor_payables"("id") ON DELETE SET NULL;
CREATE INDEX "investor_debits_payable_origem_id_idx"
  ON "investor_debits" ("payable_origem_id");
