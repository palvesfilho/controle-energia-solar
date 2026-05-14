-- Débitos do investidor com a empresa (ex.: pagamento a maior no passado).
-- valorRestante decresce a cada aplicação em uma InvestorPayable.
CREATE TABLE "investor_debits" (
  "id"                  TEXT PRIMARY KEY,
  "investor_id"         TEXT NOT NULL,
  "valor_original"      REAL NOT NULL,
  "valor_restante"      REAL NOT NULL,
  "motivo"              TEXT,
  "status"              TEXT NOT NULL DEFAULT 'ABERTO',
  "criado_em"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "quitado_em"          DATETIME,
  "cancelado_em"        DATETIME,
  "criado_por_user_id"  TEXT,
  FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE
);
CREATE INDEX "investor_debits_investor_id_status_idx"
  ON "investor_debits" ("investor_id", "status");

-- Aplicação de débito em uma payable. Unique (debitId, payableId) garante
-- que o mesmo débito não abate duas vezes a mesma payable.
CREATE TABLE "investor_debit_applications" (
  "id"            TEXT PRIMARY KEY,
  "debit_id"      TEXT NOT NULL,
  "payable_id"    TEXT NOT NULL,
  "valor_abatido" REAL NOT NULL,
  "aplicado_em"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("debit_id")   REFERENCES "investor_debits"("id")    ON DELETE CASCADE,
  FOREIGN KEY ("payable_id") REFERENCES "investor_payables"("id")  ON DELETE CASCADE
);
CREATE UNIQUE INDEX "investor_debit_applications_debit_payable_key"
  ON "investor_debit_applications" ("debit_id", "payable_id");
CREATE INDEX "investor_debit_applications_payable_id_idx"
  ON "investor_debit_applications" ("payable_id");

-- Coluna na payable pra total já abatido de débitos.
ALTER TABLE "investor_payables"
  ADD COLUMN "valor_abatido_debito" REAL NOT NULL DEFAULT 0;
