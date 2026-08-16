-- CreateTable
CREATE TABLE "plant_status_changes" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuario_id" TEXT,
    "usuario_nome" TEXT NOT NULL,
    "usuario_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plant_status_changes_plant_id_created_at_idx" ON "plant_status_changes"("plant_id", "created_at");

-- AddForeignKey
ALTER TABLE "plant_status_changes" ADD CONSTRAINT "plant_status_changes_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
