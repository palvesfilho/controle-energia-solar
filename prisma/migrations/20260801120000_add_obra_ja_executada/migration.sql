-- Marca proprietários cuja obra da Brasil Solar já havia sido executada antes
-- do cadastro entrar no sistema. Quando true, o POST não cria Obra nem tarefas.
ALTER TABLE "brasil_solar_proprietarios"
  ADD COLUMN "obra_ja_executada" BOOLEAN NOT NULL DEFAULT false;
