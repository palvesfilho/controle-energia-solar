-- AlterTable
ALTER TABLE "brasil_solar_proprietarios" ADD COLUMN     "clerk_user_id" TEXT;

-- CreateTable
CREATE TABLE "brasil_solar_acessos" (
    "id" TEXT NOT NULL,
    "proprietario_id" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "asaas_customer_id" TEXT,
    "asaas_charge_id" TEXT,
    "asaas_subscription_id" TEXT,
    "checkout_url" TEXT,
    "convite_token" TEXT,
    "vigente_ate" TIMESTAMP(3),
    "convite_enviado_em" TIMESTAMP(3),
    "pago_em" TIMESTAMP(3),
    "ativado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brasil_solar_acessos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brasil_solar_acessos_proprietario_id_key" ON "brasil_solar_acessos"("proprietario_id");

-- CreateIndex
CREATE UNIQUE INDEX "brasil_solar_acessos_convite_token_key" ON "brasil_solar_acessos"("convite_token");

-- CreateIndex
CREATE INDEX "brasil_solar_acessos_status_idx" ON "brasil_solar_acessos"("status");

-- CreateIndex
CREATE INDEX "brasil_solar_acessos_asaas_charge_id_idx" ON "brasil_solar_acessos"("asaas_charge_id");

-- CreateIndex
CREATE INDEX "brasil_solar_acessos_asaas_subscription_id_idx" ON "brasil_solar_acessos"("asaas_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "brasil_solar_proprietarios_clerk_user_id_key" ON "brasil_solar_proprietarios"("clerk_user_id");

-- AddForeignKey
ALTER TABLE "brasil_solar_acessos" ADD CONSTRAINT "brasil_solar_acessos_proprietario_id_fkey" FOREIGN KEY ("proprietario_id") REFERENCES "brasil_solar_proprietarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

