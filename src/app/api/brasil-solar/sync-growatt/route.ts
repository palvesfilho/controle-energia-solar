import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getPlantList, getDailyGeneration, type GrowattPlant } from "@/lib/growatt";
import { esperadaDoDiaDaUsina, performanceRatioMesAtual } from "@/lib/geracao-esperada";
import { ehDiaSemDado } from "@/lib/dia-sem-dado";

/**
 * POST /api/brasil-solar/sync-growatt — plantas da conta Growatt OSS →
 * BrasilSolarClient. É o 6º portal do botão "Importar Plantas".
 *
 * Existia desde 09/08/2026 um buraco: as 78 usinas Growatt tinham sido gravadas
 * por script direto no banco e NENHUM caminho automático trazia planta nova. Em
 * 03/09/2026 a conta tinha 80 plantas e o cadastro 78 — GLIOMAR BOLSON,
 * Alcemar Martins e João Carlos RAVANELLO nunca seriam importados por clique
 * nenhum, porque a Growatt não estava na lista do botão nem tinha rota.
 *
 * 🔑 Esta rota NÃO rebaixa status. A importação da SolarEdge derivou
 * `statusMonitoramento` da ausência de um campo opcional e jogou as 249 usinas
 * dela para SEM_DADOS com geração do próprio dia no banco
 * (ver memória `project_import_plantas_rebaixa_status`). Aqui vale a regra
 * inversa: **sem evidência, não escreve** — de usina já cadastrada só se
 * atualizam dados de CADASTRO (nome, cidade, kWp). Status, `ultimaLeitura` e
 * geração continuam sendo trabalho de quem mede: o coletor intradiário e o
 * botão "Atualizar geração e status".
 */
// A coleta inicial das usinas NOVAS é sequencial (a Growatt recusa requisição
// idêntica repetida) e leva ~10 chamadas por usina.
export const maxDuration = 600;

/**
 * Teto de usinas novas que ganham coleta inicial de geração no mesmo clique.
 * O caso normal é 1-3 novas; o dia em que entrarem dezenas, elas são
 * cadastradas do mesmo jeito e a geração fica para a próxima rodada — melhor
 * que estourar a cota da API no meio e gravar meia frota.
 */
const TETO_COLETA_INICIAL = 25;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // Quantos meses de histórico as usinas NOVAS trazem já no cadastro. 2 cobre
  // "entrou no fim do mês" sem transformar o clique em backfill — para 12 meses
  // existe o botão da tela de detalhe (`[id]/growatt-sync`).
  const meses = Number.isFinite(body?.meses) ? Math.max(1, Math.min(12, Number(body.meses))) : 2;

  try {
    const plants = await listarPlantas();

    const existentes = await prisma.brasilSolarClient.findMany({
      where: { plataformaMonitoramento: "GROWATT" },
      select: {
        id: true,
        nome: true,
        cidade: true,
        potenciaInstalada: true,
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
    let errors = 0;
    const novas: string[] = [];
    const avisos: string[] = [];
    let coletaInicialFeita = 0;

    for (const plant of plants) {
      try {
        const existente = porPlantId.get(String(plant.plantId));

        if (existente) {
          // Só cadastro, e só o que a API REALMENTE trouxe. Campo vazio na API
          // não apaga campo preenchido no banco (a potência de 3 das 78 foi
          // acertada à mão; a API segue devolvendo vazio para elas).
          const dados: Record<string, unknown> = {};
          if (plant.name && plant.name !== existente.nome) dados.nome = plant.name;
          if (plant.city && plant.city !== existente.cidade) dados.cidade = plant.city;
          if (plant.capacityKwp > 0 && plant.capacityKwp !== existente.potenciaInstalada) {
            dados.potenciaInstalada = plant.capacityKwp;
          }
          if (Object.keys(dados).length > 0) {
            await prisma.brasilSolarClient.update({ where: { id: existente.id }, data: dados });
            updated++;
          }
          continue;
        }

        const criado = await prisma.brasilSolarClient.create({
          data: {
            nome: plant.name,
            plataformaMonitoramento: "GROWATT",
            monitoramentoPlantId: String(plant.plantId),
            inversorMarca: "Growatt",
            statusContrato: "ATIVO",
            // Nasce em SEM_DADOS de propósito: enquanto ninguém LEU a geração,
            // "não sei" é a verdade. A coleta logo abaixo corrige quando houver
            // dado — nunca ao contrário.
            statusMonitoramento: "SEM_DADOS",
            ...(plant.city ? { cidade: plant.city } : {}),
            ...(plant.capacityKwp > 0 ? { potenciaInstalada: plant.capacityKwp } : {}),
            observacoesInternas: `Importada da Growatt OSS em ${new Date().toLocaleDateString("pt-BR")}`,
          },
          select: {
            id: true,
            nome: true,
            geracaoMediaEsperada: true,
            geracaoAnualEsperada: true,
          },
        });
        created++;
        novas.push(`${plant.name} (${plant.plantId})`);

        // ⚠️ UF não vem da API (`plant/list` dá city e country, não estado) e
        // NÃO é chutada aqui, mesmo com as 78 atuais todas em RS. Fica para o
        // cadastro — estimar realidade do cliente já custou caro antes.
        avisos.push(`${plant.name}: conferir UF e vínculo de proprietário no cadastro`);

        if (coletaInicialFeita < TETO_COLETA_INICIAL) {
          coletaInicialFeita++;
          const r = await coletaInicial(criado, String(plant.plantId), meses);
          if (r.aviso) avisos.push(`${plant.name}: ${r.aviso}`);
        } else {
          avisos.push(`${plant.name}: cadastrada sem geração (teto de ${TETO_COLETA_INICIAL} por rodada)`);
        }
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : "erro desconhecido";
        avisos.push(`${plant.name}: FALHOU — ${msg}`);
      }
    }

    // Cadastro que a conta Growatt não lista mais. NÃO é desativado por conta
    // própria — some da API também quando a planta é movida de sub-conta, e
    // desativar calado apagaria usina viva da tela.
    const idsDaApi = new Set(plants.map((p) => String(p.plantId)));
    const ausentesNaApi = existentes
      .filter((c) => c.monitoramentoPlantId && !idsDaApi.has(c.monitoramentoPlantId))
      .map((c) => `${c.nome} (${c.monitoramentoPlantId})`);

    return NextResponse.json({
      message: "Sincronizacao Growatt concluida",
      total: plants.length,
      created,
      updated,
      errors,
      novas,
      // Presente na tela, nunca resolvido às escondidas.
      ausentesNaApi,
      avisos: avisos.slice(0, 30),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Lista as plantas contornando o `10012 error_frequently_access`.
 *
 * 🔑 O 10012 da Growatt é debounce sobre a requisição **IDÊNTICA** (mesma
 * interface + mesmos parâmetros), não cota por tempo — medido em 12 e
 * 14/08/2026. Então repetir a MESMA chamada não adianta; mudar o `perpage`
 * muda a requisição e passa. Foi assim que a conta de 80 plantas foi lida em
 * 03/09/2026, depois de um 10012 no `perpage` padrão.
 */
async function listarPlantas(): Promise<GrowattPlant[]> {
  let ultimoErro: unknown = new Error("Growatt nao respondeu");

  for (const perpage of [100, 97, 93]) {
    try {
      const all: GrowattPlant[] = [];
      let page = 1;
      // Guarda-chuva contra loop, como no adapter: no máx 50 páginas.
      for (let i = 0; i < 50; i++) {
        const { plants, count } = await getPlantList(page, perpage);
        all.push(...plants);
        if (all.length >= count || plants.length === 0) break;
        page++;
      }
      return all;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Só o 10012 justifica outra tentativa. Token errado ou cluster errado
      // (10011) repetiria três vezes o mesmo erro à toa.
      if (!msg.includes("10012")) throw e;
      ultimoErro = e;
    }
  }

  throw ultimoErro;
}

/**
 * Geração dos últimos `meses` de uma usina recém-criada, para ela não nascer
 * "Sem dados" tendo histórico. Só toca status/leitura quando MEDIU algo.
 */
async function coletaInicial(
  cliente: { id: string; geracaoMediaEsperada?: number | null; geracaoAnualEsperada?: number | null },
  plantId: string,
  meses: number,
): Promise<{ aviso?: string }> {
  const agora = new Date();
  let gravados = 0;
  let diasSemDado = 0;
  let ultimoDiaComGeracao: Date | null = null;
  let ultimaGeracao: number | null = null;
  const mesesLimitados: string[] = [];

  for (let i = 0; i < meses; i++) {
    const ref = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const year = ref.getFullYear();
    const month = ref.getMonth() + 1;

    try {
      const serie = await getDailyGeneration(plantId, year, month);

      for (const dia of serie) {
        // 0,0 kWh da Growatt é "não recebi dado", não "gerou zero" — gravar
        // zero faria o relatório afirmar que a usina não produziu.
        if (ehDiaSemDado(dia.energyKwh)) {
          diasSemDado++;
          continue;
        }
        const data = new Date(Date.UTC(year, month - 1, dia.day, 12, 0, 0));

        await prisma.monitoringLog.upsert({
          where: { clientId_data: { clientId: cliente.id, data } },
          update: { origem: "API", geracaoDiaria: dia.energyKwh },
          create: {
            clientId: cliente.id,
            data,
            geracaoDiaria: dia.energyKwh,
            geracaoEsperada: esperadaDoDiaDaUsina(cliente, data),
          },
        });
        gravados++;

        if (!ultimoDiaComGeracao || data > ultimoDiaComGeracao) {
          ultimoDiaComGeracao = data;
          ultimaGeracao = dia.energyKwh;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const rotulo = `${String(month).padStart(2, "0")}/${year}`;
      // 10012 é recusa por frequência: o mês não foi LIDO. Nunca confundir com
      // mês sem geração.
      if (msg.includes("10012")) mesesLimitados.push(rotulo);
      else throw e;
    }
  }

  if (gravados === 0) {
    if (mesesLimitados.length > 0) {
      return { aviso: `cadastrada, mas a Growatt recusou por frequência (10012) em ${mesesLimitados.join(", ")} — use "Atualizar GROWATT" na tela dela` };
    }
    if (diasSemDado > 0) {
      return { aviso: `cadastrada em Sem dados — a Growatt devolveu ${diasSemDado} dia(s) zerados (datalogger sem comunicar, NÃO prova usina parada)` };
    }
    return { aviso: "cadastrada em Sem dados — a Growatt não tem geração no período" };
  }

  // Só chega aqui com dado medido. Status pela geração real, no mesmo critério
  // do WEG: gerou ontem = ONLINE, até 3 dias = ALERTA, além disso = OFFLINE.
  const hojeMeioDia = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12, 0, 0);
  const diasParado = Math.round((hojeMeioDia - (ultimoDiaComGeracao as Date).getTime()) / 86_400_000);
  const statusMonitoramento = diasParado <= 1 ? "ONLINE" : diasParado <= 3 ? "ALERTA" : "OFFLINE";

  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const soma = await prisma.monitoringLog.aggregate({
    where: { clientId: cliente.id, data: { gte: inicioMes } },
    _sum: { geracaoDiaria: true },
  });
  const geracaoMesAtual = soma._sum.geracaoDiaria ?? 0;

  await prisma.brasilSolarClient.update({
    where: { id: cliente.id },
    data: {
      statusMonitoramento,
      // Carimbo do último dia MEDIDO, não de "agora": `ultimaLeitura` alimenta o
      // alerta de mudez por horas solares, e carimbar hoje cegaria o alerta.
      ultimaLeitura: ultimoDiaComGeracao as Date,
      ultimaGeracao,
      geracaoMesAtual,
      performanceRatio: performanceRatioMesAtual(cliente, geracaoMesAtual, agora),
    },
  });

  return mesesLimitados.length > 0
    ? { aviso: `${gravados} dia(s) gravados; ${mesesLimitados.join(", ")} recusado(s) por frequência (10012)` }
    : {};
}
