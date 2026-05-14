-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'INVESTOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone" TEXT,
    "document" TEXT,
    "cpf" TEXT,
    "data_nascimento" TIMESTAMP(3),
    "endereco" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "cep" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "nome_empresa" TEXT,
    "cnpj" TEXT,
    "endereco_empresa" TEXT,
    "numero_empresa" TEXT,
    "complemento_empresa" TEXT,
    "cep_empresa" TEXT,
    "bairro_empresa" TEXT,
    "cidade_empresa" TEXT,
    "chave_pix" TEXT,
    "additional_emails" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "potencia_modulos" DOUBLE PRECISION,
    "potencia_inversor" DOUBLE PRECISION,
    "geracao_media_mensal" DOUBLE PRECISION,
    "enquadramento" TEXT,
    "unidade_consumidora" TEXT,
    "concessionaria" TEXT,
    "formato_leitura" TEXT,
    "regra_instalacao" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "inversor_marca" TEXT,
    "inversor_modelo" TEXT,
    "monitoramento_plataforma" TEXT,
    "monitoramento_login" TEXT,
    "monitoramento_senha" TEXT,
    "monitoramento_url" TEXT,
    "fonte" TEXT,
    "numero_usina" TEXT,
    "potencia_instalada" DOUBLE PRECISION,
    "grupo" TEXT,
    "cpf_cnpj" TEXT,
    "distribuidora" TEXT,
    "acesso" TEXT,
    "status_contrato" TEXT,
    "data_assinatura_contrato" TIMESTAMP(3),
    "login_distribuidora" TEXT,
    "senha_distribuidora" TEXT,
    "codigo_cliente" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_documents" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size" INTEGER,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_billings" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "valor_total" DOUBLE PRECISION,
    "observacoes" TEXT,
    "relatorio_gerado_url" TEXT,
    "relatorio_gerado_at" TIMESTAMP(3),
    "relatorio_gerado_by" TEXT,
    "nota_fiscal_url" TEXT,
    "nota_fiscal_at" TIMESTAMP(3),
    "recibo_terra_url" TEXT,
    "recibo_terra_at" TIMESTAMP(3),
    "recibo_aluguel_url" TEXT,
    "recibo_aluguel_at" TIMESTAMP(3),
    "comprovante_pagamento_url" TEXT,
    "comprovante_pagamento_at" TIMESTAMP(3),
    "comprovante_pagamento_by" TEXT,
    "encerrado_em" TIMESTAMP(3),
    "encerrado_por_user_id" TEXT,
    "sem_pagamento_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plant_billings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_plants" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "share_percent" DOUBLE PRECISION,
    "valor_kwh_contrato" DOUBLE PRECISION,
    "gestao_fixa_contrato" DOUBLE PRECISION,

    CONSTRAINT "investor_plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "numero_relatorio" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "injecao_periodo" DOUBLE PRECISION,
    "creditos_anteriores" DOUBLE PRECISION,
    "creditos_utilizados" DOUBLE PRECISION,
    "consumo_instantaneo" DOUBLE PRECISION,
    "auto_consumo_usina" DOUBLE PRECISION,
    "creditos_atuais" DOUBLE PRECISION,
    "creditos_vencer" DOUBLE PRECISION,
    "creditos_utilizados_fin" DOUBLE PRECISION,
    "valor_kwh_contrato" DOUBLE PRECISION,
    "valor_bruto_gerador" DOUBLE PRECISION,
    "gestao_mensal_fixa" DOUBLE PRECISION,
    "taxa_minima_conc" DOUBLE PRECISION,
    "inadimplencia" DOUBLE PRECISION,
    "multas_outros" DOUBLE PRECISION,
    "remuneracao_periodo" DOUBLE PRECISION,
    "observacoes" TEXT,
    "ai_analysis" TEXT,
    "ai_validation_status" TEXT,
    "snapshot_json" TEXT,
    "upload_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by_user_id" TEXT,

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_monthly" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "geracao_total" DOUBLE PRECISION,
    "injecao_total" DOUBLE PRECISION,
    "auto_consumo" DOUBLE PRECISION,
    "disponibilidade" DOUBLE PRECISION,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plant_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_monthly" (
    "id" TEXT NOT NULL,
    "consumer_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "consumo_total" DOUBLE PRECISION,
    "creditos_recebidos" DOUBLE PRECISION,
    "creditos_utilizados" DOUBLE PRECISION,
    "saldo_creditos" DOUBLE PRECISION,
    "economia_gerada" DOUBLE PRECISION,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumer_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "document" TEXT,
    "endereco" TEXT,
    "unidade_consumidora" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cpf_cnpj" TEXT,
    "login_portal" TEXT,
    "emails_recebimento" TEXT,
    "data_cadastro" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_units" (
    "id" TEXT NOT NULL,
    "consumer_id" TEXT,
    "plant_id" TEXT,
    "nome" TEXT NOT NULL,
    "codigo_uc" TEXT NOT NULL,
    "cpf_cnpj" TEXT,
    "distribuidora" TEXT,
    "grupo" TEXT,
    "sub_grupo" TEXT,
    "modalidade" TEXT,
    "consumo_medio" DOUBLE PRECISION,
    "cep" TEXT,
    "logradouro" TEXT,
    "complemento" TEXT,
    "numero" TEXT,
    "cidade" TEXT,
    "consultor" TEXT,
    "comissao" TEXT,
    "metodo_pagamento" TEXT,
    "regra_remuneracao" TEXT,
    "percent_compensado" DOUBLE PRECISION,
    "percent_bandeira" DOUBLE PRECISION,
    "regra_vencimento" TEXT,
    "valor_vencimento" DOUBLE PRECISION,
    "status_contrato" TEXT,
    "vigencia_compensacao" TEXT,
    "login_distribuidora" TEXT,
    "senha_distribuidora" TEXT,
    "tem_geracao_propria" BOOLEAN NOT NULL DEFAULT false,
    "modalidade_tarifaria" TEXT,
    "tensao_nominal_contratada_v" DOUBLE PRECISION,
    "demanda_contratada_kw" DOUBLE PRECISION,
    "demanda_contratada_ponta_kw" DOUBLE PRECISION,
    "geracao_contratada_kw" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumer_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_unit_billings" (
    "id" TEXT NOT NULL,
    "consumer_unit_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor_fatura" DOUBLE PRECISION,
    "valor_compensado" DOUBLE PRECISION,
    "valor_economia" DOUBLE PRECISION,
    "valor_cobranca" DOUBLE PRECISION,
    "data_vencimento" TIMESTAMP(3),
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "installments" TEXT,
    "fatura_url" TEXT,
    "fatura_at" TIMESTAMP(3),
    "notificar_email" BOOLEAN NOT NULL DEFAULT true,
    "notificar_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "asaas_charge_id" TEXT,
    "asaas_invoice_url" TEXT,
    "asaas_status" TEXT,
    "asaas_synced_at" TIMESTAMP(3),
    "pago_em" TIMESTAMP(3),
    "forma_pagamento" TEXT,
    "pagamento_nota" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumer_unit_billings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_plants" (
    "id" TEXT NOT NULL,
    "consumer_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "cota_percent" DOUBLE PRECISION,
    "desconto_percent" DOUBLE PRECISION,

    CONSTRAINT "consumer_plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_bills" (
    "id" TEXT NOT NULL,
    "consumer_unit_id" TEXT,
    "plant_id" TEXT,
    "mes_referencia" INTEGER NOT NULL,
    "ano_referencia" INTEGER NOT NULL,
    "instalacao" TEXT,
    "valor_total" DOUBLE PRECISION,
    "vencimento" TIMESTAMP(3),
    "conta_paga" BOOLEAN NOT NULL DEFAULT false,
    "codigo_barras" TEXT,
    "pix_copia_cola" TEXT,
    "pago_em" TIMESTAMP(3),
    "banco_pagamento" TEXT,
    "comprovante_pagamento_url" TEXT,
    "comprovante_pagamento_at" TIMESTAMP(3),
    "consumo_kwh" DOUBLE PRECISION,
    "leitura_anterior" DOUBLE PRECISION,
    "leitura_atual" DOUBLE PRECISION,
    "dias_faturamento" INTEGER,
    "proxima_leitura" TIMESTAMP(3),
    "data_leitura_anterior" TIMESTAMP(3),
    "data_leitura_atual" TIMESTAMP(3),
    "consumo_te_kwh" DOUBLE PRECISION,
    "consumo_te_valor" DOUBLE PRECISION,
    "consumo_tusd_kwh" DOUBLE PRECISION,
    "consumo_tusd_valor" DOUBLE PRECISION,
    "energia_injetada" DOUBLE PRECISION,
    "energia_compensada" DOUBLE PRECISION,
    "saldo_creditos" DOUBLE PRECISION,
    "injetada_ouc_te_kwh" DOUBLE PRECISION,
    "injetada_ouc_te_valor" DOUBLE PRECISION,
    "injetada_ouc_tusd_kwh" DOUBLE PRECISION,
    "injetada_ouc_tusd_valor" DOUBLE PRECISION,
    "injetada_detalhes" TEXT,
    "historico_consumo" TEXT,
    "saldo_instalacao_kwh" DOUBLE PRECISION,
    "saldo_expirar_prox_mes_kwh" DOUBLE PRECISION,
    "participacao_geracao_pct" DOUBLE PRECISION,
    "validacao_status" TEXT,
    "validacao_diff_pct" DOUBLE PRECISION,
    "validacao_em" TIMESTAMP(3),
    "energia_injetada_medidor_kwh" DOUBLE PRECISION,
    "leitura_injetada_anterior" DOUBLE PRECISION,
    "leitura_injetada_atual" DOUBLE PRECISION,
    "constante_medidor_injetada" DOUBLE PRECISION,
    "custo_disp_tusd_kwh" DOUBLE PRECISION,
    "custo_disp_tusd_valor" DOUBLE PRECISION,
    "custo_disp_te_kwh" DOUBLE PRECISION,
    "custo_disp_te_valor" DOUBLE PRECISION,
    "consumo_ponta_kwh" DOUBLE PRECISION,
    "consumo_fora_ponta_kwh" DOUBLE PRECISION,
    "consumo_te_ponta_kwh" DOUBLE PRECISION,
    "consumo_te_ponta_valor" DOUBLE PRECISION,
    "consumo_te_fora_ponta_kwh" DOUBLE PRECISION,
    "consumo_te_fora_ponta_valor" DOUBLE PRECISION,
    "consumo_tusd_ponta_kwh" DOUBLE PRECISION,
    "consumo_tusd_ponta_valor" DOUBLE PRECISION,
    "consumo_tusd_fora_ponta_kwh" DOUBLE PRECISION,
    "consumo_tusd_fora_ponta_valor" DOUBLE PRECISION,
    "tarifa_te_ponta" DOUBLE PRECISION,
    "tarifa_te_fora_ponta" DOUBLE PRECISION,
    "tarifa_tusd_ponta" DOUBLE PRECISION,
    "tarifa_tusd_fora_ponta" DOUBLE PRECISION,
    "bandeira_valor_ponta" DOUBLE PRECISION,
    "bandeira_valor_fora_ponta" DOUBLE PRECISION,
    "bandeira_credito_ponta_valor" DOUBLE PRECISION,
    "bandeira_credito_fora_ponta_valor" DOUBLE PRECISION,
    "demanda_medida_kw" DOUBLE PRECISION,
    "demanda_medida_ponta_kw" DOUBLE PRECISION,
    "demanda_tusd_valor" DOUBLE PRECISION,
    "tarifa_demanda" DOUBLE PRECISION,
    "demanda_ultrapassagem_kw" DOUBLE PRECISION,
    "demanda_ultrapassagem_valor" DOUBLE PRECISION,
    "tusd_geracao_kw" DOUBLE PRECISION,
    "tusd_geracao_valor" DOUBLE PRECISION,
    "tarifa_tusd_geracao" DOUBLE PRECISION,
    "injetada_ponta_kwh" DOUBLE PRECISION,
    "injetada_ponta_valor" DOUBLE PRECISION,
    "injetada_fora_ponta_kwh" DOUBLE PRECISION,
    "injetada_fora_ponta_valor" DOUBLE PRECISION,
    "saldo_ponta_kwh" DOUBLE PRECISION,
    "saldo_fora_ponta_kwh" DOUBLE PRECISION,
    "reativo_excedente_ponta_kvar" DOUBLE PRECISION,
    "reativo_excedente_ponta_valor" DOUBLE PRECISION,
    "reativo_excedente_fora_ponta_kvar" DOUBLE PRECISION,
    "reativo_excedente_fora_ponta_valor" DOUBLE PRECISION,
    "leituras_medidor_json" TEXT,
    "tarifa_te" DOUBLE PRECISION,
    "tarifa_tusd" DOUBLE PRECISION,
    "bandeira_tarifaria" TEXT,
    "bandeira_valor" DOUBLE PRECISION,
    "consumo_instantaneo_kwh" DOUBLE PRECISION,
    "geracao_inversor_kwh" DOUBLE PRECISION,
    "geracao_inversor_origem" TEXT,
    "icms" DOUBLE PRECISION,
    "pis" DOUBLE PRECISION,
    "cofins" DOUBLE PRECISION,
    "juros_mora" DOUBLE PRECISION,
    "multa_atraso" DOUBLE PRECISION,
    "atualizacao_monetaria" DOUBLE PRECISION,
    "iluminacao_publica_cip" DOUBLE PRECISION,
    "ajuste_saldo_credito" DOUBLE PRECISION,
    "fonte_consulta" TEXT,
    "pdf_url" TEXT,
    "raw_json" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumer_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpfl_credentials" (
    "id" TEXT NOT NULL,
    "consumer_unit_id" TEXT,
    "plant_id" TEXT,
    "email_cpfl" TEXT NOT NULL,
    "senha_cpfl" TEXT NOT NULL,
    "instalacao" TEXT NOT NULL,
    "distribuidora" TEXT NOT NULL DEFAULT 'RGE',
    "ultima_sync" TIMESTAMP(3),
    "status_sync" TEXT,
    "erro_sync" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cpfl_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3),
    "processing_error" TEXT,
    "raw_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brasil_solar_clients" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf_cnpj" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "bairro" TEXT,
    "cep" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "potencia_instalada" DOUBLE PRECISION,
    "data_instalacao" TIMESTAMP(3),
    "modulos_marca" TEXT,
    "modulos_modelo" TEXT,
    "modulos_quantidade" INTEGER,
    "inversor_marca" TEXT,
    "inversor_modelo" TEXT,
    "inversor_quantidade" INTEGER,
    "inversor_potencia" DOUBLE PRECISION,
    "plataforma_monitoramento" TEXT,
    "monitoramento_login" TEXT,
    "monitoramento_senha" TEXT,
    "monitoramento_url" TEXT,
    "monitoramento_plant_id" TEXT,
    "concessionaria" TEXT,
    "codigo_uc" TEXT,
    "status_contrato" TEXT,
    "data_contrato" TIMESTAMP(3),
    "consultor" TEXT,
    "garantia_ate" TIMESTAMP(3),
    "investimento" DOUBLE PRECISION,
    "geracao_media_esperada" DOUBLE PRECISION,
    "geracao_anual_esperada" DOUBLE PRECISION,
    "geracao_contrato" DOUBLE PRECISION,
    "status_monitoramento" TEXT NOT NULL DEFAULT 'SEM_DADOS',
    "ultima_geracao" DOUBLE PRECISION,
    "ultima_leitura" TIMESTAMP(3),
    "geracao_mes_atual" DOUBLE PRECISION,
    "performance_ratio" DOUBLE PRECISION,
    "tensao_rede" DOUBLE PRECISION,
    "tensao_nominal_rede" DOUBLE PRECISION,
    "frequencia_rede" DOUBLE PRECISION,
    "temperatura_inversor" DOUBLE PRECISION,
    "ultima_metrica_em" TIMESTAMP(3),
    "observacoes_internas" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "consumer_id" TEXT,
    "plant_id" TEXT,
    "proprietario_id" TEXT,

    CONSTRAINT "brasil_solar_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brasil_solar_monitoring_plans" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3) NOT NULL,
    "valor_mensal" DOUBLE PRECISION,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brasil_solar_monitoring_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inverter_samples" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "ps_key" TEXT NOT NULL,
    "time_stamp" TIMESTAMP(3) NOT NULL,
    "p1_wh" DOUBLE PRECISION,
    "p2_wh" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inverter_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brasil_solar_proprietarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf_cnpj" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "codigo_uc" TEXT,
    "concessionaria" TEXT,
    "potencia_instalada" DOUBLE PRECISION,
    "modulos_marca" TEXT,
    "modulos_modelo" TEXT,
    "modulos_quantidade" INTEGER,
    "inversor_marca" TEXT,
    "inversor_modelo" TEXT,
    "inversor_quantidade" INTEGER,
    "inversor_potencia" DOUBLE PRECISION,
    "numero_fases" TEXT,
    "tipo_atendimento" TEXT,
    "observacoes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brasil_solar_proprietarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_logs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "geracao_diaria" DOUBLE PRECISION NOT NULL,
    "geracao_esperada" DOUBLE PRECISION,
    "pico_maximo" DOUBLE PRECISION,
    "horas_sol" DOUBLE PRECISION,
    "irradiacao" DOUBLE PRECISION,
    "temperatura" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_alerts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "severidade" TEXT NOT NULL DEFAULT 'MEDIA',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "resolvido_por" TEXT,
    "resolvido_em" TIMESTAMP(3),
    "observacao_resolucao" TEXT,
    "notificado_cliente" BOOLEAN NOT NULL DEFAULT false,
    "notificado_engenharia" BOOLEAN NOT NULL DEFAULT false,
    "acao_requerida" TEXT,
    "codigo_erro_fabricante" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta_thresholds" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold_critico" DOUBLE PRECISION,
    "threshold_medio" DOUBLE PRECISION,
    "threshold_baixo" DOUBLE PRECISION,
    "severidade_default" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerta_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inverter_error_codes" (
    "id" TEXT NOT NULL,
    "fabricante" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "severidade_sugerida" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inverter_error_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inverter_error_actions" (
    "id" TEXT NOT NULL,
    "error_code_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "acao_requerida" TEXT,

    CONSTRAINT "inverter_error_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obras" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "responsavel" TEXT,
    "cliente" TEXT,
    "local" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANEJAMENTO',
    "aprovacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "data_inicio_prevista" TIMESTAMP(3),
    "data_fim_prevista" TIMESTAMP(3),
    "data_inicio_real" TIMESTAMP(3),
    "data_fim_real" TIMESTAMP(3),
    "progresso" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plant_id" TEXT,
    "brasil_solar_client_id" TEXT,
    "brasil_solar_proprietario_id" TEXT,
    "equipe_id" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'MEDIA',
    "observacoes" TEXT,
    "documento_pdf_gerado_em" TIMESTAMP(3),
    "conferencia_pdf_gerado_em" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_lista_materiais" (
    "id" TEXT NOT NULL,
    "obra_id" TEXT NOT NULL,
    "responsavel" TEXT,
    "numero_serie_inversor" TEXT,
    "observacoes" TEXT,
    "pdf_relative_path" TEXT,
    "pdf_upload_id" TEXT,
    "pdf_gerado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obra_lista_materiais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_lista_material_itens" (
    "id" TEXT NOT NULL,
    "lista_id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "especificacao" TEXT,
    "quantidade" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obra_lista_material_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_tarefas" (
    "id" TEXT NOT NULL,
    "obra_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "data_inicio_plan" TIMESTAMP(3) NOT NULL,
    "data_fim_plan" TIMESTAMP(3) NOT NULL,
    "duracao_dias" INTEGER NOT NULL,
    "data_inicio_real" TIMESTAMP(3),
    "data_fim_real" TIMESTAMP(3),
    "progresso" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NAO_INICIADA',
    "responsavel" TEXT,
    "cor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obra_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_dependencias" (
    "id" TEXT NOT NULL,
    "tarefa_id" TEXT NOT NULL,
    "depende_de_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'FS',
    "lag_dias" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_dependencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipes_execucao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone_responsavel" TEXT,
    "cor" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipes_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra_materiais_padrao" (
    "id" TEXT NOT NULL,
    "potencia_w" INTEGER NOT NULL,
    "disjuntor_a" INTEGER,
    "cabo_mm2" DOUBLE PRECISION,
    "cd_posicoes" TEXT,
    "dps_qtd" INTEGER,
    "barramento" TEXT,
    "canaleta" TEXT,
    "caixa_passagem" TEXT,
    "placa_rge" INTEGER,
    "placa_pisar_modulos" INTEGER,
    "placa_gerador" INTEGER,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obra_materiais_padrao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribuidora_emails" (
    "id" TEXT NOT NULL,
    "distribuidora" TEXT NOT NULL,
    "email_destino" TEXT NOT NULL,
    "email_remetente" TEXT NOT NULL,
    "email_cc" TEXT,
    "nome_responsavel" TEXT,
    "observacoes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distribuidora_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateio_versions" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE_ACEITE',
    "observacao" TEXT,
    "vigente_a_partir_de" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_em" TIMESTAMP(3),
    "aceito_em" TIMESTAMP(3),
    "rejeitado_em" TIMESTAMP(3),
    "substituido_em" TIMESTAMP(3),
    "criado_por_user_id" TEXT,

    CONSTRAINT "rateio_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateio_items" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "consumer_unit_id" TEXT NOT NULL,
    "percentual" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "rateio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_payables" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "consumer_unit_id" TEXT NOT NULL,
    "mes_referencia" INTEGER NOT NULL,
    "ano_referencia" INTEGER NOT NULL,
    "parcela_index" INTEGER NOT NULL DEFAULT 0,
    "share_percent" DOUBLE PRECISION NOT NULL,
    "valor_kwh_contrato" DOUBLE PRECISION NOT NULL,
    "rateio_version_id" TEXT,
    "kwh_compensado_base" DOUBLE PRECISION NOT NULL,
    "kwh_compensado_ajuste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valor_bruto" DOUBLE PRECISION NOT NULL,
    "valor_ajuste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valor_abatido_debito" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kwh_credito_legado_abatido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valor_liquido" DOUBLE PRECISION NOT NULL,
    "motivo_ajuste" TEXT,
    "valor_real_pago" DOUBLE PRECISION,
    "motivo_valor_real_pago" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_COMPENSACAO',
    "consumer_bill_id" TEXT,
    "consumer_unit_billing_id" TEXT,
    "investor_settlement_id" TEXT,
    "originated_by_plant_bill_id" TEXT,
    "compensado_em" TIMESTAMP(3),
    "pago_cliente_em" TIMESTAMP(3),
    "disponibilizado_em" TIMESTAMP(3),
    "pago_investidor_em" TIMESTAMP(3),
    "cobranca_judicial_em" TIMESTAMP(3),
    "cobranca_judicial_nota" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "carried_from_payable_id" TEXT,

    CONSTRAINT "investor_payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_debits" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "valor_original" DOUBLE PRECISION NOT NULL,
    "valor_restante" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "payable_origem_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quitado_em" TIMESTAMP(3),
    "cancelado_em" TIMESTAMP(3),
    "criado_por_user_id" TEXT,

    CONSTRAINT "investor_debits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_debit_applications" (
    "id" TEXT NOT NULL,
    "debit_id" TEXT NOT NULL,
    "payable_id" TEXT NOT NULL,
    "valor_abatido" DOUBLE PRECISION NOT NULL,
    "aplicado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_debit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_settlements" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "ano_fechamento" INTEGER NOT NULL,
    "mes_fechamento" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total_kwh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_bruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_ajuste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_liquido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_payables" INTEGER NOT NULL DEFAULT 0,
    "gestao_fixa_aplicada" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outros_ajustes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outros_notas" TEXT,
    "valor_a_pagar" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gerado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_em" TIMESTAMP(3),
    "pago_em" TIMESTAMP(3),
    "pago_comprovante" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investor_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "investors_user_id_key" ON "investors"("user_id");

-- CreateIndex
CREATE INDEX "plant_documents_plant_id_idx" ON "plant_documents"("plant_id");

-- CreateIndex
CREATE UNIQUE INDEX "plant_documents_plant_id_type_key" ON "plant_documents"("plant_id", "type");

-- CreateIndex
CREATE INDEX "plant_billings_ano_mes_idx" ON "plant_billings"("ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "plant_billings_plant_id_ano_mes_key" ON "plant_billings"("plant_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "investor_plants_investor_id_plant_id_key" ON "investor_plants"("investor_id", "plant_id");

-- CreateIndex
CREATE INDEX "monthly_reports_investor_id_ano_mes_idx" ON "monthly_reports"("investor_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reports_plant_id_investor_id_ano_mes_key" ON "monthly_reports"("plant_id", "investor_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "plant_monthly_plant_id_ano_mes_key" ON "plant_monthly"("plant_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_monthly_consumer_id_plant_id_ano_mes_key" ON "consumer_monthly"("consumer_id", "plant_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_units_codigo_uc_key" ON "consumer_units"("codigo_uc");

-- CreateIndex
CREATE INDEX "consumer_units_consumer_id_idx" ON "consumer_units"("consumer_id");

-- CreateIndex
CREATE INDEX "consumer_units_plant_id_idx" ON "consumer_units"("plant_id");

-- CreateIndex
CREATE INDEX "consumer_unit_billings_ano_mes_idx" ON "consumer_unit_billings"("ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_unit_billings_consumer_unit_id_ano_mes_key" ON "consumer_unit_billings"("consumer_unit_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_plants_consumer_id_plant_id_key" ON "consumer_plants"("consumer_id", "plant_id");

-- CreateIndex
CREATE INDEX "consumer_bills_consumer_unit_id_ano_referencia_idx" ON "consumer_bills"("consumer_unit_id", "ano_referencia");

-- CreateIndex
CREATE INDEX "consumer_bills_plant_id_ano_referencia_idx" ON "consumer_bills"("plant_id", "ano_referencia");

-- CreateIndex
CREATE UNIQUE INDEX "consumer_bills_consumer_unit_id_ano_referencia_mes_referenc_key" ON "consumer_bills"("consumer_unit_id", "ano_referencia", "mes_referencia");

-- CreateIndex
CREATE UNIQUE INDEX "cpfl_credentials_consumer_unit_id_key" ON "cpfl_credentials"("consumer_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "cpfl_credentials_plant_id_key" ON "cpfl_credentials"("plant_id");

-- CreateIndex
CREATE INDEX "brasil_solar_clients_status_monitoramento_idx" ON "brasil_solar_clients"("status_monitoramento");

-- CreateIndex
CREATE INDEX "brasil_solar_clients_cidade_idx" ON "brasil_solar_clients"("cidade");

-- CreateIndex
CREATE INDEX "brasil_solar_clients_uf_idx" ON "brasil_solar_clients"("uf");

-- CreateIndex
CREATE INDEX "brasil_solar_clients_plataforma_monitoramento_idx" ON "brasil_solar_clients"("plataforma_monitoramento");

-- CreateIndex
CREATE INDEX "brasil_solar_clients_status_contrato_idx" ON "brasil_solar_clients"("status_contrato");

-- CreateIndex
CREATE INDEX "brasil_solar_clients_nome_idx" ON "brasil_solar_clients"("nome");

-- CreateIndex
CREATE INDEX "brasil_solar_clients_proprietario_id_idx" ON "brasil_solar_clients"("proprietario_id");

-- CreateIndex
CREATE INDEX "brasil_solar_clients_plant_id_idx" ON "brasil_solar_clients"("plant_id");

-- CreateIndex
CREATE INDEX "brasil_solar_monitoring_plans_client_id_data_fim_idx" ON "brasil_solar_monitoring_plans"("client_id", "data_fim");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- CreateIndex
CREATE INDEX "inverter_samples_client_id_time_stamp_idx" ON "inverter_samples"("client_id", "time_stamp");

-- CreateIndex
CREATE UNIQUE INDEX "inverter_samples_ps_key_time_stamp_key" ON "inverter_samples"("ps_key", "time_stamp");

-- CreateIndex
CREATE INDEX "brasil_solar_proprietarios_nome_idx" ON "brasil_solar_proprietarios"("nome");

-- CreateIndex
CREATE INDEX "brasil_solar_proprietarios_cpf_cnpj_idx" ON "brasil_solar_proprietarios"("cpf_cnpj");

-- CreateIndex
CREATE INDEX "brasil_solar_proprietarios_codigo_uc_idx" ON "brasil_solar_proprietarios"("codigo_uc");

-- CreateIndex
CREATE INDEX "monitoring_logs_data_idx" ON "monitoring_logs"("data");

-- CreateIndex
CREATE INDEX "monitoring_logs_client_id_data_idx" ON "monitoring_logs"("client_id", "data");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_logs_client_id_data_key" ON "monitoring_logs"("client_id", "data");

-- CreateIndex
CREATE INDEX "monitoring_alerts_status_idx" ON "monitoring_alerts"("status");

-- CreateIndex
CREATE INDEX "monitoring_alerts_tipo_idx" ON "monitoring_alerts"("tipo");

-- CreateIndex
CREATE INDEX "monitoring_alerts_severidade_idx" ON "monitoring_alerts"("severidade");

-- CreateIndex
CREATE INDEX "monitoring_alerts_acao_requerida_idx" ON "monitoring_alerts"("acao_requerida");

-- CreateIndex
CREATE INDEX "monitoring_alerts_client_id_status_idx" ON "monitoring_alerts"("client_id", "status");

-- CreateIndex
CREATE INDEX "monitoring_alerts_created_at_idx" ON "monitoring_alerts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "alerta_thresholds_tipo_key" ON "alerta_thresholds"("tipo");

-- CreateIndex
CREATE INDEX "inverter_error_codes_fabricante_idx" ON "inverter_error_codes"("fabricante");

-- CreateIndex
CREATE UNIQUE INDEX "inverter_error_codes_fabricante_codigo_key" ON "inverter_error_codes"("fabricante", "codigo");

-- CreateIndex
CREATE INDEX "inverter_error_actions_error_code_id_idx" ON "inverter_error_actions"("error_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "inverter_error_actions_error_code_id_ordem_key" ON "inverter_error_actions"("error_code_id", "ordem");

-- CreateIndex
CREATE INDEX "obras_status_idx" ON "obras"("status");

-- CreateIndex
CREATE INDEX "obras_aprovacao_idx" ON "obras"("aprovacao");

-- CreateIndex
CREATE INDEX "obras_data_inicio_prevista_idx" ON "obras"("data_inicio_prevista");

-- CreateIndex
CREATE INDEX "obras_plant_id_idx" ON "obras"("plant_id");

-- CreateIndex
CREATE INDEX "obras_brasil_solar_proprietario_id_idx" ON "obras"("brasil_solar_proprietario_id");

-- CreateIndex
CREATE INDEX "obras_equipe_id_idx" ON "obras"("equipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "obra_lista_materiais_obra_id_key" ON "obra_lista_materiais"("obra_id");

-- CreateIndex
CREATE INDEX "obra_lista_material_itens_lista_id_ordem_idx" ON "obra_lista_material_itens"("lista_id", "ordem");

-- CreateIndex
CREATE INDEX "obra_tarefas_obra_id_idx" ON "obra_tarefas"("obra_id");

-- CreateIndex
CREATE INDEX "obra_tarefas_obra_id_ordem_idx" ON "obra_tarefas"("obra_id", "ordem");

-- CreateIndex
CREATE INDEX "tarefa_dependencias_tarefa_id_idx" ON "tarefa_dependencias"("tarefa_id");

-- CreateIndex
CREATE INDEX "tarefa_dependencias_depende_de_id_idx" ON "tarefa_dependencias"("depende_de_id");

-- CreateIndex
CREATE UNIQUE INDEX "tarefa_dependencias_tarefa_id_depende_de_id_key" ON "tarefa_dependencias"("tarefa_id", "depende_de_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipes_execucao_nome_key" ON "equipes_execucao"("nome");

-- CreateIndex
CREATE INDEX "equipes_execucao_active_idx" ON "equipes_execucao"("active");

-- CreateIndex
CREATE UNIQUE INDEX "obra_materiais_padrao_potencia_w_key" ON "obra_materiais_padrao"("potencia_w");

-- CreateIndex
CREATE INDEX "obra_materiais_padrao_potencia_w_idx" ON "obra_materiais_padrao"("potencia_w");

-- CreateIndex
CREATE UNIQUE INDEX "distribuidora_emails_distribuidora_key" ON "distribuidora_emails"("distribuidora");

-- CreateIndex
CREATE INDEX "rateio_versions_plant_id_status_idx" ON "rateio_versions"("plant_id", "status");

-- CreateIndex
CREATE INDEX "rateio_items_version_id_idx" ON "rateio_items"("version_id");

-- CreateIndex
CREATE INDEX "rateio_items_consumer_unit_id_idx" ON "rateio_items"("consumer_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "rateio_items_version_id_consumer_unit_id_key" ON "rateio_items"("version_id", "consumer_unit_id");

-- CreateIndex
CREATE INDEX "investor_payables_status_ano_referencia_mes_referencia_idx" ON "investor_payables"("status", "ano_referencia", "mes_referencia");

-- CreateIndex
CREATE INDEX "investor_payables_investor_id_status_idx" ON "investor_payables"("investor_id", "status");

-- CreateIndex
CREATE INDEX "investor_payables_plant_id_ano_referencia_mes_referencia_idx" ON "investor_payables"("plant_id", "ano_referencia", "mes_referencia");

-- CreateIndex
CREATE INDEX "investor_payables_originated_by_plant_bill_id_idx" ON "investor_payables"("originated_by_plant_bill_id");

-- CreateIndex
CREATE INDEX "investor_payables_carried_from_payable_id_idx" ON "investor_payables"("carried_from_payable_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_payables_investor_id_consumer_unit_id_ano_referenc_key" ON "investor_payables"("investor_id", "consumer_unit_id", "ano_referencia", "mes_referencia", "parcela_index", "carried_from_payable_id");

-- CreateIndex
CREATE INDEX "investor_debits_investor_id_status_idx" ON "investor_debits"("investor_id", "status");

-- CreateIndex
CREATE INDEX "investor_debits_payable_origem_id_idx" ON "investor_debits"("payable_origem_id");

-- CreateIndex
CREATE INDEX "investor_debit_applications_payable_id_idx" ON "investor_debit_applications"("payable_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_debit_applications_debit_id_payable_id_key" ON "investor_debit_applications"("debit_id", "payable_id");

-- CreateIndex
CREATE INDEX "investor_settlements_status_ano_fechamento_mes_fechamento_idx" ON "investor_settlements"("status", "ano_fechamento", "mes_fechamento");

-- CreateIndex
CREATE UNIQUE INDEX "investor_settlements_investor_id_ano_fechamento_mes_fechame_key" ON "investor_settlements"("investor_id", "ano_fechamento", "mes_fechamento");

-- AddForeignKey
ALTER TABLE "investors" ADD CONSTRAINT "investors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_documents" ADD CONSTRAINT "plant_documents_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_billings" ADD CONSTRAINT "plant_billings_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_plants" ADD CONSTRAINT "investor_plants_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_plants" ADD CONSTRAINT "investor_plants_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_monthly" ADD CONSTRAINT "plant_monthly_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_monthly" ADD CONSTRAINT "consumer_monthly_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_monthly" ADD CONSTRAINT "consumer_monthly_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_units" ADD CONSTRAINT "consumer_units_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_units" ADD CONSTRAINT "consumer_units_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_unit_billings" ADD CONSTRAINT "consumer_unit_billings_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_plants" ADD CONSTRAINT "consumer_plants_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_plants" ADD CONSTRAINT "consumer_plants_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_bills" ADD CONSTRAINT "consumer_bills_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_bills" ADD CONSTRAINT "consumer_bills_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cpfl_credentials" ADD CONSTRAINT "cpfl_credentials_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cpfl_credentials" ADD CONSTRAINT "cpfl_credentials_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brasil_solar_clients" ADD CONSTRAINT "brasil_solar_clients_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brasil_solar_clients" ADD CONSTRAINT "brasil_solar_clients_proprietario_id_fkey" FOREIGN KEY ("proprietario_id") REFERENCES "brasil_solar_proprietarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brasil_solar_monitoring_plans" ADD CONSTRAINT "brasil_solar_monitoring_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "brasil_solar_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inverter_samples" ADD CONSTRAINT "inverter_samples_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "brasil_solar_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_logs" ADD CONSTRAINT "monitoring_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "brasil_solar_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_alerts" ADD CONSTRAINT "monitoring_alerts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "brasil_solar_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inverter_error_actions" ADD CONSTRAINT "inverter_error_actions_error_code_id_fkey" FOREIGN KEY ("error_code_id") REFERENCES "inverter_error_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "equipes_execucao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_lista_materiais" ADD CONSTRAINT "obra_lista_materiais_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_lista_material_itens" ADD CONSTRAINT "obra_lista_material_itens_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "obra_lista_materiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obra_tarefas" ADD CONSTRAINT "obra_tarefas_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_dependencias" ADD CONSTRAINT "tarefa_dependencias_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "obra_tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_dependencias" ADD CONSTRAINT "tarefa_dependencias_depende_de_id_fkey" FOREIGN KEY ("depende_de_id") REFERENCES "obra_tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rateio_versions" ADD CONSTRAINT "rateio_versions_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rateio_items" ADD CONSTRAINT "rateio_items_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "rateio_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rateio_items" ADD CONSTRAINT "rateio_items_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payables" ADD CONSTRAINT "investor_payables_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payables" ADD CONSTRAINT "investor_payables_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payables" ADD CONSTRAINT "investor_payables_consumer_unit_id_fkey" FOREIGN KEY ("consumer_unit_id") REFERENCES "consumer_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payables" ADD CONSTRAINT "investor_payables_consumer_bill_id_fkey" FOREIGN KEY ("consumer_bill_id") REFERENCES "consumer_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payables" ADD CONSTRAINT "investor_payables_originated_by_plant_bill_id_fkey" FOREIGN KEY ("originated_by_plant_bill_id") REFERENCES "consumer_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payables" ADD CONSTRAINT "investor_payables_consumer_unit_billing_id_fkey" FOREIGN KEY ("consumer_unit_billing_id") REFERENCES "consumer_unit_billings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payables" ADD CONSTRAINT "investor_payables_investor_settlement_id_fkey" FOREIGN KEY ("investor_settlement_id") REFERENCES "investor_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payables" ADD CONSTRAINT "investor_payables_rateio_version_id_fkey" FOREIGN KEY ("rateio_version_id") REFERENCES "rateio_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_payables" ADD CONSTRAINT "investor_payables_carried_from_payable_id_fkey" FOREIGN KEY ("carried_from_payable_id") REFERENCES "investor_payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_debits" ADD CONSTRAINT "investor_debits_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_debits" ADD CONSTRAINT "investor_debits_payable_origem_id_fkey" FOREIGN KEY ("payable_origem_id") REFERENCES "investor_payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_debit_applications" ADD CONSTRAINT "investor_debit_applications_debit_id_fkey" FOREIGN KEY ("debit_id") REFERENCES "investor_debits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_debit_applications" ADD CONSTRAINT "investor_debit_applications_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "investor_payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_settlements" ADD CONSTRAINT "investor_settlements_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
