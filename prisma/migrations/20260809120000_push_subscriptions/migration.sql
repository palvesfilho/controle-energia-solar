-- Notificações push do Portal do Cliente: uma linha por APARELHO inscrito.
-- Puramente aditiva — nenhuma tabela existente é tocada.

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "proprietario_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "ultimo_envio_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_proprietario_id_idx" ON "push_subscriptions"("proprietario_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_proprietario_id_fkey" FOREIGN KEY ("proprietario_id") REFERENCES "brasil_solar_proprietarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
