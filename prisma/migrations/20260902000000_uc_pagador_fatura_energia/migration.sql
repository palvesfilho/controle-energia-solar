-- Quem paga a fatura da UC para a distribuidora: GESTORA (paga e repassa na
-- cobranca) ou CLIENTE (paga direto, gestora cobra so a sua parte).
-- Default GESTORA preserva o comportamento das UCs ja cadastradas, que sao
-- todas de fatura unica; UC nova vinda do gerador de propostas entra CLIENTE.
ALTER TABLE "consumer_units"
  ADD COLUMN "pagador_fatura_energia" TEXT NOT NULL DEFAULT 'GESTORA';
