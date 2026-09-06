import { prisma } from "@/lib/prisma";

/**
 * Geração de um MÊS para um conjunto de usinas (Plant) da Gestora de Energia.
 *
 * 🔑 Existem DUAS fontes de geração no sistema e elas não se falam:
 *
 *  - `MonitoringLog` — leitura MEDIDA, escrita pelos syncs das plataformas
 *    (Growatt, Huawei, Sungrow, SolarEdge, Fronius, WEG). Está viva e é
 *    atualizada todo dia, mas é chaveada por `BrasilSolarClient`, e só chega
 *    numa Plant quando alguém preencheu `BrasilSolarClient.plantId`.
 *  - `PlantMonthly` — total mensal DIGITADO à mão na tela /admin/lançamentos.
 *    Nenhum cron ou sync escreve nela.
 *
 * Ler só `PlantMonthly` (como o dashboard fazia até 06/09/2026) mostra 0 kWh
 * enquanto a frota gera quase 1 GWh no mês — e 0 kWh não parece defeito, parece
 * usina parada. Aqui a medição manda, e o lançamento manual só entra pra usina
 * que NÃO tem medição, sem somar duas vezes.
 *
 * ⛔ Os contadores devolvidos não são enfeite: sem exibir a cobertura, um total
 * de 2 usinas de 30 se passa por total da frota. Quem exibe TEM de mostrar
 * quantas usinas entraram na conta.
 */
export type GeracaoMesFrota = {
  /** kWh do mês: medido + lançado à mão nas usinas sem medição. */
  kwh: number;
  kwhMedido: number;
  kwhLancado: number;
  /** Usinas com leitura de plataforma > 0 no mês. */
  usinasMedidas: number;
  /** Usinas com leitura no mês, porém somando ZERO — datalogger mudo, não sol. */
  usinasMudas: number;
  /** Usinas sem medição que tiveram total do mês digitado à mão. */
  usinasLancadas: number;
  /** Usinas da frota sem nenhuma das duas fontes no mês (mudas não entram). */
  usinasSemDado: number;
  /** Total de usinas consideradas (o denominador da cobertura). */
  usinasTotal: number;
  /**
   * true quando alguma leitura somada veio de `MonitoringLog.origem = MANUAL`
   * (rateio de um total mensal digitado, não medição). Estimativa não pode se
   * passar por medição — quem exibe precisa sinalizar.
   */
  temLeituraManual: boolean;
};

export async function geracaoDoMesPorFrota(
  plantIds: string[],
  ano: number,
  mes: number,
): Promise<GeracaoMesFrota> {
  const vazio: GeracaoMesFrota = {
    kwh: 0,
    kwhMedido: 0,
    kwhLancado: 0,
    usinasMedidas: 0,
    usinasMudas: 0,
    usinasLancadas: 0,
    usinasSemDado: plantIds.length,
    usinasTotal: plantIds.length,
    temLeituraManual: false,
  };
  if (plantIds.length === 0) return vazio;

  // Janela do mês no fuso local (mesma convenção dos syncs, que gravam
  // MonitoringLog.data como o DIA da leitura).
  const inicio = new Date(ano, mes - 1, 1, 0, 0, 0);
  const fim = new Date(ano, mes, 1, 0, 0, 0);

  // Uma Plant pode ter VÁRIOS clientes de monitoramento (inversores injetando
  // na mesma fatura), daí o mapa cliente→usina.
  const clients = await prisma.brasilSolarClient.findMany({
    where: { plantId: { in: plantIds } },
    select: { id: true, plantId: true },
  });
  const plantDoClient = new Map<string, string>();
  for (const c of clients) {
    if (c.plantId) plantDoClient.set(c.id, c.plantId);
  }

  const medidoPorPlant = new Map<string, number>();
  let temLeituraManual = false;

  if (plantDoClient.size > 0) {
    const logs = await prisma.monitoringLog.findMany({
      where: {
        clientId: { in: [...plantDoClient.keys()] },
        data: { gte: inicio, lt: fim },
      },
      select: { clientId: true, geracaoDiaria: true, origem: true },
    });
    for (const l of logs) {
      const plantId = plantDoClient.get(l.clientId);
      if (!plantId) continue;
      medidoPorPlant.set(
        plantId,
        (medidoPorPlant.get(plantId) ?? 0) + (l.geracaoDiaria ?? 0),
      );
      if (l.origem === "MANUAL" && (l.geracaoDiaria ?? 0) > 0) {
        temLeituraManual = true;
      }
    }
  }

  // Usina "muda" = tem linha de leitura no mês mas o total deu zero. Isso é
  // datalogger calado, não usina parada — some do total e precisa aparecer.
  const plantsMedidas = new Set<string>();
  const plantsMudas = new Set<string>();
  let kwhMedido = 0;
  for (const [plantId, kwh] of medidoPorPlant) {
    if (kwh > 0) {
      plantsMedidas.add(plantId);
      kwhMedido += kwh;
    } else {
      plantsMudas.add(plantId);
    }
  }

  // Lançamento manual só vale pra usina SEM medição no mês — senão o mesmo mês
  // entraria duas vezes.
  const semMedicao = plantIds.filter(
    (id) => !plantsMedidas.has(id) && !plantsMudas.has(id),
  );
  let kwhLancado = 0;
  let usinasLancadas = 0;
  if (semMedicao.length > 0) {
    const lancamentos = await prisma.plantMonthly.findMany({
      where: { plantId: { in: semMedicao }, ano, mes },
      select: { plantId: true, geracaoTotal: true },
    });
    for (const l of lancamentos) {
      const kwh = l.geracaoTotal ?? 0;
      if (kwh <= 0) continue;
      kwhLancado += kwh;
      usinasLancadas++;
    }
  }

  const comDado = plantsMedidas.size + usinasLancadas;

  return {
    kwh: kwhMedido + kwhLancado,
    kwhMedido,
    kwhLancado,
    usinasMedidas: plantsMedidas.size,
    usinasMudas: plantsMudas.size,
    usinasLancadas,
    usinasSemDado: plantIds.length - comDado - plantsMudas.size,
    usinasTotal: plantIds.length,
    temLeituraManual,
  };
}
