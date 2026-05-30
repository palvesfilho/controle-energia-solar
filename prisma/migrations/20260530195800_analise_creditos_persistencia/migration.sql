-- CreateTable
CREATE TABLE "acao_recomendada" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "severidade" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "prazo_dias" INTEGER NOT NULL,
    "plant_id" TEXT,
    "consumer_unit_id" TEXT,
    "metrica_valor" DOUBLE PRECISION,
    "metrica_label" TEXT,
    "mes_referencia" INTEGER NOT NULL,
    "ano_referencia" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "prazo_em" TIMESTAMP(3) NOT NULL,
    "responsavel_user_id" TEXT,
    "observacao_resolucao" TEXT,
    "resolvida_em" TIMESTAMP(3),
    "resolvida_por_user_id" TEXT,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMP(3) NOT NULL,
    "vista_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acao_recomendada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analise_creditos_snapshot" (
    "id" TEXT NOT NULL,
    "mes_referencia" INTEGER NOT NULL,
    "ano_referencia" INTEGER NOT NULL,
    "escopo_tipo" TEXT NOT NULL,
    "escopo_id" TEXT,
    "completo" BOOLEAN NOT NULL DEFAULT false,
    "payload_json" TEXT NOT NULL,
    "email_enviado" BOOLEAN NOT NULL DEFAULT false,
    "email_enviado_em" TIMESTAMP(3),
    "email_destinatarios" TEXT,
    "gerado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gerado_por_user_id" TEXT,

    CONSTRAINT "analise_creditos_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acao_recomendada_fingerprint_key" ON "acao_recomendada"("fingerprint");

-- CreateIndex
CREATE INDEX "acao_recomendada_status_prazo_em_idx" ON "acao_recomendada"("status", "prazo_em");

-- CreateIndex
CREATE INDEX "acao_recomendada_plant_id_status_idx" ON "acao_recomendada"("plant_id", "status");

-- CreateIndex
CREATE INDEX "acao_recomendada_consumer_unit_id_status_idx" ON "acao_recomendada"("consumer_unit_id", "status");

-- CreateIndex
CREATE INDEX "acao_recomendada_ano_referencia_mes_referencia_idx" ON "acao_recomendada"("ano_referencia", "mes_referencia");

-- CreateIndex
CREATE INDEX "analise_creditos_snapshot_ano_referencia_mes_referencia_idx" ON "analise_creditos_snapshot"("ano_referencia", "mes_referencia");

-- CreateIndex
CREATE UNIQUE INDEX "analise_creditos_snapshot_mes_referencia_ano_referencia_esc_key" ON "analise_creditos_snapshot"("mes_referencia", "ano_referencia", "escopo_tipo", "escopo_id");

-- AddForeignKey
ALTER TABLE "acao_recomendada" ADD CONSTRAINT "acao_recomendada_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acao_recomendada" ADD CONSTRAINT "acao_recomendada_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acao_recomendada" ADD CONSTRAINT "acao_recomendada_responsavel_user_id_fkey" FOREIGN KEY ("responsavel_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acao_recomendada" ADD CONSTRAINT "acao_recomendada_resolvida_por_user_id_fkey" FOREIGN KEY ("resolvida_por_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
