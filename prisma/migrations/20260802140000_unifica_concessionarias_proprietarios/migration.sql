-- Complemento da 20260802120000: aquela migration cobriu consumer_units, plants,
-- brasil_solar_clients e cpfl_credentials, mas passou batido em
-- brasil_solar_proprietarios.concessionaria -- que e justamente o campo exibido
-- no card "Dados Tecnicos (Anexo F)" da tela do proprietario, de onde veio o
-- sintoma original (Fundacao Antonio Meneghetti mostrando "NOVA PALMA" ali e
-- "RGE Sul" no card de acesso).

UPDATE "brasil_solar_proprietarios"
SET "concessionaria" = 'RGE/CPFL'
WHERE upper(btrim("concessionaria")) IN ('RGE', 'RGE SUL', 'CPFL', 'CPFL_PAULISTA', 'CPFL PAULISTA', 'CPFL_PIRATININGA', 'CPFL PIRATININGA');

UPDATE "brasil_solar_proprietarios"
SET "concessionaria" = 'NOVA PALMA ENERGIA'
WHERE upper(btrim("concessionaria")) = 'NOVA PALMA';
