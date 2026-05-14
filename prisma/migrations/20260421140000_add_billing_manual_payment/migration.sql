-- Marca pagamento manual da cobrança do cliente final (PIX direto, dinheiro, etc.).
-- Quando o cliente paga fora do Asaas, o operador registra aqui o canal e a nota.
ALTER TABLE "consumer_unit_billings" ADD COLUMN "forma_pagamento" TEXT;
ALTER TABLE "consumer_unit_billings" ADD COLUMN "pagamento_nota" TEXT;
