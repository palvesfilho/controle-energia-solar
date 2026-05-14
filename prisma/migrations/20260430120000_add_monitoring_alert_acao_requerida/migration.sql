-- Ação requerida sugerida pro time de engenharia/pós-venda em cada alerta.
-- Valores: IR_EM_CAMPO, VERIFICAR_REMOTO, CONTATAR_CLIENTE, CONTATAR_CONCESSIONARIA, MONITORAR.
-- Default aplicado na criação a partir do tipo do alerta (ver lib/alertas-usinas.ts).
ALTER TABLE "monitoring_alerts"
  ADD COLUMN "acao_requerida" TEXT;

CREATE INDEX "monitoring_alerts_acao_requerida_idx"
  ON "monitoring_alerts"("acao_requerida");

-- Backfill: aplica o default a partir do tipo nos alertas já existentes em aberto/andamento.
UPDATE "monitoring_alerts"
SET "acao_requerida" = CASE "tipo"
  WHEN 'OFFLINE' THEN 'VERIFICAR_REMOTO'
  WHEN 'BAIXA_GERACAO' THEN 'VERIFICAR_REMOTO'
  WHEN 'ERRO_INVERSOR' THEN 'IR_EM_CAMPO'
  WHEN 'TEMPERATURA_INVERSOR' THEN 'IR_EM_CAMPO'
  WHEN 'TENSAO_FORA' THEN 'CONTATAR_CONCESSIONARIA'
  WHEN 'FREQUENCIA_REDE' THEN 'CONTATAR_CONCESSIONARIA'
  WHEN 'CONSUMO_ELEVADO' THEN 'CONTATAR_CLIENTE'
  WHEN 'FATURA_IRREGULAR' THEN 'CONTATAR_CLIENTE'
  WHEN 'MANUTENCAO' THEN 'MONITORAR'
  ELSE NULL
END
WHERE "acao_requerida" IS NULL;
