-- Divisão 2 do módulo Mensagens: ATIVAÇÕES (regras que disparam sozinhas).
--
-- `campanha_envios` passa a servir aos dois lados: a linha nasce de uma campanha
-- OU de uma ativação. `campanha_id` vira nullable por isso. A tabela está vazia
-- (nenhuma campanha foi disparada até aqui), então nada precisa ser migrado.
--
-- O UNIQUE (campanha_id, proprietario_id) continua: no Postgres NULL não colide
-- com NULL, então ele segue impedindo campanha repetida sem alcançar as
-- ativações -- que PODEM reencontrar o mesmo cliente depois do cooldown.

-- CreateTable
CREATE TABLE "ativacoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "gatilho" TEXT NOT NULL,
    "params" JSONB,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "cta_label" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'PUSH_E_PORTAL',
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "cooldown_dias" INTEGER NOT NULL DEFAULT 30,
    "criado_por_nome" TEXT,
    "ativada_em" TIMESTAMP(3),
    "ultima_avaliacao_em" TIMESTAMP(3),
    "total_disparos" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ativacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ativacoes_ativa_idx" ON "ativacoes"("ativa");

-- AlterTable
ALTER TABLE "campanha_envios" ALTER COLUMN "campanha_id" DROP NOT NULL;
ALTER TABLE "campanha_envios" ADD COLUMN     "ativacao_id" TEXT;

-- CreateIndex
CREATE INDEX "campanha_envios_ativacao_id_proprietario_id_idx" ON "campanha_envios"("ativacao_id", "proprietario_id");

-- AddForeignKey
ALTER TABLE "campanha_envios" ADD CONSTRAINT "campanha_envios_ativacao_id_fkey" FOREIGN KEY ("ativacao_id") REFERENCES "ativacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
