-- Lista de Materiais: liberação para o gestor de obras + separação/retirada
-- ---------------------------------------------------------------------------
-- "Gerar Lista" passa a LIBERAR a lista. Depois de liberada, o gestor de obras
-- marca o que separou, ajusta quantidades, anexa fotos, escolhe a equipe que
-- veio buscar, escreve quem retirou e as duas partes assinam a mão livre.

ALTER TABLE "obra_lista_materiais"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
  ADD COLUMN IF NOT EXISTS "liberada_em" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "liberada_por_id" TEXT,
  ADD COLUMN IF NOT EXISTS "liberada_por_nome" TEXT,
  ADD COLUMN IF NOT EXISTS "equipe_retirada_id" TEXT,
  ADD COLUMN IF NOT EXISTS "retirado_por" TEXT,
  ADD COLUMN IF NOT EXISTS "assinatura_entregou_nome" TEXT,
  ADD COLUMN IF NOT EXISTS "assinatura_entregou_data" TEXT,
  ADD COLUMN IF NOT EXISTS "assinatura_retirou_nome" TEXT,
  ADD COLUMN IF NOT EXISTS "assinatura_retirou_data" TEXT,
  ADD COLUMN IF NOT EXISTS "observacoes_separacao" TEXT,
  ADD COLUMN IF NOT EXISTS "retirada_em" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "comprovante_relative_path" TEXT,
  ADD COLUMN IF NOT EXISTS "comprovante_upload_id" TEXT,
  ADD COLUMN IF NOT EXISTS "comprovante_gerado_em" TIMESTAMP(3);

-- Backfill: lista que já tinha PDF gerado antes desta feature já estava, na
-- prática, liberada para o estoque — não faz sentido "despublicar" e obrigar
-- o time a clicar de novo em obra que já rodou.
UPDATE "obra_lista_materiais"
   SET "status" = 'LIBERADA',
       "liberada_em" = "pdf_gerado_em"
 WHERE "pdf_gerado_em" IS NOT NULL
   AND "status" = 'RASCUNHO';

ALTER TABLE "obra_lista_material_itens"
  ADD COLUMN IF NOT EXISTS "separado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quantidade_separada" TEXT;

CREATE TABLE IF NOT EXISTS "obra_lista_material_fotos" (
  "id" TEXT NOT NULL,
  "lista_id" TEXT NOT NULL,
  "relative_path" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT,
  "file_size" INTEGER,
  "upload_id" TEXT,
  "legenda" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "obra_lista_material_fotos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "obra_lista_material_fotos_lista_id_idx"
  ON "obra_lista_material_fotos"("lista_id");

CREATE INDEX IF NOT EXISTS "obra_lista_materiais_status_idx"
  ON "obra_lista_materiais"("status");

CREATE INDEX IF NOT EXISTS "obra_lista_materiais_equipe_retirada_id_idx"
  ON "obra_lista_materiais"("equipe_retirada_id");

DO $$
BEGIN
  ALTER TABLE "obra_lista_material_fotos"
    ADD CONSTRAINT "obra_lista_material_fotos_lista_id_fkey"
    FOREIGN KEY ("lista_id") REFERENCES "obra_lista_materiais"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "obra_lista_materiais"
    ADD CONSTRAINT "obra_lista_materiais_equipe_retirada_id_fkey"
    FOREIGN KEY ("equipe_retirada_id") REFERENCES "equipes_execucao"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
