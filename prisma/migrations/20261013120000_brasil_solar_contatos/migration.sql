-- Contatos do pos-venda registrados em Acoes Diarias (ver src/lib/acoes-diarias.ts).
CREATE TABLE "brasil_solar_contatos" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "proprietario_id" TEXT,
    "alerta_id" TEXT,
    "user_id" TEXT,
    "canal" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "observacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brasil_solar_contatos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brasil_solar_contatos_client_id_created_at_idx" ON "brasil_solar_contatos"("client_id", "created_at");
CREATE INDEX "brasil_solar_contatos_proprietario_id_created_at_idx" ON "brasil_solar_contatos"("proprietario_id", "created_at");
CREATE INDEX "brasil_solar_contatos_alerta_id_idx" ON "brasil_solar_contatos"("alerta_id");
CREATE INDEX "brasil_solar_contatos_created_at_idx" ON "brasil_solar_contatos"("created_at");

ALTER TABLE "brasil_solar_contatos" ADD CONSTRAINT "brasil_solar_contatos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "brasil_solar_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brasil_solar_contatos" ADD CONSTRAINT "brasil_solar_contatos_proprietario_id_fkey" FOREIGN KEY ("proprietario_id") REFERENCES "brasil_solar_proprietarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brasil_solar_contatos" ADD CONSTRAINT "brasil_solar_contatos_alerta_id_fkey" FOREIGN KEY ("alerta_id") REFERENCES "monitoring_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brasil_solar_contatos" ADD CONSTRAINT "brasil_solar_contatos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
