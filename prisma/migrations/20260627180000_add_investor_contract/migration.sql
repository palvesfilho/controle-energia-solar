-- CreateTable
CREATE TABLE "investor_contracts" (
    "id" TEXT NOT NULL,
    "investor_plant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size" INTEGER,
    "data_assinatura" TIMESTAMP(3),
    "prazo_meses" INTEGER,
    "marco_inicio_prazo" TEXT,
    "antecedencia_rescisao_dias" INTEGER,
    "taxa_inicial_mult_geracao" INTEGER,
    "foro" TEXT,
    "observacoes" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "substitui_id" TEXT,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investor_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investor_contracts_investor_plant_id_idx" ON "investor_contracts"("investor_plant_id");

-- AddForeignKey
ALTER TABLE "investor_contracts" ADD CONSTRAINT "investor_contracts_investor_plant_id_fkey" FOREIGN KEY ("investor_plant_id") REFERENCES "investor_plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_contracts" ADD CONSTRAINT "investor_contracts_substitui_id_fkey" FOREIGN KEY ("substitui_id") REFERENCES "investor_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
