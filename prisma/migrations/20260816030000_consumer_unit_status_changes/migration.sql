-- CreateTable
CREATE TABLE "consumer_unit_status_changes" (
    "id" TEXT NOT NULL,
    "consumer_unit_id" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuario_id" TEXT,
    "usuario_nome" TEXT NOT NULL,
    "usuario_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumer_unit_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumer_unit_status_changes_consumer_unit_id_created_at_idx" ON "consumer_unit_status_changes"("consumer_unit_id", "created_at");

-- AddForeignKey
ALTER TABLE "consumer_unit_status_changes" ADD CONSTRAINT "consumer_unit_status_changes_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
