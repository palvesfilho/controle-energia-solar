import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getAllPlants, getPlantDevices, getDailyEnergy, type WegDailyEnergy } from "@/lib/weg";
import { esperadaDoDiaDaUsina, performanceRatioMesAtual } from "@/lib/geracao-esperada";

/**
 * POST /api/brasil-solar/sync-weg — plantas do WEG Solar Portal → BrasilSolarClient.
 *
 * Diferente dos outros quatro botões de marca, este já traz a GERAÇÃO junto:
 * `/plants` da WEG devolve só `_id` e `name` (não tem cidade, kWp nem última
 * leitura), então sem a série de `/measurements` a usina entraria na lista e
 * ficaria em SEM_DADOS para sempre. São 4 usinas e a coleta leva ~20 s.
 *
 * ⚠️ O que a API NÃO dá e por isso NÃO é preenchido aqui — nem chutado:
 * potência instalada (kWp), cidade/UF, endereço e data de instalação. Esses
 * dados existem no cadastro que veio na entrega do Joel
 * (`WEG/entrega-usinas-weg/app/usinas-cadastro.json`) e precisam entrar por
 * importação ou à mão. Sem kWp não há prognóstico, e sem prognóstico o
 * `performanceRatio` fica null — é o esperado, não um defeito.
 */
// A coleta é sequencial e com 0,5 s entre chamadas (throttle da WEG): ~25 s para
// as 4 usinas de hoje, e cresce junto com a carteira.
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // 30 dias por recomendação da entrega (§6.1): o bloco de busca já é de 30, então
  // pedir 30 custa exatamente as mesmas chamadas que pedir 7 — e cobre a usina que
  // volta depois de até um mês parada.
  const dias = Number.isFinite(body?.dias) ? Math.max(2, Math.min(90, Number(body.dias))) : 30;

  try {
    const plants = await getAllPlants();

    const existentes = await prisma.brasilSolarClient.findMany({
      where: { plataformaMonitoramento: "WEG" },
      select: {
        id: true,
        monitoramentoPlantId: true,
        geracaoMediaEsperada: true,
        geracaoAnualEsperada: true,
      },
    });
    const porPlantId = new Map(
      existentes.filter((c) => c.monitoramentoPlantId).map((c) => [c.monitoramentoPlantId as string, c]),
    );

    let created = 0;
    let updated = 0;
    let logsGravados = 0;
    let logsRecusados = 0;
    let errors = 0;
    const recusas: string[] = [];

    // Sequencial de propósito: a API responde 422 Throttle se atacada, e são 4 usinas.
    for (const plant of plants) {
      try {
        const devices = await getPlantDevices(plant.id);
        const serie = await getDailyEnergy(plant.id, dias);

        const modelos = [...new Set(devices.map((d) => d.modelo).filter(Boolean))] as string[];
        const status = statusPorEnergia(serie);

        const dadosBase = {
          nome: plant.nome,
          plataformaMonitoramento: "WEG",
          monitoramentoPlantId: plant.id,
          monitoramentoUrl: "https://solarportal.weg.net",
          inversorMarca: "WEG",
          inversorModelo: modelos.length > 0 ? modelos.join(", ") : undefined,
          inversorQuantidade: devices.length > 0 ? devices.length : undefined,
          statusMonitoramento: status.statusMonitoramento,
          ultimaLeitura: status.ultimaLeitura,
          ultimaGeracao: status.ultimaGeracao,
        };

        let cliente = porPlantId.get(plant.id);

        if (cliente) {
          await prisma.brasilSolarClient.update({ where: { id: cliente.id }, data: dadosBase });
          updated++;
        } else {
          const novo = await prisma.brasilSolarClient.create({
            data: { ...dadosBase, statusContrato: "ATIVO" },
            select: {
              id: true,
              monitoramentoPlantId: true,
              geracaoMediaEsperada: true,
              geracaoAnualEsperada: true,
            },
          });
          porPlantId.set(plant.id, novo);
          cliente = novo;
          created++;
        }

        const resultado = await gravarLogs(cliente, serie);
        logsGravados += resultado.gravados;
        logsRecusados += resultado.recusados.length;
        for (const r of resultado.recusados) recusas.push(`${plant.nome}: ${r}`);

        // Mês corrente somado do BANCO (e não da janela coletada): a janela pode
        // começar no meio do mês anterior e não cobrir o mês inteiro.
        const agora = new Date();
        const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
        const soma = await prisma.monitoringLog.aggregate({
          where: { clientId: cliente.id, data: { gte: inicioMes } },
          _sum: { geracaoDiaria: true },
        });
        const geracaoMesAtual = soma._sum.geracaoDiaria ?? 0;

        await prisma.brasilSolarClient.update({
          where: { id: cliente.id },
          data: {
            geracaoMesAtual,
            performanceRatio: performanceRatioMesAtual(cliente, geracaoMesAtual, agora),
          },
        });
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : "erro desconhecido";
        recusas.push(`${plant.nome}: FALHOU — ${msg}`);
      }
    }

    return NextResponse.json({
      message: "Sincronizacao WEG concluida",
      total: plants.length,
      created,
      updated,
      errors,
      dias,
      logsGravados,
      // Recusa NÃO é erro: é a proteção fazendo o trabalho dela. Mas tem que
      // aparecer — foi assim que o defeito do acumulado foi descoberto na origem.
      logsRecusados,
      recusas: recusas.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Grava a série diária com as DUAS proteções contra apagar geração (§5.3 da
 * entrega). Nenhuma delas dá erro no dia a dia — elas recusam e registram.
 *
 * (a) **Dia já fechado:** um `0` novo NUNCA sobrescreve valor positivo já
 *     gravado de dia passado. Um dia fechado não passa de 10,2 kWh para 0,0 —
 *     isso é falha de leitura, não usina parada. Zero continua sendo gravado
 *     quando o dia ainda não tinha valor: usina realmente parada precisa
 *     registrar zero, senão o alarme de "sem geração" nunca dispara.
 *
 * (b) **Dia de hoje: o valor nunca RETROCEDE.** A energia do dia só cresce. O
 *     caso real e traiçoeiro: quando a janela pedida cai inteira dentro do
 *     período em que o inversor esteve offline, a API não consegue calcular o
 *     acumulado e devolve `0` para hoje. Sem esta proteção, uma usina que volta
 *     depois de uma parada longa apareceria zerada justamente no dia em que
 *     voltou — o momento em que o alarme mais importa.
 */
async function gravarLogs(
  cliente: { id: string; geracaoMediaEsperada?: number | null; geracaoAnualEsperada?: number | null },
  serie: WegDailyEnergy[],
): Promise<{ gravados: number; recusados: string[] }> {
  if (serie.length === 0) return { gravados: 0, recusados: [] };

  const hojeIso = new Date().toISOString().slice(0, 10);
  const datas = serie.map((d) => dataUtcDoDia(d.dia));

  const existentes = await prisma.monitoringLog.findMany({
    where: { clientId: cliente.id, data: { in: datas } },
    select: { data: true, geracaoDiaria: true },
  });
  const gravado = new Map(existentes.map((l) => [l.data.toISOString().slice(0, 10), l.geracaoDiaria]));

  let gravados = 0;
  const recusados: string[] = [];

  for (const ponto of serie) {
    const anterior = gravado.get(ponto.dia);
    const ehHoje = ponto.dia === hojeIso;

    if (anterior != null) {
      if (!ehHoje && ponto.kwh === 0 && anterior > 0) {
        recusados.push(`${ponto.dia} recusado — API mandou 0,0 sobre ${anterior} kWh ja gravados (dia fechado)`);
        continue;
      }
      if (ehHoje && ponto.kwh < anterior) {
        recusados.push(`${ponto.dia} recusado — hoje retrocedeu de ${anterior} para ${ponto.kwh} kWh`);
        continue;
      }
    }

    const data = dataUtcDoDia(ponto.dia);
    await prisma.monitoringLog.upsert({
      where: { clientId_data: { clientId: cliente.id, data } },
      // Dado medido vence lançamento manual (origem MANUAL).
      update: { origem: "API", geracaoDiaria: ponto.kwh },
      create: {
        clientId: cliente.id,
        data,
        geracaoDiaria: ponto.kwh,
        geracaoEsperada: esperadaDoDiaDaUsina(cliente, data),
      },
    });
    gravados++;
  }

  return { gravados, recusados };
}

/** `MonitoringLog.data` é dia-calendário: meio-dia UTC, como no resto do sistema. */
function dataUtcDoDia(dia: string): Date {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d, 12, 0, 0));
}

/**
 * Status pela ENERGIA, não pelo `status` do inversor (§6.3 da entrega).
 *
 * 🔑 Os inversores WEG *piscam*: ficam offline e voltam em minutos, várias vezes
 * ao dia. Alarme por status avisaria o dia inteiro, viraria ruído e seria
 * ignorado — foi exatamente o que aconteceu com os alertas da plataforma na HM
 * Barbearia, que ficou 119 dias parada sem ninguém perceber. O gatilho certo é
 * **dia de sol sem geração**.
 */
function statusPorEnergia(serie: WegDailyEnergy[]): {
  statusMonitoramento: string;
  ultimaLeitura?: Date;
  ultimaGeracao?: number;
} {
  if (serie.length === 0) return { statusMonitoramento: "SEM_DADOS" };

  const ultimo = serie[serie.length - 1];
  const comGeracao = [...serie].reverse().find((d) => d.kwh > 0);

  if (!comGeracao) {
    return {
      statusMonitoramento: "OFFLINE",
      ultimaLeitura: dataUtcDoDia(ultimo.dia),
      ultimaGeracao: ultimo.kwh,
    };
  }

  // Os dois lados em meio-dia UTC, senão a diferença sai com meio dia sobrando
  // e "gerou ontem" viraria 2 dias parada.
  const hoje = dataUtcDoDia(new Date().toISOString().slice(0, 10)).getTime();
  const diasParado = Math.round((hoje - dataUtcDoDia(comGeracao.dia).getTime()) / 86_400_000);

  let statusMonitoramento = "OFFLINE";
  if (diasParado <= 1) statusMonitoramento = "ONLINE";
  else if (diasParado <= 3) statusMonitoramento = "ALERTA";

  return {
    statusMonitoramento,
    ultimaLeitura: dataUtcDoDia(ultimo.dia),
    ultimaGeracao: ultimo.kwh,
  };
}
