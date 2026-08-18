-- Módulo MENSAGENS: campanhas de push/portal para clientes Brasil Solar.
-- Puramente aditiva — nenhuma tabela existente é alterada.

-- CreateTable
CREATE TABLE "campanhas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "url_destino" TEXT,
    "cta_label" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'PUSH_E_PORTAL',
    "publico_filtro" JSONB,
    "publico_resumo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "total_publico" INTEGER NOT NULL DEFAULT 0,
    "total_com_app" INTEGER NOT NULL DEFAULT 0,
    "total_aparelhos" INTEGER NOT NULL DEFAULT 0,
    "criado_por_id" TEXT,
    "criado_por_nome" TEXT,
    "enviada_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanha_envios" (
    "id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "proprietario_id" TEXT NOT NULL,
    "aparelhos" INTEGER NOT NULL DEFAULT 0,
    "push_status" TEXT NOT NULL DEFAULT 'SEM_APARELHO',
    "erro" TEXT,
    "lido_em" TIMESTAMP(3),
    "interesse_em" TIMESTAMP(3),
    "dispensado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campanha_envios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanhas_status_idx" ON "campanhas"("status");

-- CreateIndex
CREATE INDEX "campanhas_created_at_idx" ON "campanhas"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "campanha_envios_campanha_id_proprietario_id_key" ON "campanha_envios"("campanha_id", "proprietario_id");

-- CreateIndex
CREATE INDEX "campanha_envios_proprietario_id_dispensado_em_idx" ON "campanha_envios"("proprietario_id", "dispensado_em");

-- CreateIndex
CREATE INDEX "campanha_envios_campanha_id_interesse_em_idx" ON "campanha_envios"("campanha_id", "interesse_em");

-- AddForeignKey
ALTER TABLE "campanha_envios" ADD CONSTRAINT "campanha_envios_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_envios" ADD CONSTRAINT "campanha_envios_proprietario_id_fkey" FOREIGN KEY ("proprietario_id") REFERENCES "brasil_solar_proprietarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
