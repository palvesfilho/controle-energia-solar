-- Nº de protocolo da concessionária para a versão de rateio.
-- Nullable: rateios criados antes de 22/08/2026 não têm protocolo registrado.
ALTER TABLE "rateio_versions" ADD COLUMN "protocolo" TEXT;
