-- Lançamento manual passa a aceitar período personalizado (ciclo de leitura da
-- fatura, ex.: 10/04 a 11/05), não só mês calendário fechado.
--
-- A janela é [data_inicio, data_fim) — fim EXCLUSIVO, igual ao que o relatório
-- usa (`gte dataLeituraAnterior, lt dataLeituraAtual`). Assim ciclos
-- consecutivos não duplicam o dia da virada.
--
-- Colunas entram NOT NULL sem default porque a tabela foi criada horas antes,
-- na migração 20260804120000_geracao_manual, e está vazia (verificado).
-- `ano`/`mes` continuam existindo, agora só como competência/rótulo.
ALTER TABLE "manual_generation_entries"
  ADD COLUMN "tipo_periodo" TEXT NOT NULL DEFAULT 'MENSAL',
  ADD COLUMN "data_inicio" TIMESTAMP(3) NOT NULL,
  ADD COLUMN "data_fim" TIMESTAMP(3) NOT NULL;

-- Um mês só podia ter um lançamento; agora a chave é a janela.
DROP INDEX IF EXISTS "manual_generation_entries_client_id_ano_mes_key";

CREATE UNIQUE INDEX "manual_generation_entries_client_id_data_inicio_data_fim_key"
  ON "manual_generation_entries" ("client_id", "data_inicio", "data_fim");

CREATE INDEX "manual_generation_entries_client_id_data_inicio_idx"
  ON "manual_generation_entries" ("client_id", "data_inicio");
