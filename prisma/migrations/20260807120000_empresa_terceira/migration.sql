-- Empresa que NÃO é a Brasil Solar e executou o sistema do cliente
-- (BrasilSolarProprietario.executado_por = 'TERCEIRO').
--
-- Guarda só o nome, a pedido do Paulo (07/08/2026): o objetivo é ESCOLHER de uma
-- lista em vez de digitar, pra mesma empresa não virar várias grafias.
-- nome_normalizado (minúsculo, sem acento) é a chave de deduplicação.
--
-- Aditiva: cria tabela nova + coluna nullable. Não altera nem apaga nada
-- existente, então é segura de rodar com a aplicação no ar.

CREATE TABLE "empresas_terceiras" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nome_normalizado" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_terceiras_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "empresas_terceiras_nome_normalizado_key" ON "empresas_terceiras"("nome_normalizado");
CREATE INDEX "empresas_terceiras_nome_idx" ON "empresas_terceiras"("nome");

ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN "empresa_terceira_id" TEXT;

CREATE INDEX "brasil_solar_proprietarios_empresa_terceira_id_idx" ON "brasil_solar_proprietarios"("empresa_terceira_id");

-- ON DELETE SET NULL: apagar a empresa não pode apagar o proprietário. O cadastro
-- do cliente sobrevive e volta a ficar "Terceiro sem empresa informada".
ALTER TABLE "brasil_solar_proprietarios"
  ADD CONSTRAINT "brasil_solar_proprietarios_empresa_terceira_id_fkey"
  FOREIGN KEY ("empresa_terceira_id") REFERENCES "empresas_terceiras"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
