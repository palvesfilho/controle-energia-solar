-- Curva intradiária: espaço em disco.
--
-- Em 18/08/26 o volume do Postgres (1 GB no Railway) estava em 97%, com
-- `inverter_samples` ocupando 524 MB dos 730 MB do banco e crescendo 37 MB/dia
-- sem teto. A janela de retenção passou para 7 dias (`intraday-prune.ts`), e
-- estes dois ajustes acompanham a mudança.

-- 1. Índice duplicado. `monitoring_logs_client_id_data_key` (do @@unique) já é
-- um btree em (client_id, data), nas mesmas colunas e na mesma ordem, e serve
-- toda query que este servia. Custava 41 MB com idx_scan = 0.
DROP INDEX IF EXISTS "monitoring_logs_client_id_data_idx";

-- 2. Autovacuum por tabela. Com a janela deslizante `inverter_samples` apaga
-- ~91 mil linhas/dia. No default (scale_factor 0.2) o autovacuum só acordaria
-- com 20% de linhas mortas — em regime pleno isso é 1,4 dia de atraso, e o
-- espaço morto se acumula em vez de ser reciclado pelos inserts do dia
-- seguinte. Sem isto a poda não devolve o espaço que promete.
ALTER TABLE "inverter_samples"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE "monitoring_logs"
  SET (autovacuum_vacuum_scale_factor = 0.10, autovacuum_analyze_scale_factor = 0.10);
