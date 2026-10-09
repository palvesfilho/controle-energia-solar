-- Marcação "a concessionária não emitiu fatura neste mês", por UC ou por usina.
-- Aditiva: só cria tabela nova, nenhum dado existente muda.
CREATE TABLE "faturas_nao_emitidas" (
    "id" TEXT NOT NULL,
    "consumer_unit_id" TEXT,
    "plant_id" TEXT,
    "mes_referencia" INTEGER NOT NULL,
    "ano_referencia" INTEGER NOT NULL,
    "motivo" TEXT,
    "marcado_por" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faturas_nao_emitidas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "faturas_nao_emitidas_consumer_unit_id_ano_referencia_mes_re_key" ON "faturas_nao_emitidas"("consumer_unit_id", "ano_referencia", "mes_referencia");

CREATE UNIQUE INDEX "faturas_nao_emitidas_plant_id_ano_referencia_mes_referencia_key" ON "faturas_nao_emitidas"("plant_id", "ano_referencia", "mes_referencia");

ALTER TABLE "faturas_nao_emitidas" ADD CONSTRAINT "faturas_nao_emitidas_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "faturas_nao_emitidas" ADD CONSTRAINT "faturas_nao_emitidas_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
