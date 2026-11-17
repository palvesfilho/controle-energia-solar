-- Arquivos anexados no cadastro do investidor (contrato, CNH/RG, outros).
-- Só CREATE TABLE: não mexe em dado nenhum.
CREATE TABLE "investor_documents" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT,
    "url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size" INTEGER,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "investor_documents_investor_id_idx" ON "investor_documents"("investor_id");

ALTER TABLE "investor_documents" ADD CONSTRAINT "investor_documents_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
