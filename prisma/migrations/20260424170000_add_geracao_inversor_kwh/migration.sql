-- Geração do inversor no período da fatura (auto via API do inversor ou
-- preenchido manualmente quando a conexão do inversor cai).
ALTER TABLE "consumer_bills"
  ADD COLUMN "geracao_inversor_kwh" REAL;
ALTER TABLE "consumer_bills"
  ADD COLUMN "geracao_inversor_origem" TEXT;
