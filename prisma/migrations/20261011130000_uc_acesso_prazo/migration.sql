-- Prazo para cadastrar o acesso a concessionaria da UC (ver src/lib/uc-acesso-prazo.ts).
ALTER TABLE "consumer_units" ADD COLUMN "acesso_prazo_em" TIMESTAMP(3);
