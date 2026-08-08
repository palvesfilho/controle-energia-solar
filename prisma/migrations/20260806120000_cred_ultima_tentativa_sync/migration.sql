-- AlterTable
ALTER TABLE "cpfl_credentials" ADD COLUMN     "ultima_tentativa_sync" TIMESTAMP(3);

-- Backfill: para credenciais que terminaram em ERROR, o instante em que o erro
-- foi gravado é o próprio updated_at da linha (o catch do sync só escreve
-- status/erro). Melhor aproximação disponível pro histórico.
UPDATE "cpfl_credentials"
SET "ultima_tentativa_sync" = "updated_at"
WHERE "status_sync" = 'ERROR';

-- Para as que terminaram em sucesso, a tentativa coincide com o sucesso.
UPDATE "cpfl_credentials"
SET "ultima_tentativa_sync" = "ultima_sync"
WHERE "ultima_tentativa_sync" IS NULL AND "ultima_sync" IS NOT NULL;
