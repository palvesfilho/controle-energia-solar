-- O peso visual do comunicado: INFORMATIVO (o de sempre), ATENCAO ou URGENTE.
--
-- Aditiva e com default: as linhas existentes viram INFORMATIVO, que e
-- exatamente o que elas ja eram. Nenhum comunicado muda de aparencia por causa
-- desta coluna.
--
-- Vale so para o EMAIL. O WhatsApp nao tem layout — la a mensagem e texto puro.

ALTER TABLE "comunicados"
  ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'INFORMATIVO';
