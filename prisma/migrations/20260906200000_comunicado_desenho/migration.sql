-- A ESTRUTURA do email do comunicado, e os campos que dois desenhos exigem.
--
-- `desenho` decide onde as coisas ficam; `tipo` (que ja existe) decide com que
-- forca. Sao eixos diferentes e se combinam.
--
-- Aditiva: `desenho` nasce PADRAO, que e exatamente o que os comunicados
-- existentes ja eram. Os campos de destaque e botao sao anulaveis porque so
-- dois dos sete desenhos os usam — obriga-los em todos encheria a tabela de
-- coluna vazia e a tela de campo sem sentido.

ALTER TABLE "comunicados"
  ADD COLUMN "desenho"         TEXT NOT NULL DEFAULT 'PADRAO',
  ADD COLUMN "destaque_rotulo" TEXT,
  ADD COLUMN "destaque_valor"  TEXT,
  ADD COLUMN "destaque_nota"   TEXT,
  ADD COLUMN "botao_texto"     TEXT,
  ADD COLUMN "botao_url"       TEXT,
  ADD COLUMN "botao_nota"      TEXT;
