-- Adiciona coluna "vigente_a_partir_de" em rateio_versions.
-- SQLite não aceita default não-constante em ADD COLUMN, então usamos
-- uma sentinela (epoch) e em seguida populamos com aceito_em ?? criado_em.
-- Novas linhas passam pelo Prisma Client, que injeta now() via @default.

ALTER TABLE "rateio_versions"
  ADD COLUMN "vigente_a_partir_de" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';

UPDATE "rateio_versions"
SET "vigente_a_partir_de" = COALESCE("aceito_em", "criado_em");
