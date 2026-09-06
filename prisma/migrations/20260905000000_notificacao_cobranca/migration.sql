-- Comunicação com o cliente na emissão da cobrança: email (SMTP do Google) e
-- aviso por WhatsApp (Uazapi).
--
-- `email_enviado_em` / `email_erro` já existiam. O que faltava era a PROVA do
-- envio: para qual endereço e para qual número. Sem isso, "não recebi" vira
-- discussão sem evidência — o cadastro do cliente pode ter mudado depois do
-- disparo, e aí não há como saber para onde a mensagem foi.
--
-- `whatsapp_numero` guarda o E.164 já normalizado (55DD9XXXXXXXX), que quase
-- nunca é igual ao que está no cadastro: os telefones vêm em 10 ou 11 dígitos
-- e sem DDI (ver lib/uc-trava-contato.ts).
ALTER TABLE "consumer_unit_billings"
  ADD COLUMN "email_destinatarios"  TEXT,
  ADD COLUMN "whatsapp_enviado_em"  TIMESTAMP(3),
  ADD COLUMN "whatsapp_erro"        TEXT,
  ADD COLUMN "whatsapp_numero"      TEXT;
