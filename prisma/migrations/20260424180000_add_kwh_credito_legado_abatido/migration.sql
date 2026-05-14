-- Cap acumulado: quanto da compensação foi abatida desta payable porque
-- o acumulado de compensação remunerada da plant excedeu o acumulado de
-- injeção da usina. Representa créditos legados (anteriores ao sistema) que
-- não devem ser remunerados ao investidor.
-- 0 = sem abate (caso comum). > 0 = cap aplicado (UI sinaliza).
ALTER TABLE "investor_payables"
  ADD COLUMN "kwh_credito_legado_abatido" REAL NOT NULL DEFAULT 0;
