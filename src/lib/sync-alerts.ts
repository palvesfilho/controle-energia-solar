import { prisma } from "@/lib/prisma";
import {
  calcularDesvioTensaoPct,
  classifyBaixaGeracao,
  classifyFrequencia,
  classifyTemperatura,
  classifyTensaoFora,
  getAcaoRequeridaDefault,
  getThresholds,
  inferirTensaoNominal,
} from "@/lib/alertas-usinas";
import * as fronius from "@/lib/fronius";
import * as solaredge from "@/lib/solaredge";
import * as sungrow from "@/lib/sungrow";
import * as huawei from "@/lib/huawei";
import type { InverterErrorEvent } from "@/lib/inverter-errors";

export interface AlertSyncResult {
  alertsCreated: number;
  offlineDetected: number;
  lowPerformanceDetected: number;
  tensaoDetected: number;
  temperaturaDetected: number;
  frequenciaDetected: number;
  erroInversorDetected: number;
  contratoProximoVencimento: number;
  contratoVencido: number;
  autoResolved: {
    offline: number;
    lowGeneration: number;
    temperatura: number;
    frequencia: number;
    tensao: number;
    erroInversor: number;
    contrato: number;
  };
}

const CONTRATO_AVISO_DIAS = 30;

export async function runAlertSync(): Promise<AlertSyncResult> {
  const now = new Date();
  const cfg = await getThresholds();
  let alertsCreated = 0;

  let offlineDetected = 0;
  if (cfg.OFFLINE.enabled) {
    const offlineThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const offlineClients = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        plataformaMonitoramento: { in: ["FRONIUS", "HUAWEI", "SOLAREDGE", "SUNGROW"] },
        OR: [{ ultimaLeitura: { lt: offlineThreshold } }, { ultimaLeitura: null }],
        statusMonitoramento: { not: "SEM_DADOS" },
      },
      select: { id: true, nome: true, ultimaLeitura: true },
    });
    offlineDetected = offlineClients.length;
    const severidade = cfg.OFFLINE.severidadeDefault ?? "CRITICA";

    for (const client of offlineClients) {
      const existing = await prisma.monitoringAlert.findFirst({
        where: {
          clientId: client.id,
          tipo: "OFFLINE",
          status: { in: ["ABERTO", "EM_ANDAMENTO"] },
        },
      });
      if (existing) continue;

      const diffHours = client.ultimaLeitura
        ? Math.floor((now.getTime() - new Date(client.ultimaLeitura).getTime()) / 3600_000)
        : null;

      await prisma.monitoringAlert.create({
        data: {
          clientId: client.id,
          tipo: "OFFLINE",
          severidade,
          acaoRequerida: getAcaoRequeridaDefault("OFFLINE"),
          titulo: `Inversor desconectado${diffHours ? ` há ${diffHours}h` : ""}`,
          descricao: `O inversor de ${client.nome} não envia dados${
            diffHours ? ` há ${diffHours} horas` : ""
          }. Última leitura: ${
            client.ultimaLeitura
              ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
                  new Date(client.ultimaLeitura),
                )
              : "nunca"
          }.`,
        },
      });

      await prisma.brasilSolarClient.update({
        where: { id: client.id },
        data: { statusMonitoramento: "OFFLINE" },
      });

      alertsCreated++;
    }
  }

  let baixaGeracaoDetected = 0;
  if (cfg.BAIXA_GERACAO.enabled) {
    const limiteSuperior = cfg.BAIXA_GERACAO.thresholdMedio ?? 90;
    const candidates = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        performanceRatio: { lte: limiteSuperior, gt: 0 },
        geracaoMediaEsperada: { gt: 0 },
        statusMonitoramento: "ONLINE",
      },
      select: {
        id: true,
        nome: true,
        performanceRatio: true,
        geracaoMesAtual: true,
        geracaoMediaEsperada: true,
      },
    });

    for (const client of candidates) {
      const pr = client.performanceRatio ?? 0;
      const severidade = classifyBaixaGeracao(pr, cfg.BAIXA_GERACAO);
      if (!severidade) continue;
      baixaGeracaoDetected++;

      const existing = await prisma.monitoringAlert.findFirst({
        where: {
          clientId: client.id,
          tipo: "BAIXA_GERACAO",
          status: { in: ["ABERTO", "EM_ANDAMENTO"] },
        },
      });
      if (existing) continue;

      await prisma.monitoringAlert.create({
        data: {
          clientId: client.id,
          tipo: "BAIXA_GERACAO",
          severidade,
          acaoRequerida: getAcaoRequeridaDefault("BAIXA_GERACAO"),
          titulo: `Geração em ${pr.toFixed(0)}% do esperado`,
          descricao: `${client.nome} gerou ${(client.geracaoMesAtual ?? 0).toFixed(0)} kWh este mês, mas o esperado é ${(client.geracaoMediaEsperada ?? 0).toFixed(0)} kWh/mês (PR: ${pr.toFixed(1)}%).`,
        },
      });

      await prisma.brasilSolarClient.update({
        where: { id: client.id },
        data: { statusMonitoramento: "ALERTA" },
      });

      alertsCreated++;
    }
  }

  const metricFresh = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  let tensaoDetected = 0;
  if (cfg.TENSAO_FORA.enabled) {
    const clients = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        tensaoRede: { not: null, gt: 0 },
        ultimaMetricaEm: { gte: metricFresh },
      },
      select: {
        id: true,
        nome: true,
        tensaoRede: true,
        tensaoNominalRede: true,
      },
    });

    for (const client of clients) {
      const medida = client.tensaoRede!;
      const nominal = client.tensaoNominalRede ?? inferirTensaoNominal(medida);
      if (!nominal) continue;

      const desvioPct = calcularDesvioTensaoPct(medida, nominal);
      const severidade = classifyTensaoFora(desvioPct, cfg.TENSAO_FORA);
      if (!severidade) continue;

      tensaoDetected++;

      const existing = await prisma.monitoringAlert.findFirst({
        where: {
          clientId: client.id,
          tipo: "TENSAO_FORA",
          status: { in: ["ABERTO", "EM_ANDAMENTO"] },
        },
      });
      if (existing) continue;

      const direcao = desvioPct >= 0 ? "acima" : "abaixo";
      await prisma.monitoringAlert.create({
        data: {
          clientId: client.id,
          tipo: "TENSAO_FORA",
          severidade,
          acaoRequerida: getAcaoRequeridaDefault("TENSAO_FORA"),
          titulo: `Tensão ${Math.abs(desvioPct).toFixed(1)}% ${direcao} da nominal (${nominal}V)`,
          descricao: `${client.nome} está operando com tensão de ${medida.toFixed(1)}V (nominal: ${nominal}V).`,
        },
      });

      alertsCreated++;
    }
  }

  let tempDetected = 0;
  if (cfg.TEMPERATURA_INVERSOR.enabled) {
    const clients = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        temperaturaInversor: { not: null },
        ultimaMetricaEm: { gte: metricFresh },
      },
      select: {
        id: true,
        nome: true,
        temperaturaInversor: true,
      },
    });

    for (const client of clients) {
      const temp = client.temperaturaInversor!;
      const severidade = classifyTemperatura(temp, cfg.TEMPERATURA_INVERSOR);
      if (!severidade) continue;

      tempDetected++;

      const existing = await prisma.monitoringAlert.findFirst({
        where: {
          clientId: client.id,
          tipo: "TEMPERATURA_INVERSOR",
          status: { in: ["ABERTO", "EM_ANDAMENTO"] },
        },
      });
      if (existing) continue;

      await prisma.monitoringAlert.create({
        data: {
          clientId: client.id,
          tipo: "TEMPERATURA_INVERSOR",
          severidade,
          acaoRequerida: getAcaoRequeridaDefault("TEMPERATURA_INVERSOR"),
          titulo: `Temperatura do inversor em ${temp.toFixed(1)}°C`,
          descricao: `${client.nome} está com temperatura interna elevada (${temp.toFixed(1)}°C). Inversores derratam acima de 65°C e podem desligar acima de 75–80°C.`,
        },
      });

      alertsCreated++;
    }
  }

  let freqDetected = 0;
  if (cfg.FREQUENCIA_REDE.enabled) {
    const clients = await prisma.brasilSolarClient.findMany({
      where: {
        active: true,
        frequenciaRede: { not: null, gt: 0 },
        ultimaMetricaEm: { gte: metricFresh },
      },
      select: {
        id: true,
        nome: true,
        frequenciaRede: true,
      },
    });

    for (const client of clients) {
      const hz = client.frequenciaRede!;
      const severidade = classifyFrequencia(hz, cfg.FREQUENCIA_REDE);
      if (!severidade) continue;

      freqDetected++;

      const existing = await prisma.monitoringAlert.findFirst({
        where: {
          clientId: client.id,
          tipo: "FREQUENCIA_REDE",
          status: { in: ["ABERTO", "EM_ANDAMENTO"] },
        },
      });
      if (existing) continue;

      const desvioHz = hz - 60;
      const sinal = desvioHz >= 0 ? "+" : "";
      await prisma.monitoringAlert.create({
        data: {
          clientId: client.id,
          tipo: "FREQUENCIA_REDE",
          severidade,
          acaoRequerida: getAcaoRequeridaDefault("FREQUENCIA_REDE"),
          titulo: `Frequência da rede em ${hz.toFixed(2)} Hz`,
          descricao: `${client.nome} está operando com frequência de ${hz.toFixed(2)} Hz (desvio ${sinal}${desvioHz.toFixed(2)} Hz em relação a 60 Hz).`,
        },
      });

      alertsCreated++;
    }
  }

  let erroInversorDetected = 0;
  let erroInversorResolvedAuto = 0;

  const clientesComPlataforma = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      monitoramentoPlantId: { not: null },
      plataformaMonitoramento: {
        in: ["FRONIUS", "SOLAREDGE", "SUNGROW", "HUAWEI"],
      },
    },
    select: {
      id: true,
      nome: true,
      plataformaMonitoramento: true,
      monitoramentoPlantId: true,
    },
  });

  const porPlataforma = new Map<
    string,
    { clientId: string; nome: string; plantId: string }[]
  >();
  for (const c of clientesComPlataforma) {
    if (!c.monitoramentoPlantId) continue;
    const plat = c.plataformaMonitoramento!;
    const list = porPlataforma.get(plat) ?? [];
    list.push({
      clientId: c.id,
      nome: c.nome,
      plantId: c.monitoramentoPlantId,
    });
    porPlataforma.set(plat, list);
  }

  const eventosPorCliente = new Map<string, InverterErrorEvent[]>();

  for (const [plat, clients] of porPlataforma.entries()) {
    try {
      if (plat === "FRONIUS") {
        const map = await fronius.getActiveAlertsBatch(clients.map((c) => c.plantId));
        for (const c of clients) {
          eventosPorCliente.set(c.clientId, map.get(c.plantId) ?? []);
        }
      } else if (plat === "SOLAREDGE") {
        const ids = clients.map((c) => Number(c.plantId)).filter((n) => Number.isFinite(n));
        const map = await solaredge.getActiveAlertsBatch(ids);
        for (const c of clients) {
          eventosPorCliente.set(c.clientId, map.get(Number(c.plantId)) ?? []);
        }
      } else if (plat === "SUNGROW") {
        const map = await sungrow.getActiveAlertsBatch(clients.map((c) => c.plantId));
        for (const c of clients) {
          eventosPorCliente.set(c.clientId, map.get(c.plantId) ?? []);
        }
      } else if (plat === "HUAWEI") {
        const map = await huawei.getActiveAlertsBatch(clients.map((c) => c.plantId));
        for (const c of clients) {
          eventosPorCliente.set(c.clientId, map.get(c.plantId) ?? []);
        }
      }
    } catch {
      // falha total na plataforma — segue
    }
  }

  const chavesKb = new Set<string>();
  for (const [, eventos] of eventosPorCliente) {
    for (const ev of eventos) chavesKb.add(ev.codigo);
  }
  const kbRows =
    chavesKb.size > 0
      ? await prisma.inverterErrorCode.findMany({
          select: {
            fabricante: true,
            codigo: true,
            titulo: true,
            descricao: true,
            severidadeSugerida: true,
            acoes: { select: { acaoRequerida: true, ordem: true } },
          },
        })
      : [];
  const kbIndex = new Map<string, (typeof kbRows)[number]>();
  for (const row of kbRows) {
    kbIndex.set(`${row.fabricante}::${row.codigo}`, row);
  }

  const ativosPorCliente = new Map<string, Set<string>>();

  for (const c of clientesComPlataforma) {
    const eventos = eventosPorCliente.get(c.id) ?? [];
    const fabricante = c.plataformaMonitoramento!;
    const ativos = new Set<string>();
    ativosPorCliente.set(c.id, ativos);

    for (const ev of eventos) {
      ativos.add(ev.codigo);

      const existing = await prisma.monitoringAlert.findFirst({
        where: {
          clientId: c.id,
          tipo: "ERRO_INVERSOR",
          codigoErroFabricante: ev.codigo,
          status: { in: ["ABERTO", "EM_ANDAMENTO"] },
        },
        select: { id: true },
      });
      if (existing) continue;

      const kb = kbIndex.get(`${fabricante}::${ev.codigo}`);
      const severidade =
        (kb?.severidadeSugerida as "BAIXA" | "MEDIA" | "ALTA" | "CRITICA" | null) ?? "MEDIA";
      const titulo = kb
        ? `${fabricante} #${ev.codigo} — ${kb.titulo}`
        : `${fabricante} #${ev.codigo}${ev.descricao ? ` — ${ev.descricao}` : ""}`;
      const descricao = kb?.descricao ?? ev.descricao ?? null;

      const primeiraAcao = kb?.acoes
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .find((a) => a.acaoRequerida)?.acaoRequerida;
      const acaoRequerida = primeiraAcao ?? getAcaoRequeridaDefault("ERRO_INVERSOR");

      await prisma.monitoringAlert.create({
        data: {
          clientId: c.id,
          tipo: "ERRO_INVERSOR",
          severidade,
          acaoRequerida,
          codigoErroFabricante: ev.codigo,
          titulo,
          descricao,
        },
      });

      if (severidade === "CRITICA" || severidade === "ALTA") {
        await prisma.brasilSolarClient.update({
          where: { id: c.id },
          data: { statusMonitoramento: "ALERTA" },
        });
      }

      alertsCreated++;
      erroInversorDetected++;
    }
  }

  for (const c of clientesComPlataforma) {
    if (!eventosPorCliente.has(c.id)) continue;
    const ativos = ativosPorCliente.get(c.id) ?? new Set<string>();

    const abertos = await prisma.monitoringAlert.findMany({
      where: {
        clientId: c.id,
        tipo: "ERRO_INVERSOR",
        status: { in: ["ABERTO", "EM_ANDAMENTO"] },
        codigoErroFabricante: { not: null },
      },
      select: { id: true, codigoErroFabricante: true },
    });

    const idsResolver = abertos
      .filter((a) => a.codigoErroFabricante != null && !ativos.has(a.codigoErroFabricante))
      .map((a) => a.id);

    if (idsResolver.length > 0) {
      const result = await prisma.monitoringAlert.updateMany({
        where: { id: { in: idsResolver } },
        data: {
          status: "RESOLVIDO",
          resolvidoPor: "Sistema Automatico",
          resolvidoEm: now,
          observacaoResolucao: "Erro não consta mais na lista de alarmes do inversor",
        },
      });
      erroInversorResolvedAuto += result.count;
    }
  }

  const resolvedOffline = Number(
    await prisma.$executeRaw`
      UPDATE monitoring_alerts
      SET status = 'RESOLVIDO',
          resolvido_por = 'Sistema Automatico',
          resolvido_em = ${now.toISOString()},
          observacao_resolucao = 'Planta voltou a enviar dados automaticamente'
      WHERE tipo = 'OFFLINE'
        AND status IN ('ABERTO', 'EM_ANDAMENTO')
        AND client_id IN (
          SELECT id FROM brasil_solar_clients
          WHERE status_monitoramento = 'ONLINE'
        )
    `,
  );

  const limiteRecuperacao = cfg.BAIXA_GERACAO.thresholdMedio ?? 90;
  const resolvedLowGen = Number(
    await prisma.$executeRaw`
      UPDATE monitoring_alerts
      SET status = 'RESOLVIDO',
          resolvido_por = 'Sistema Automatico',
          resolvido_em = ${now.toISOString()},
          observacao_resolucao = 'Performance ratio voltou ao normal'
      WHERE tipo = 'BAIXA_GERACAO'
        AND status IN ('ABERTO', 'EM_ANDAMENTO')
        AND client_id IN (
          SELECT id FROM brasil_solar_clients
          WHERE performance_ratio > ${limiteRecuperacao}
        )
    `,
  );

  const limiteTemp = cfg.TEMPERATURA_INVERSOR.thresholdMedio;
  let resolvedTemp = 0;
  if (cfg.TEMPERATURA_INVERSOR.enabled && limiteTemp != null) {
    resolvedTemp = Number(
      await prisma.$executeRaw`
        UPDATE monitoring_alerts
        SET status = 'RESOLVIDO',
            resolvido_por = 'Sistema Automatico',
            resolvido_em = ${now.toISOString()},
            observacao_resolucao = 'Temperatura do inversor voltou ao normal'
        WHERE tipo = 'TEMPERATURA_INVERSOR'
          AND status IN ('ABERTO', 'EM_ANDAMENTO')
          AND client_id IN (
            SELECT id FROM brasil_solar_clients
            WHERE temperatura_inversor IS NOT NULL
              AND temperatura_inversor < ${limiteTemp}
          )
      `,
    );
  }

  const limiteFreqBaixo = cfg.FREQUENCIA_REDE.thresholdBaixo;
  let resolvedFreq = 0;
  if (cfg.FREQUENCIA_REDE.enabled && limiteFreqBaixo != null) {
    resolvedFreq = Number(
      await prisma.$executeRaw`
        UPDATE monitoring_alerts
        SET status = 'RESOLVIDO',
            resolvido_por = 'Sistema Automatico',
            resolvido_em = ${now.toISOString()},
            observacao_resolucao = 'Frequência da rede voltou ao normal'
        WHERE tipo = 'FREQUENCIA_REDE'
          AND status IN ('ABERTO', 'EM_ANDAMENTO')
          AND client_id IN (
            SELECT id FROM brasil_solar_clients
            WHERE frequencia_rede IS NOT NULL
              AND ABS(frequencia_rede - 60) < ${limiteFreqBaixo}
          )
      `,
    );
  }

  const limiteTensaoBaixo = cfg.TENSAO_FORA.thresholdBaixo ?? cfg.TENSAO_FORA.thresholdMedio;
  let resolvedTensao = 0;
  if (cfg.TENSAO_FORA.enabled && limiteTensaoBaixo != null) {
    const openAlerts = await prisma.monitoringAlert.findMany({
      where: {
        tipo: "TENSAO_FORA",
        status: { in: ["ABERTO", "EM_ANDAMENTO"] },
      },
      select: {
        id: true,
        client: {
          select: {
            tensaoRede: true,
            tensaoNominalRede: true,
            ultimaMetricaEm: true,
          },
        },
      },
    });

    const resolvableIds: string[] = [];
    for (const a of openAlerts) {
      const medida = a.client?.tensaoRede;
      const lastReading = a.client?.ultimaMetricaEm;
      if (!medida || !lastReading || lastReading < metricFresh) continue;

      const nominal = a.client!.tensaoNominalRede ?? inferirTensaoNominal(medida);
      if (!nominal) continue;

      const desvio = Math.abs(calcularDesvioTensaoPct(medida, nominal));
      if (desvio < limiteTensaoBaixo) resolvableIds.push(a.id);
    }

    if (resolvableIds.length > 0) {
      const result = await prisma.monitoringAlert.updateMany({
        where: { id: { in: resolvableIds } },
        data: {
          status: "RESOLVIDO",
          resolvidoPor: "Sistema Automatico",
          resolvidoEm: now,
          observacaoResolucao: "Tensão da rede voltou ao normal",
        },
      });
      resolvedTensao = result.count;
    }
  }

  // Contratos de monitoramento — alerta 30 dias antes do vencimento e quando vencido.
  let contratoProximoVencimento = 0;
  let contratoVencido = 0;
  let contratoResolvido = 0;

  const limiteAviso = new Date(now.getTime() + CONTRATO_AVISO_DIAS * 24 * 60 * 60 * 1000);

  // Plano vigente próximo do vencimento (dataInicio <= hoje <= dataFim, com dataFim ≤ hoje+30d)
  const planosProximos = await prisma.brasilSolarMonitoringPlan.findMany({
    where: {
      dataInicio: { lte: now },
      dataFim: { gte: now, lte: limiteAviso },
    },
    select: {
      clientId: true,
      dataFim: true,
      client: { select: { active: true, nome: true } },
    },
  });

  for (const p of planosProximos) {
    if (!p.client?.active) continue;
    const existing = await prisma.monitoringAlert.findFirst({
      where: {
        clientId: p.clientId,
        tipo: "CONTRATO_PROXIMO_VENCIMENTO",
        status: { in: ["ABERTO", "EM_ANDAMENTO"] },
      },
      select: { id: true },
    });
    if (existing) continue;
    contratoProximoVencimento++;
    const diasRestantes = Math.ceil(
      (p.dataFim.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    await prisma.monitoringAlert.create({
      data: {
        clientId: p.clientId,
        tipo: "CONTRATO_PROXIMO_VENCIMENTO",
        severidade: "MEDIA",
        acaoRequerida: getAcaoRequeridaDefault("CONTRATO_PROXIMO_VENCIMENTO"),
        titulo: `Plano de monitoramento vence em ${diasRestantes} dia${diasRestantes === 1 ? "" : "s"}`,
        descricao: `O plano de monitoramento de ${p.client.nome} vence em ${p.dataFim.toLocaleDateString("pt-BR")}. Contate o cliente para renovação.`,
      },
    });
    alertsCreated++;
  }

  // Planos vencidos sem renovação posterior (não há outro plano com dataFim > hoje pra esse cliente)
  const planosVencidos = await prisma.brasilSolarMonitoringPlan.findMany({
    where: { dataFim: { lt: now } },
    select: {
      clientId: true,
      dataFim: true,
      client: { select: { active: true, nome: true } },
    },
    orderBy: { dataFim: "desc" },
  });

  const clientsVencidosVistos = new Set<string>();
  for (const p of planosVencidos) {
    if (!p.client?.active) continue;
    if (clientsVencidosVistos.has(p.clientId)) continue;
    clientsVencidosVistos.add(p.clientId);

    const temPosterior = await prisma.brasilSolarMonitoringPlan.findFirst({
      where: { clientId: p.clientId, dataFim: { gte: now } },
      select: { id: true },
    });
    if (temPosterior) continue;

    const existing = await prisma.monitoringAlert.findFirst({
      where: {
        clientId: p.clientId,
        tipo: "CONTRATO_VENCIDO",
        status: { in: ["ABERTO", "EM_ANDAMENTO"] },
      },
      select: { id: true },
    });
    if (existing) continue;

    contratoVencido++;
    await prisma.monitoringAlert.create({
      data: {
        clientId: p.clientId,
        tipo: "CONTRATO_VENCIDO",
        severidade: "ALTA",
        acaoRequerida: getAcaoRequeridaDefault("CONTRATO_VENCIDO"),
        titulo: `Plano de monitoramento vencido`,
        descricao: `O plano de monitoramento de ${p.client.nome} venceu em ${p.dataFim.toLocaleDateString("pt-BR")}. Renovação pendente.`,
      },
    });
    alertsCreated++;
  }

  // Auto-resolve alertas de contrato quando há plano vigente cobrindo hoje.
  const abertosContrato = await prisma.monitoringAlert.findMany({
    where: {
      tipo: { in: ["CONTRATO_PROXIMO_VENCIMENTO", "CONTRATO_VENCIDO"] },
      status: { in: ["ABERTO", "EM_ANDAMENTO"] },
    },
    select: { id: true, clientId: true, tipo: true },
  });
  for (const a of abertosContrato) {
    const planoVigente = await prisma.brasilSolarMonitoringPlan.findFirst({
      where: {
        clientId: a.clientId,
        dataInicio: { lte: now },
        dataFim: a.tipo === "CONTRATO_PROXIMO_VENCIMENTO" ? { gt: limiteAviso } : { gte: now },
      },
      select: { id: true },
    });
    if (!planoVigente) continue;
    await prisma.monitoringAlert.update({
      where: { id: a.id },
      data: {
        status: "RESOLVIDO",
        resolvidoPor: "Sistema Automatico",
        resolvidoEm: now,
        observacaoResolucao: "Plano de monitoramento renovado",
      },
    });
    contratoResolvido++;
  }

  return {
    alertsCreated,
    offlineDetected,
    lowPerformanceDetected: baixaGeracaoDetected,
    tensaoDetected,
    temperaturaDetected: tempDetected,
    frequenciaDetected: freqDetected,
    erroInversorDetected,
    contratoProximoVencimento,
    contratoVencido,
    autoResolved: {
      offline: resolvedOffline,
      lowGeneration: resolvedLowGen,
      temperatura: resolvedTemp,
      frequencia: resolvedFreq,
      tensao: resolvedTensao,
      erroInversor: erroInversorResolvedAuto,
      contrato: contratoResolvido,
    },
  };
}
