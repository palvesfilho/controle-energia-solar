-- A Autorização de Acesso passou a ser assinada junto com o Termo e a Procuração
-- no envelope da adesão (CRM, migration 097). Ela vira o sétimo documento copiado
-- para dentro do cadastro — mesmos nomes de coluna na UC e no investidor, como as
-- outras seis, porque a rotina de cópia serve os dois.
ALTER TABLE "consumer_units"
  ADD COLUMN IF NOT EXISTS "doc_autorizacao_acesso" TEXT,
  ADD COLUMN IF NOT EXISTS "doc_autorizacao_acesso_nome" TEXT;

ALTER TABLE "investors"
  ADD COLUMN IF NOT EXISTS "doc_autorizacao_acesso" TEXT,
  ADD COLUMN IF NOT EXISTS "doc_autorizacao_acesso_nome" TEXT;
