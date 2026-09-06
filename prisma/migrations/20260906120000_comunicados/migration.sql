-- COMUNICADOS — mensagem em massa por email e WhatsApp para dois públicos da
-- Associação: o investidor (dono de usina) e o cliente com desconto na fatura.
--
-- 🪤 Duas escolhas que parecem descuido e não são:
--
-- 1) O destinatário é DESNORMALIZADO (nome, email, telefone copiados) e SEM
--    chave estrangeira para `investors` ou `consumers`. Um log de envio
--    responde "para onde isto foi NAQUELE dia". Lendo o cadastro atual, a
--    resposta mudaria a cada telefone corrigido, e apagar um cadastro apagaria
--    a prova do que foi enviado.
--
-- 2) O índice único `(comunicado, tipo, destinatário)` é a REGRA de não mandar
--    duas vezes, não higiene de tabela. Sem ele, um clique repetido no botão
--    ou um restart no meio do disparo reenvia tudo — e mensagem em massa
--    repetida é o jeito mais rápido de perder a lista.

CREATE TABLE "comunicados" (
  "id"                  TEXT NOT NULL,
  "nome"                TEXT NOT NULL,
  "publico"             TEXT NOT NULL,
  "publico_filtro"      JSONB,
  "publico_resumo"      TEXT,
  "canais"              TEXT NOT NULL DEFAULT 'EMAIL',
  "assunto"             TEXT NOT NULL,
  "corpo_email"         TEXT NOT NULL,
  "corpo_whatsapp"      TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'RASCUNHO',
  "total_destinatarios" INTEGER NOT NULL DEFAULT 0,
  "total_email"         INTEGER NOT NULL DEFAULT 0,
  "total_whatsapp"      INTEGER NOT NULL DEFAULT 0,
  "simulacao"           BOOLEAN NOT NULL DEFAULT true,
  "criado_por_id"       TEXT,
  "criado_por_nome"     TEXT,
  "enviado_em"          TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comunicados_status_idx" ON "comunicados"("status");
CREATE INDEX "comunicados_created_at_idx" ON "comunicados"("created_at");

CREATE TABLE "comunicado_envios" (
  "id"                  TEXT NOT NULL,
  "comunicado_id"       TEXT NOT NULL,
  "destinatario_tipo"   TEXT NOT NULL,
  "destinatario_id"     TEXT NOT NULL,
  "destinatario_nome"   TEXT NOT NULL,
  "email"               TEXT,
  "telefone"            TEXT,
  "email_status"        TEXT NOT NULL DEFAULT 'NAO_APLICA',
  "email_erro"          TEXT,
  "email_enviado_em"    TIMESTAMP(3),
  "whatsapp_status"     TEXT NOT NULL DEFAULT 'NAO_APLICA',
  "whatsapp_erro"       TEXT,
  "whatsapp_enviado_em" TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "comunicado_envios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comunicado_envios_comunicado_id_idx" ON "comunicado_envios"("comunicado_id");

CREATE UNIQUE INDEX "comunicado_envios_comunicado_id_destinatario_tipo_destinat_key"
  ON "comunicado_envios"("comunicado_id", "destinatario_tipo", "destinatario_id");

ALTER TABLE "comunicado_envios"
  ADD CONSTRAINT "comunicado_envios_comunicado_id_fkey"
  FOREIGN KEY ("comunicado_id") REFERENCES "comunicados"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
