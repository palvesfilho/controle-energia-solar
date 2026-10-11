-- Transferência de créditos: o documento da RGE divide o saldo em % (não em kWh),
-- e o total em kWh só se conhece depois. Também guarda quem assina o pedido.

-- AlterTable
ALTER TABLE "credit_transfers" ALTER COLUMN "kwh_total" DROP NOT NULL,
ADD COLUMN     "titular_nome" TEXT,
ADD COLUMN     "titular_email" TEXT;

-- AlterTable: percentual entra vazio, é preenchido pelo que já existe e só então vira obrigatório.
ALTER TABLE "credit_transfer_items" ADD COLUMN "percentual" DOUBLE PRECISION;

UPDATE "credit_transfer_items" i
SET "percentual" = ROUND((i."kwh" / t."kwh_total" * 100)::numeric, 2)::double precision
FROM "credit_transfers" t
WHERE t."id" = i."transfer_id" AND t."kwh_total" > 0;

UPDATE "credit_transfer_items" SET "percentual" = 100 WHERE "percentual" IS NULL;

ALTER TABLE "credit_transfer_items" ALTER COLUMN "percentual" SET NOT NULL,
ALTER COLUMN "kwh" DROP NOT NULL;
