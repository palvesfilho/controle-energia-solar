-- Consumo instantâneo: energia gerada e consumida na hora (sem passar pela
-- rede). Usado no cálculo de cobrança da UC geradora em DESCONTADO.
ALTER TABLE "consumer_bills"
  ADD COLUMN "consumo_instantaneo_kwh" REAL;
