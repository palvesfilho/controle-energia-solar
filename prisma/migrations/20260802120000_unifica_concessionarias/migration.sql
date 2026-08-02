-- Unifica o vocabulario de concessionaria num so.
--
-- Antes existiam dois: o da credencial (RGE | CPFL_PAULISTA | CPFL_PIRATININGA)
-- e o do cadastro (RGE | CELETRO | NOVA PALMA | COPREL | CERILUZ, texto livre).
-- Nada no codigo escolhia comportamento por esse campo -- a consulta de fatura
-- usa o mesmo endpoint da Infosimples para RGE e CPFL -- entao a separacao so
-- produzia divergencia entre a concessionaria da UC e a da credencial na mesma
-- tela.
--
-- Lista canonica agora em src/lib/concessionarias.ts.

-- 1) Default da credencial passa a ser a entrada unificada.
ALTER TABLE "cpfl_credentials" ALTER COLUMN "distribuidora" SET DEFAULT 'RGE/CPFL';

-- 2) Credenciais existentes: RGE e as duas CPFL viram RGE/CPFL.
UPDATE "cpfl_credentials"
SET "distribuidora" = 'RGE/CPFL'
WHERE upper(btrim("distribuidora")) IN ('RGE', 'RGE SUL', 'CPFL', 'CPFL_PAULISTA', 'CPFL PAULISTA', 'CPFL_PIRATININGA', 'CPFL PIRATININGA');

UPDATE "cpfl_credentials"
SET "distribuidora" = 'NOVA PALMA ENERGIA'
WHERE upper(btrim("distribuidora")) = 'NOVA PALMA';

-- 3) Cadastro das UCs (era texto livre).
UPDATE "consumer_units"
SET "distribuidora" = 'RGE/CPFL'
WHERE upper(btrim("distribuidora")) IN ('RGE', 'RGE SUL', 'CPFL', 'CPFL_PAULISTA', 'CPFL PAULISTA', 'CPFL_PIRATININGA', 'CPFL PIRATININGA');

UPDATE "consumer_units"
SET "distribuidora" = 'NOVA PALMA ENERGIA'
WHERE upper(btrim("distribuidora")) = 'NOVA PALMA';

-- 4) Cadastro das usinas: `concessionaria` e o campo que as telas preenchem;
--    `distribuidora` existe no schema mas nenhuma tela grava.
UPDATE "plants"
SET "concessionaria" = 'RGE/CPFL'
WHERE upper(btrim("concessionaria")) IN ('RGE', 'RGE SUL', 'CPFL', 'CPFL_PAULISTA', 'CPFL PAULISTA', 'CPFL_PIRATININGA', 'CPFL PIRATININGA');

UPDATE "plants"
SET "concessionaria" = 'NOVA PALMA ENERGIA'
WHERE upper(btrim("concessionaria")) = 'NOVA PALMA';

UPDATE "plants"
SET "distribuidora" = 'RGE/CPFL'
WHERE upper(btrim("distribuidora")) IN ('RGE', 'RGE SUL', 'CPFL', 'CPFL_PAULISTA', 'CPFL PAULISTA', 'CPFL_PIRATININGA', 'CPFL PIRATININGA');

UPDATE "plants"
SET "distribuidora" = 'NOVA PALMA ENERGIA'
WHERE upper(btrim("distribuidora")) = 'NOVA PALMA';

-- 5) Usinas monitoradas da Brasil Solar.
UPDATE "brasil_solar_clients"
SET "concessionaria" = 'RGE/CPFL'
WHERE upper(btrim("concessionaria")) IN ('RGE', 'RGE SUL', 'CPFL', 'CPFL_PAULISTA', 'CPFL PAULISTA', 'CPFL_PIRATININGA', 'CPFL PIRATININGA');

UPDATE "brasil_solar_clients"
SET "concessionaria" = 'NOVA PALMA ENERGIA'
WHERE upper(btrim("concessionaria")) = 'NOVA PALMA';
