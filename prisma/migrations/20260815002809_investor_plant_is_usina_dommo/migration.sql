-- Regime "USINA DOMMO SOLUCOES": a gestora fica com 100% do lucro da operacao.
-- Aditiva e com default: vinculos existentes seguem false (regime de contrato).
-- AlterTable
ALTER TABLE "investor_plants" ADD COLUMN     "is_usina_dommo" BOOLEAN NOT NULL DEFAULT false;
