-- Campos Grupo A (tarifa binômia + posto Ponta/FPonta + demanda + TUSD-G + reativo).
-- Validado contra UC 4003710227 (OBA Verde-A4). Todos opcionais — Grupo B fica null.

-- ============ ConsumerUnit (cadastro contratual) ============
ALTER TABLE "consumer_units" ADD COLUMN "modalidade_tarifaria" TEXT;
ALTER TABLE "consumer_units" ADD COLUMN "tensao_nominal_contratada_v" REAL;
ALTER TABLE "consumer_units" ADD COLUMN "demanda_contratada_kw" REAL;
ALTER TABLE "consumer_units" ADD COLUMN "demanda_contratada_ponta_kw" REAL;
ALTER TABLE "consumer_units" ADD COLUMN "geracao_contratada_kw" REAL;

-- ============ ConsumerBill (mensal, derivado da fatura) ============

-- Consumo por posto
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_ponta_kwh" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_fora_ponta_kwh" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_te_ponta_kwh" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_te_ponta_valor" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_te_fora_ponta_kwh" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_te_fora_ponta_valor" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_tusd_ponta_kwh" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_tusd_ponta_valor" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_tusd_fora_ponta_kwh" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "consumo_tusd_fora_ponta_valor" REAL;

-- Tarifas por posto
ALTER TABLE "consumer_bills" ADD COLUMN "tarifa_te_ponta" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "tarifa_te_fora_ponta" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "tarifa_tusd_ponta" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "tarifa_tusd_fora_ponta" REAL;

-- Bandeira por posto
ALTER TABLE "consumer_bills" ADD COLUMN "bandeira_valor_ponta" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "bandeira_valor_fora_ponta" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "bandeira_credito_ponta_valor" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "bandeira_credito_fora_ponta_valor" REAL;

-- Demanda medida + ultrapassagem
ALTER TABLE "consumer_bills" ADD COLUMN "demanda_medida_kw" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "demanda_medida_ponta_kw" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "demanda_tusd_valor" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "tarifa_demanda" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "demanda_ultrapassagem_kw" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "demanda_ultrapassagem_valor" REAL;

-- TUSD-G (geração)
ALTER TABLE "consumer_bills" ADD COLUMN "tusd_geracao_kw" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "tusd_geracao_valor" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "tarifa_tusd_geracao" REAL;

-- Compensação Lei 14.300 por posto (TUSD+TE somados)
ALTER TABLE "consumer_bills" ADD COLUMN "injetada_ponta_kwh" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "injetada_ponta_valor" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "injetada_fora_ponta_kwh" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "injetada_fora_ponta_valor" REAL;

-- Saldo de créditos por posto
ALTER TABLE "consumer_bills" ADD COLUMN "saldo_ponta_kwh" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "saldo_fora_ponta_kwh" REAL;

-- Reativo excedente
ALTER TABLE "consumer_bills" ADD COLUMN "reativo_excedente_ponta_kvar" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "reativo_excedente_ponta_valor" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "reativo_excedente_fora_ponta_kvar" REAL;
ALTER TABLE "consumer_bills" ADD COLUMN "reativo_excedente_fora_ponta_valor" REAL;

-- Leituras múltiplas (8 grandezas) — JSON
ALTER TABLE "consumer_bills" ADD COLUMN "leituras_medidor_json" TEXT;
