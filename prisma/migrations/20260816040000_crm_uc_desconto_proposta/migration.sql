-- O desconto combinado com o cliente na apresentacao da proposta passa a
-- viajar do CRM ate o cadastro da UC, em vez de ser redigitado de cabeca.
--
-- Fonte: `propostas.dados_snapshot->dados_desconto_fatura` no Supabase do CRM,
-- chaves `desconto` (15 = 15% off), `plano` e `fidelidade`. NAO e a coluna
-- `propostas.desconto_pct`, que pertence ao fluxo de venda de equipamento e
-- esta zerada nas 37 propostas de desconto (medido em 15/08/2026).
--
-- Tudo nullable e sem default: proposta que nao diz o desconto tem que
-- aparecer como "nao disse". Um default de 15 apagaria justamente o caso que
-- a operacao precisa ver.

ALTER TABLE "crm_uc_importada"
    ADD COLUMN "desconto_percent" DOUBLE PRECISION,
    ADD COLUMN "plano_contrato" TEXT,
    ADD COLUMN "fidelidade_meses" INTEGER;
