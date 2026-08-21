-- Marco da liberação de cobrança da UC (decisão do operador ao ver a primeira
-- compensação na fatura). A FASE da UC — em implantação x faturando — continua
-- derivada das faturas, não daqui. Ver src/lib/uc-implantacao.ts.
ALTER TABLE "consumer_units" ADD COLUMN "cobranca_liberada_em" TIMESTAMP(3);
ALTER TABLE "consumer_units" ADD COLUMN "cobranca_liberada_por" TEXT;

-- Backfill: as UCs que JÁ compensam quando este controle entra no ar já estão
-- em cobrança normal há meses (a mais recente começou em 02/2026). Sem esta
-- marcação o aviso nasceria com 84 UCs "novas" de uma vez e o operador
-- aprenderia a ignorar o sino no primeiro dia. Daqui pra frente só avisa quem
-- de fato compensar pela primeira vez.
UPDATE "consumer_units" cu
SET "cobranca_liberada_em" = NOW(),
    "cobranca_liberada_por" = 'Backfill - ja em cobranca antes do controle de implantacao'
WHERE EXISTS (
  SELECT 1
  FROM "consumer_bills" b
  WHERE b."consumer_unit_id" = cu."id"
    AND (
      COALESCE(b."energia_compensada", 0) > 0
      OR COALESCE(b."injetada_ouc_te_kwh", 0) > 0
      OR COALESCE(b."injetada_ouc_tusd_kwh", 0) > 0
    )
);
