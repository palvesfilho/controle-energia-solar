import { prisma } from "@/lib/prisma";
import type { AcaoRecomendada, AcaoTipo } from "@/lib/analise-creditos";

// Tipos de sugestão geradas por ação. Cada uma tem ou um `href`
// (link interno, abre na mesma aba) OU uma `action` (mutação via API).
// `tone` define só a cor visual da chip.
export type SugestaoTipo =
  | "MARCAR_ESPERADO"
  | "REBALANCEAR_RATEIO"
  | "AUMENTAR_RATEIO_UC"
  | "INVESTIGAR_CLIENTE"
  | "CROSS_PLANT_TRANSFER"
  | "CAPTAR_UCS"
  | "CRIAR_RATEIO"
  | "VER_MONITORAMENTO"
  | "VER_CURVA_GERACAO";

export type SugestaoTone = "primary" | "neutral" | "warn" | "info";

export interface SugestaoAction {
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  body?: Record<string, unknown>;
  confirm?: string;
  promptObservacao?: boolean; // se true, UI pede observação antes
  successMessage?: string;
}

export interface Sugestao {
  tipo: SugestaoTipo;
  label: string;
  descricao: string;
  tone?: SugestaoTone;
  href?: string;
  action?: SugestaoAction;
}

// Contexto agregado pra gerar sugestões — busca uma vez no compute,
// reusa pra todas as ações.
export interface ContextoSugestoes {
  // Plant.id → array de outras plants do mesmo investidor que estão com
  // saldo vencendo (candidatas pra absorver UC de baixa)
  plantsCandidatasPorPlant: Map<string, Array<{ id: string; name: string; vencendoKwh: number }>>;
  // Plant.id → boolean: existe RateioVersion VIGENTE com mais de 1 item
  // (i.e., faz sentido sugerir rebalancear)
  temRateioMultiItem: Set<string>;
}

export async function carregarContextoSugestoes(
  plantIds: string[],
  vencendoPorPlant: Map<string, number>,
): Promise<ContextoSugestoes> {
  // 1) Cross-plant: pra cada plant, achar outras plants do mesmo investidor
  //    com vencendoKwh > 100. Critério: compartilhar AO MENOS um investidor.
  const investorPlants = await prisma.investorPlant.findMany({
    where: { plantId: { in: plantIds } },
    select: { plantId: true, investorId: true },
  });
  // investorId → plantIds[]
  const plantsPorInvestor = new Map<string, Set<string>>();
  for (const ip of investorPlants) {
    const set = plantsPorInvestor.get(ip.investorId) ?? new Set();
    set.add(ip.plantId);
    plantsPorInvestor.set(ip.investorId, set);
  }
  // plantId → investorIds[]
  const investorsPorPlant = new Map<string, string[]>();
  for (const ip of investorPlants) {
    const arr = investorsPorPlant.get(ip.plantId) ?? [];
    arr.push(ip.investorId);
    investorsPorPlant.set(ip.plantId, arr);
  }

  // Carrega nome das plants candidatas (pode incluir plants fora do escopo)
  const plantsCandidatasIds = new Set<string>();
  for (const [pid, kwh] of vencendoPorPlant) {
    if (kwh < 100) continue;
    plantsCandidatasIds.add(pid);
  }
  const plantsInfo = plantsCandidatasIds.size
    ? await prisma.plant.findMany({
        where: { id: { in: Array.from(plantsCandidatasIds) } },
        select: { id: true, name: true },
      })
    : [];
  const nomePlant = new Map(plantsInfo.map((p) => [p.id, p.name]));

  const plantsCandidatasPorPlant = new Map<
    string,
    Array<{ id: string; name: string; vencendoKwh: number }>
  >();
  for (const plantId of plantIds) {
    const investors = investorsPorPlant.get(plantId) ?? [];
    const candidatas = new Map<string, number>(); // pid → kwh
    for (const invId of investors) {
      const irmas = plantsPorInvestor.get(invId) ?? new Set();
      for (const irmaId of irmas) {
        if (irmaId === plantId) continue;
        const kwh = vencendoPorPlant.get(irmaId) ?? 0;
        if (kwh >= 100 && !candidatas.has(irmaId)) {
          candidatas.set(irmaId, kwh);
        }
      }
    }
    if (candidatas.size > 0) {
      plantsCandidatasPorPlant.set(
        plantId,
        Array.from(candidatas.entries())
          .map(([id, kwh]) => ({
            id,
            name: nomePlant.get(id) ?? id,
            vencendoKwh: kwh,
          }))
          .sort((a, b) => b.vencendoKwh - a.vencendoKwh)
          .slice(0, 3),
      );
    }
  }

  // 2) Rateio multi-item: pra sugerir rebalancear precisa de RateioVersion
  //    VIGENTE com 2+ itens (senão não tem o que rebalancear).
  const rateiosComItens = await prisma.rateioVersion.findMany({
    where: { plantId: { in: plantIds }, status: "VIGENTE" },
    select: {
      plantId: true,
      _count: { select: { items: true } },
    },
  });
  const temRateioMultiItem = new Set<string>();
  for (const r of rateiosComItens) {
    if (r._count.items >= 2) temRateioMultiItem.add(r.plantId);
  }

  return { plantsCandidatasPorPlant, temRateioMultiItem };
}

// Gera sugestões pra uma ação. Recebe a ação + contexto agregado +
// usuario atual (pra atribuir auto em "Investigar").
export function gerarSugestoesParaAcao(
  acao: AcaoRecomendada & { id?: string },
  ctx: ContextoSugestoes,
  acaoIdQuandoPersistida?: string,
): Sugestao[] {
  const sugestoes: Sugestao[] = [];
  const idForActions = acaoIdQuandoPersistida ?? acao.id;

  switch (acao.tipo as AcaoTipo) {
    case "CONSUMO_ANOMALO": {
      const subiu = (acao.metricaLabel ?? "").includes("acima");
      // Sempre disponível: marcar esperado (UC) e investigar (atribui responsável)
      if (acao.consumerUnitId) {
        sugestoes.push({
          tipo: "MARCAR_ESPERADO",
          label: "Marcar como esperado (3 meses)",
          descricao:
            "Silencia este alerta por 3 meses (UC sazonal, desocupada, troca de inquilino).",
          tone: "neutral",
          action: {
            method: "POST",
            url: "/api/admin/gestao-creditos/baselines",
            body: {
              consumerUnitId: acao.consumerUnitId,
              motivo: "CONFIRMADO_PELO_CLIENTE",
              meses: 3,
            },
            promptObservacao: true,
            successMessage: "Marcado. Vai sumir do próximo refresh.",
          },
        });
      }

      // Rebalancear / aumentar rateio
      if (acao.plantId && ctx.temRateioMultiItem.has(acao.plantId)) {
        sugestoes.push({
          tipo: subiu ? "AUMENTAR_RATEIO_UC" : "REBALANCEAR_RATEIO",
          label: subiu
            ? "Aumentar rateio desta UC"
            : "Realocar % desta UC pra outras",
          descricao: subiu
            ? "UC consumindo acima da média — considere dar mais % do rateio se houver saldo."
            : "UC consumindo abaixo — % do rateio aqui pode ir pra outras UCs no limite.",
          tone: "primary",
          href: `/admin/gestao-creditos/rateios?plantId=${acao.plantId}`,
        });
      }

      // Cross-plant (apenas pra consumo CAINDO — UC sobrando saldo aqui;
      // outra plant do mesmo investidor com vencendo precisa de UC)
      if (!subiu && acao.plantId) {
        const candidatas = ctx.plantsCandidatasPorPlant.get(acao.plantId);
        if (candidatas && candidatas.length > 0) {
          const lista = candidatas
            .map((c) => `${c.name} (${c.vencendoKwh.toFixed(0)} kWh vencendo)`)
            .join(", ");
          sugestoes.push({
            tipo: "CROSS_PLANT_TRANSFER",
            label: "Avaliar transferência pra outra usina",
            descricao: `Outras usinas do investidor com saldo vencendo: ${lista}. Considere mover esta UC na próxima renovação.`,
            tone: "info",
          });
        }
      }

      if (idForActions) {
        sugestoes.push({
          tipo: "INVESTIGAR_CLIENTE",
          label: "Investigar com cliente",
          descricao:
            "Atribui esta ação a você e abre prompt pra anotar o feedback (atividade comercial parada? troca de inquilino? sazonal?).",
          tone: "warn",
          action: {
            method: "PATCH",
            url: `/api/admin/gestao-creditos/acoes/${idForActions}`,
            body: { responsavelUserId: "@me" }, // placeholder; UI resolve
            promptObservacao: true,
            successMessage: "Atribuído a você.",
          },
        });
      }
      break;
    }

    case "CREDITOS_VENCENDO_30D": {
      if (acao.plantId && ctx.temRateioMultiItem.has(acao.plantId)) {
        sugestoes.push({
          tipo: "REBALANCEAR_RATEIO",
          label: "Rebalancear rateio",
          descricao:
            "Aumentar % das UCs gargalo (com menos margem de consumo) absorve mais antes de vencer.",
          tone: "primary",
          href: `/admin/gestao-creditos/rateios?plantId=${acao.plantId}`,
        });
      }
      if (acao.plantId) {
        sugestoes.push({
          tipo: "CAPTAR_UCS",
          label: "Buscar UCs novas",
          descricao:
            "Captação de novos consumidores absorve o excesso. Veja proprietários da região no mapa.",
          tone: "info",
          href: "/admin/brasil-solar/mapa",
        });
      }
      break;
    }

    case "USINA_SUBPERFORMANDO": {
      if (acao.plantId) {
        sugestoes.push({
          tipo: "VER_CURVA_GERACAO",
          label: "Ver curva de geração",
          descricao:
            "Abre o monitoramento desta usina pra investigar queda — sujeira, sombreamento, falha de inversor.",
          tone: "primary",
          href: "/admin/brasil-solar",
        });
      }
      break;
    }

    case "USINA_OFFLINE_30D": {
      sugestoes.push({
        tipo: "VER_MONITORAMENTO",
        label: "Conferir plataforma de monitoramento",
        descricao:
          "Provavelmente queda de internet, troca de inversor ou credencial vencida. Logar na plataforma do fabricante.",
        tone: "primary",
        href: "/admin/brasil-solar",
      });
      break;
    }

    case "USINA_SEM_RATEIO_VIGENTE": {
      if (acao.plantId) {
        sugestoes.push({
          tipo: "CRIAR_RATEIO",
          label: "Criar rateio agora",
          descricao:
            "Sem rateio vigente os créditos não têm destino formal. Criar uma nova RateioVersion resolve.",
          tone: "primary",
          href: `/admin/gestao-creditos/rateios?plantId=${acao.plantId}`,
        });
      }
      break;
    }

    case "OPORTUNIDADE_CAPTACAO": {
      sugestoes.push({
        tipo: "CAPTAR_UCS",
        label: "Ver proprietários na região",
        descricao:
          "Mapa Brasil Solar mostra clientes existentes e potenciais leads próximos da usina.",
        tone: "primary",
        href: "/admin/brasil-solar/mapa",
      });
      break;
    }
  }

  return sugestoes;
}
