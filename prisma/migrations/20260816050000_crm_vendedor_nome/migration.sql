-- Nome completo de quem fechou o negocio, vindo de `usuarios.nome` no CRM.
--
-- Ate aqui so o e-mail do vendedor viajava, e so na linha da VENDA. Quem olha
-- a fila por UC nao via vendedor nenhum, e "carolina@solvesm.eng.br" obriga
-- quem le a traduzir o endereco de volta para uma pessoa.
--
-- Sao DOIS vendedores possiveis e eles divergem: o da PROPOSTA (quem fechou,
-- e quem a comissao segue) e o da ADESAO (quem gerou o termo). Em 2 das 22
-- adesoes medidas em 16/08/2026 os dois sao pessoas diferentes. `vendedor_nome`
-- guarda o da proposta; `vendedor_adesao_nome` so e preenchido quando difere,
-- para a tela poder mostrar a diferenca em vez de escolher em silencio.

ALTER TABLE "crm_uc_importada"
    ADD COLUMN "vendedor_nome" TEXT,
    ADD COLUMN "vendedor_email" TEXT,
    ADD COLUMN "vendedor_adesao_nome" TEXT;

ALTER TABLE "crm_venda_importada"
    ADD COLUMN "vendedor_nome" TEXT;
