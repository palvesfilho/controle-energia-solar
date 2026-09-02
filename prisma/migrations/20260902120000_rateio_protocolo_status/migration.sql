-- Acompanhamento do protocolo do rateio na concessionária (robô logado da RGE).
--
-- `protocolo_situacao` guarda a leitura NORMALIZADA e `protocolo_status_rge` o
-- texto literal do cartão — o literal é a prova, a situação é interpretação
-- nossa. Duas datas de propósito (lição da cpfl_credentials): `consultado_em` é
-- a última consulta que trouxe resposta, `tentativa_em` é a última tentativa.
ALTER TABLE "rateio_versions"
  ADD COLUMN "aceito_por"              TEXT,
  ADD COLUMN "protocolo_situacao"      TEXT,
  ADD COLUMN "protocolo_status_rge"    TEXT,
  ADD COLUMN "protocolo_consultado_em" TIMESTAMP(3),
  ADD COLUMN "protocolo_tentativa_em"  TIMESTAMP(3),
  ADD COLUMN "protocolo_erro"          TEXT;

-- Histórico de cada consulta. Existe por causa do aceite automático: um rateio
-- que vira VIGENTE sozinho precisa da linha que mostra o que a RGE dizia.
CREATE TABLE "rateio_protocolo_consultas" (
  "id"             TEXT NOT NULL,
  "version_id"     TEXT NOT NULL,
  "protocolo"      TEXT NOT NULL,
  "situacao"       TEXT NOT NULL,
  "status_rge"     TEXT,
  "erro"           TEXT,
  "detalhe"        JSONB,
  "aceitou_rateio" BOOLEAN NOT NULL DEFAULT false,
  "consultado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rateio_protocolo_consultas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rateio_protocolo_consultas_version_id_consultado_em_idx"
  ON "rateio_protocolo_consultas" ("version_id", "consultado_em");

ALTER TABLE "rateio_protocolo_consultas"
  ADD CONSTRAINT "rateio_protocolo_consultas_version_id_fkey"
  FOREIGN KEY ("version_id") REFERENCES "rateio_versions" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
