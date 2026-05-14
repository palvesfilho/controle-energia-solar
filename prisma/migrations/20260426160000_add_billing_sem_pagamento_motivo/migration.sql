-- Encerramento "sem pagamento": quando o relatorio do mes nao gera valor a
-- pagar (saldo negativo, sem geracao, pausa, etc), o operador encerra o mes
-- formalizando o motivo aqui em vez de subir comprovante. Mesma trava de
-- edicao da via comprovante (encerradoEm setado).
ALTER TABLE "plant_billings" ADD COLUMN "sem_pagamento_motivo" TEXT;
