-- Fatura com a nossa marca + cadência de lembretes.
--
-- 1) `token_publico` é a chave que abre a página de pagamento (/fatura/<token>)
--    e serve o demonstrativo em PDF sem login. Anulável de propósito: as 1.429
--    cobranças anteriores não têm token e não precisam — ele nasce na emissão.
--
-- 2) `cobranca_lembretes` guarda cada lembrete disparado. O índice único é a
--    regra, não higiene: sem ele um restart de contêiner no dia do vencimento
--    manda o mesmo lembrete outra vez, e cobrança repetida queima a confiança
--    do cliente mais rápido do que atraso nenhum.
--
--    `dia_referencia` é o DIA da régua (-3 antes, 1/5/10 no atraso), não a data.
--    Guardar o dia é o que mantém a chave estável se o vencimento for alterado.

ALTER TABLE "consumer_unit_billings" ADD COLUMN "token_publico" TEXT;

CREATE UNIQUE INDEX "consumer_unit_billings_token_publico_key"
  ON "consumer_unit_billings"("token_publico");

CREATE TABLE "cobranca_lembretes" (
  "id"             TEXT NOT NULL,
  "billing_id"     TEXT NOT NULL,
  "tipo"           TEXT NOT NULL,
  "dia_referencia" INTEGER NOT NULL,
  "canal"          TEXT NOT NULL,
  "enviado_em"     TIMESTAMP(3),
  "erro"           TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cobranca_lembretes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cobranca_lembretes_billing_id_tipo_dia_referencia_canal_key"
  ON "cobranca_lembretes"("billing_id", "tipo", "dia_referencia", "canal");

CREATE INDEX "cobranca_lembretes_billing_id_idx"
  ON "cobranca_lembretes"("billing_id");

ALTER TABLE "cobranca_lembretes"
  ADD CONSTRAINT "cobranca_lembretes_billing_id_fkey"
  FOREIGN KEY ("billing_id") REFERENCES "consumer_unit_billings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
