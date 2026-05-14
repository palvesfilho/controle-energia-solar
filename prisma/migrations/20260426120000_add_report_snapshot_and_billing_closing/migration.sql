-- Snapshot dos numeros do relatorio capturado no momento do publish.
-- Quando preenchido, o PDF eh renderizado a partir daqui (imutavel).
-- Quando NULL, o gerador recalcula da base.
ALTER TABLE "monthly_reports" ADD COLUMN "snapshot_json" TEXT;

-- Quem disparou a publicacao (audit trail).
ALTER TABLE "monthly_reports" ADD COLUMN "published_by_user_id" TEXT;

-- Encerramento do faturamento mensal da usina: setado quando o financeiro
-- sobe o comprovante de pagamento. Trava todas as edicoes do mes para
-- nao-admin. Apenas ADMIN reabre (limpa encerrado_em).
ALTER TABLE "plant_billings" ADD COLUMN "encerrado_em" DATETIME;
ALTER TABLE "plant_billings" ADD COLUMN "encerrado_por_user_id" TEXT;
