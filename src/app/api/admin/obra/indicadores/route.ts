import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { parseObraMeta } from "@/lib/obra-meta";
import {
  intervalosSobrepoem,
  isAtrasada,
  startOfDay,
} from "@/lib/obra-calendario";

export interface ObraIndicadoresPayload {
  emExecucao: { count: number; kwpTotal: number };
  atrasadas: { count: number };
  aprovacoesPendentes: { count: number };
  aIniciar7d: { count: number };
  concluidasMes: { count: number; kwpTotal: number };
  conflitosEquipe: { count: number };
  // Fase 2 â€” saÃºde operacional. Base: obras CONCLUIDAS dos Ãºltimos 90 dias.
  leadTime: {
    amostra: number;
    diasRealMedio: number | null;
    diasPlanejadoMedio: number | null;
    deltaDias: number | null; // real - planejado (positivo = atrasou em mÃ©dia)
  };
  aderenciaPrazo: {
    amostra: number;
    percent: number | null; // % de obras CONCLUIDAS no prazo (dataFimReal â‰¤ dataFimPrevista)
  };
  obraEnergizacao: {
    amostra: number;
    diasMedio: number | null;
  };
  semListaMaterial: {
    count: number; // obras c/ inÃ­cio em â‰¤14d sem ObraListaMaterial
  };
  // Fase B â€” Pipeline visual + decisÃµes da semana
  funil: {
    planejamento: { count: number; kwpTotal: number };
    emExecucao: { count: number; kwpTotal: number };
    pausadas: { count: number };
  };
  pipeline60d: {
    count: number;
    kwpTotal: number;
  };
  decisoesSemana: DecisaoSemana[];
  // Fase C â€” diretoria
  tendencia12m: TendenciaMes[];
  equipeCarga: EquipeCarga[];
  comparativoMes: ComparativoMes;
  geradoEm: string;
}

export interface TendenciaMes {
  ano: number;
  mes: number; // 1-12
  label: string; // "Jan/26"
  concluidasCount: number;
  kwpTotal: number;
  aderenciaPct: number | null; // null se amostra=0
}

export interface EquipeCarga {
  equipeId: string;
  equipeNome: string;
  cor: string | null;
  cargaAtual: number; // obras EM_EXECUCAO agora
  concluidas30d: number;
  kwp30d: number;
}

export interface ComparativoMes {
  atual: ComparativoSlice;
  anterior: ComparativoSlice;
}

export interface ComparativoSlice {
  label: string; // "mai/26"
  concluidasCount: number;
  kwpTotal: number;
  leadTimeRealMedio: number | null;
  aderenciaPct: number | null;
}

export type DecisaoTipo =
  | "APROVAR"
  | "CONFLITO_EQUIPE"
  | "ATRASADA"
  | "SEM_MATERIAL";

export interface DecisaoSemana {
  tipo: DecisaoTipo;
  obraId: string;
  obraNome: string;
  detalhe: string; // texto curto pra UI ("InÃ­cio 02/06", "+5d de atraso", etc.)
  prioridade: number; // menor = mais urgente
  link: string; // rota pro local da aÃ§Ã£o
}

type ObraComMeta = {
  id: string;
  nome: string;
  status: string;
  aprovacao: string;
  equipeId: string | null;
  plantId: string | null;
  dataInicioPrevista: Date | null;
  dataFimPrevista: Date | null;
  dataInicioReal: Date | null;
  dataFimReal: Date | null;
  observacoes: string | null;
};

// DiferenÃ§a em dias entre duas datas, em base diÃ¡ria (zera horas). Sempre
// retorna nÃºmero nÃ£o-negativo; ordem dos args nÃ£o importa.
function diffDias(a: Date, b: Date): number {
  const da = startOfDay(a).getTime();
  const db = startOfDay(b).getTime();
  return Math.abs(db - da) / (24 * 60 * 60 * 1000);
}

// kWp vem em ordem de preferÃªncia: meta.potenciaKwp (set no cadastro) â†’
// proprietario.potenciaInstalada (quando vinculado a BrasilSolarProprietario).
// Sem nenhum dos dois, soma 0 (o card mostra "â€”" abaixo do nÃºmero).
function resolverKwp(
  obra: ObraComMeta,
  proprietarioPotenciaById: Map<string, number | null>,
): number {
  const { meta } = parseObraMeta(obra.observacoes);
  if (meta.potenciaKwp != null) return meta.potenciaKwp;
  if (meta.proprietarioId) {
    const p = proprietarioPotenciaById.get(meta.proprietarioId);
    if (p != null) return p;
  }
  return 0;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "obra")) {
    return NextResponse.json({ error: "NÃ£o autorizado" }, { status: 401 });
  }

  try {
    const hoje = startOfDay(new Date());
    const em7d = new Date(hoje);
    em7d.setDate(em7d.getDate() + 7);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioProxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

    // Uma query sÃ³ pra todas as obras ativas â€” depois fatiamos no app.
    // Filtros por status/data sÃ£o baratos com poucos milhares de obras;
    // se crescer, vira queries especÃ­ficas com count().
    const obras = await prisma.obra.findMany({
      where: { active: true },
      select: {
        id: true,
        nome: true,
        status: true,
        aprovacao: true,
        equipeId: true,
        plantId: true,
        dataInicioPrevista: true,
        dataFimPrevista: true,
        dataInicioReal: true,
        dataFimReal: true,
        observacoes: true,
      },
    });

    // PrÃ©-carrega potÃªncia dos proprietÃ¡rios referenciados na meta
    const proprietarioIds = new Set<string>();
    for (const o of obras) {
      const { meta } = parseObraMeta(o.observacoes);
      if (meta.proprietarioId) proprietarioIds.add(meta.proprietarioId);
    }
    const proprietarios = proprietarioIds.size
      ? await prisma.brasilSolarProprietario.findMany({
          where: { id: { in: Array.from(proprietarioIds) } },
          select: { id: true, potenciaInstalada: true },
        })
      : [];
    const propMap = new Map(
      proprietarios.map((p) => [p.id, p.potenciaInstalada]),
    );

    let emExecucaoCount = 0;
    let emExecucaoKwp = 0;
    let atrasadasCount = 0;
    let aprovacoesPendentesCount = 0;
    let aIniciar7dCount = 0;
    let concluidasMesCount = 0;
    let concluidasMesKwp = 0;
    // Fase B â€” funil + pipeline 60d
    let planejamentoCount = 0;
    let planejamentoKwp = 0;
    let pausadasCount = 0;
    let pipeline60dCount = 0;
    let pipeline60dKwp = 0;
    const em60d = new Date(hoje);
    em60d.setDate(em60d.getDate() + 60);
    const obrasAtrasadas: ObraComMeta[] = [];
    const obrasPendentes: ObraComMeta[] = [];

    // Pra detectar conflito de equipe: agrupa obras ativas por equipe,
    // depois compara pares dentro do mesmo grupo.
    const porEquipe = new Map<string, ObraComMeta[]>();

    for (const o of obras) {
      // 1. Em execuÃ§Ã£o agora
      if (o.status === "EM_EXECUCAO") {
        emExecucaoCount++;
        emExecucaoKwp += resolverKwp(o, propMap);
      }

      // 2. Atrasadas
      if (isAtrasada(o.status, o.dataFimPrevista, hoje)) {
        atrasadasCount++;
        obrasAtrasadas.push(o);
      }

      // 3. AprovaÃ§Ãµes pendentes
      if (o.aprovacao === "PENDENTE") {
        aprovacoesPendentesCount++;
        obrasPendentes.push(o);
      }

      // Funil â€” agrega counts por status
      if (o.status === "PLANEJAMENTO") {
        planejamentoCount++;
        planejamentoKwp += resolverKwp(o, propMap);
      } else if (o.status === "PAUSADA") {
        pausadasCount++;
      }

      // Pipeline 60d â€” obras que entram em execuÃ§Ã£o em atÃ© 60 dias
      if (
        o.status === "PLANEJAMENTO" &&
        o.dataInicioPrevista &&
        o.dataInicioPrevista >= hoje &&
        o.dataInicioPrevista <= em60d
      ) {
        pipeline60dCount++;
        pipeline60dKwp += resolverKwp(o, propMap);
      }

      // 4. A iniciar em 7 dias
      if (
        o.status === "PLANEJAMENTO" &&
        o.dataInicioPrevista &&
        o.dataInicioPrevista >= hoje &&
        o.dataInicioPrevista <= em7d
      ) {
        aIniciar7dCount++;
      }

      // 5. ConcluÃ­das no mÃªs
      if (
        o.status === "CONCLUIDA" &&
        o.dataFimReal &&
        o.dataFimReal >= inicioMes &&
        o.dataFimReal < inicioProxMes
      ) {
        concluidasMesCount++;
        concluidasMesKwp += resolverKwp(o, propMap);
      }

      // 6. Conflitos: sÃ³ obras com equipe + datas + nÃ£o concluÃ­das/canceladas
      if (
        o.equipeId &&
        o.dataInicioPrevista &&
        o.dataFimPrevista &&
        o.status !== "CONCLUIDA" &&
        o.status !== "CANCELADA"
      ) {
        const arr = porEquipe.get(o.equipeId) ?? [];
        arr.push(o);
        porEquipe.set(o.equipeId, arr);
      }
    }

    // Conta obras Ãºnicas envolvidas em qualquer conflito (nÃ£o o nÂº de pares).
    // Ã‰ o que faz sentido pra mostrar no card "X obras com conflito".
    const obrasEmConflito = new Set<string>();
    for (const grupo of porEquipe.values()) {
      for (let i = 0; i < grupo.length; i++) {
        for (let j = i + 1; j < grupo.length; j++) {
          const a = grupo[i];
          const b = grupo[j];
          if (
            intervalosSobrepoem(
              a.dataInicioPrevista as Date,
              a.dataFimPrevista as Date,
              b.dataInicioPrevista as Date,
              b.dataFimPrevista as Date,
            )
          ) {
            obrasEmConflito.add(a.id);
            obrasEmConflito.add(b.id);
          }
        }
      }
    }

    // â”€â”€â”€ Fase 2: saÃºde operacional â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Janela: Ãºltimas obras CONCLUIDAS em 90 dias (corta cauda histÃ³rica que
    // distorce mÃ©dia â€” gestor quer saber tendÃªncia recente, nÃ£o vida toda).
    const noventaDiasAtras = new Date(hoje);
    noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);

    const concluidasRecentes = obras.filter(
      (o) =>
        o.status === "CONCLUIDA" &&
        o.dataFimReal &&
        o.dataFimReal >= noventaDiasAtras,
    );

    // 7. Lead time mÃ©dio â€” sÃ³ obras com inÃ­cio e fim real preenchidos
    let somaReal = 0;
    let somaPlanejado = 0;
    let amostraLeadTime = 0;
    let amostraPlanejado = 0;
    for (const o of concluidasRecentes) {
      if (o.dataInicioReal && o.dataFimReal) {
        somaReal += diffDias(o.dataInicioReal, o.dataFimReal);
        amostraLeadTime++;
      }
      if (o.dataInicioPrevista && o.dataFimPrevista) {
        somaPlanejado += diffDias(o.dataInicioPrevista, o.dataFimPrevista);
        amostraPlanejado++;
      }
    }
    const diasRealMedio = amostraLeadTime > 0 ? somaReal / amostraLeadTime : null;
    const diasPlanejadoMedio =
      amostraPlanejado > 0 ? somaPlanejado / amostraPlanejado : null;
    const deltaDias =
      diasRealMedio != null && diasPlanejadoMedio != null
        ? diasRealMedio - diasPlanejadoMedio
        : null;

    // 8. AderÃªncia ao prazo â€” % das CONCLUIDAS recentes entregues no prazo
    let noPrazo = 0;
    let amostraAderencia = 0;
    for (const o of concluidasRecentes) {
      if (o.dataFimReal && o.dataFimPrevista) {
        amostraAderencia++;
        if (
          startOfDay(o.dataFimReal).getTime() <=
          startOfDay(o.dataFimPrevista).getTime()
        ) {
          noPrazo++;
        }
      }
    }
    const percentAderencia =
      amostraAderencia > 0 ? (noPrazo / amostraAderencia) * 100 : null;

    // 9. Obra â†’ energizaÃ§Ã£o â€” dias entre dataFimReal e primeira ConsumerBill
    //    (anoRef/mesRef) da Plant vinculada que cobre perÃ­odo pÃ³s-obra.
    const obrasComPlant = concluidasRecentes.filter(
      (o): o is typeof o & { plantId: string; dataFimReal: Date } =>
        o.plantId != null && o.dataFimReal != null,
    );
    let somaEnergizacao = 0;
    let amostraEnergizacao = 0;
    if (obrasComPlant.length > 0) {
      const plantIds = obrasComPlant.map((o) => o.plantId);
      // Carrega todas as bills relevantes em 1 query â€” depois mapeia por plant.
      const billsByPlant = await prisma.consumerBill.findMany({
        where: { plantId: { in: plantIds } },
        select: { plantId: true, anoReferencia: true, mesReferencia: true },
      });
      const primeiraBillPorPlant = new Map<string, Date>();
      for (const b of billsByPlant) {
        if (!b.plantId) continue;
        const dataBill = new Date(
          Date.UTC(b.anoReferencia, b.mesReferencia - 1, 1, 12),
        );
        const atual = primeiraBillPorPlant.get(b.plantId);
        if (!atual || dataBill < atual) {
          primeiraBillPorPlant.set(b.plantId, dataBill);
        }
      }
      for (const o of obrasComPlant) {
        const dataBill = primeiraBillPorPlant.get(o.plantId);
        if (!dataBill) continue;
        // SÃ³ conta bills posteriores Ã  conclusÃ£o da obra. Se a bill Ã© anterior
        // (ex.: usina jÃ¡ existia e foi retrofitada), pula.
        if (dataBill < startOfDay(o.dataFimReal)) continue;
        somaEnergizacao += diffDias(o.dataFimReal, dataBill);
        amostraEnergizacao++;
      }
    }
    const diasMedioEnergizacao =
      amostraEnergizacao > 0 ? somaEnergizacao / amostraEnergizacao : null;

    // 10. Sem lista de material â€” obras com inÃ­cio em â‰¤14d sem ObraListaMaterial
    const em14d = new Date(hoje);
    em14d.setDate(em14d.getDate() + 14);
    const candidatasSemMaterial = obras.filter(
      (o) =>
        (o.status === "PLANEJAMENTO" || o.status === "EM_EXECUCAO") &&
        o.dataInicioPrevista &&
        o.dataInicioPrevista <= em14d,
    );
    let semListaMaterialCount = 0;
    const obrasSemMaterial: ObraComMeta[] = [];
    if (candidatasSemMaterial.length > 0) {
      const listas = await prisma.obraListaMaterial.findMany({
        where: { obraId: { in: candidatasSemMaterial.map((o) => o.id) } },
        select: { obraId: true },
      });
      const comLista = new Set(listas.map((l) => l.obraId));
      for (const o of candidatasSemMaterial) {
        if (!comLista.has(o.id)) {
          semListaMaterialCount++;
          obrasSemMaterial.push(o);
        }
      }
    }

    // â”€â”€â”€ Fase B: DecisÃµes da semana â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Lista priorizada de aÃ§Ãµes que o gestor precisa tomar AGORA. Cada item
    // vira uma linha clicÃ¡vel na UI com link direto pro local da aÃ§Ã£o.
    // Prioridade: menor nÃºmero = mais urgente.
    //  1 = atrasada (operacional crÃ­tico)
    //  2 = sem material c/ inÃ­cio iminente
    //  3 = conflito de equipe
    //  4 = aprovaÃ§Ã£o pendente (bloqueia entrada no cronograma)
    const decisoes: DecisaoSemana[] = [];
    const obrasById = new Map<string, ObraComMeta>(obras.map((o) => [o.id, o]));

    for (const o of obrasAtrasadas) {
      const dias = o.dataFimPrevista
        ? Math.round(diffDias(o.dataFimPrevista, hoje))
        : 0;
      decisoes.push({
        tipo: "ATRASADA",
        obraId: o.id,
        obraNome: o.nome,
        detalhe: `+${dias}d de atraso`,
        prioridade: 1,
        link: `/admin/obra/cronograma/${o.id}`,
      });
    }

    for (const o of obrasSemMaterial) {
      const dataIni = o.dataInicioPrevista;
      const dias = dataIni
        ? Math.max(0, Math.round(diffDias(hoje, dataIni)))
        : null;
      decisoes.push({
        tipo: "SEM_MATERIAL",
        obraId: o.id,
        obraNome: o.nome,
        detalhe:
          dias != null
            ? dias === 0
              ? "comeÃ§a hoje"
              : `comeÃ§a em ${dias}d`
            : "inÃ­cio indefinido",
        prioridade: 2,
        link: `/admin/obra/${o.id}/lista-materiais`,
      });
    }

    for (const id of obrasEmConflito) {
      const o = obrasById.get(id);
      if (!o) continue;
      decisoes.push({
        tipo: "CONFLITO_EQUIPE",
        obraId: o.id,
        obraNome: o.nome,
        detalhe: "equipe sobreposta",
        prioridade: 3,
        link: `/admin/obra/calendario`,
      });
    }

    for (const o of obrasPendentes) {
      decisoes.push({
        tipo: "APROVAR",
        obraId: o.id,
        obraNome: o.nome,
        detalhe: "aguarda aprovaÃ§Ã£o",
        prioridade: 4,
        link: `/admin/obra/aprovacao`,
      });
    }

    decisoes.sort((a, b) => a.prioridade - b.prioridade);

    // â”€â”€â”€ Fase C: diretoria â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 11. TendÃªncia 12m â€” agrega concluÃ­das/kWp/aderÃªncia por mÃªs
    const mesesLabel = [
      "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
      "Jul", "Ago", "Set", "Out", "Nov", "Dez",
    ];
    const concluidasAll = obras.filter(
      (o) => o.status === "CONCLUIDA" && o.dataFimReal,
    );
    const tendencia12m: TendenciaMes[] = [];
    for (let i = 11; i >= 0; i--) {
      const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const refProx = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1);
      const ano = ref.getFullYear();
      const mes = ref.getMonth() + 1;
      let count = 0;
      let kwp = 0;
      let noPrazo = 0;
      let amostraAder = 0;
      for (const o of concluidasAll) {
        const fim = o.dataFimReal!;
        if (fim < ref || fim >= refProx) continue;
        count++;
        kwp += resolverKwp(o, propMap);
        if (o.dataFimPrevista) {
          amostraAder++;
          if (
            startOfDay(fim).getTime() <=
            startOfDay(o.dataFimPrevista).getTime()
          ) {
            noPrazo++;
          }
        }
      }
      tendencia12m.push({
        ano,
        mes,
        label: `${mesesLabel[mes - 1]}/${String(ano).slice(2)}`,
        concluidasCount: count,
        kwpTotal: kwp,
        aderenciaPct: amostraAder > 0 ? (noPrazo / amostraAder) * 100 : null,
      });
    }

    // 12. Carga por equipe â€” obras EM_EXECUCAO agora + concluÃ­das Ãºltimos 30d
    const equipes = await prisma.equipeExecucao.findMany({
      where: { active: true },
      select: { id: true, nome: true, cor: true },
      orderBy: { nome: "asc" },
    });
    const trintaDiasAtras = new Date(hoje);
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const equipeCarga: EquipeCarga[] = equipes.map((eq) => {
      let cargaAtual = 0;
      let concluidas30d = 0;
      let kwp30d = 0;
      for (const o of obras) {
        if (o.equipeId !== eq.id) continue;
        if (o.status === "EM_EXECUCAO") cargaAtual++;
        if (
          o.status === "CONCLUIDA" &&
          o.dataFimReal &&
          o.dataFimReal >= trintaDiasAtras
        ) {
          concluidas30d++;
          kwp30d += resolverKwp(o, propMap);
        }
      }
      return {
        equipeId: eq.id,
        equipeNome: eq.nome,
        cor: eq.cor ?? null,
        cargaAtual,
        concluidas30d,
        kwp30d,
      };
    });

    // 13. Comparativo: mÃªs atual vs mÃªs anterior
    const mesAnteriorRef = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesAnteriorProx = inicioMes; // 1Âº dia do mÃªs atual = limite superior
    const sliceMes = (de: Date, ate: Date, label: string): ComparativoSlice => {
      let count = 0;
      let kwp = 0;
      let somaLeadReal = 0;
      let amostraLead = 0;
      let noPrazo = 0;
      let amostraAder = 0;
      for (const o of concluidasAll) {
        const fim = o.dataFimReal!;
        if (fim < de || fim >= ate) continue;
        count++;
        kwp += resolverKwp(o, propMap);
        if (o.dataInicioReal) {
          somaLeadReal += diffDias(o.dataInicioReal, fim);
          amostraLead++;
        }
        if (o.dataFimPrevista) {
          amostraAder++;
          if (
            startOfDay(fim).getTime() <=
            startOfDay(o.dataFimPrevista).getTime()
          ) {
            noPrazo++;
          }
        }
      }
      return {
        label,
        concluidasCount: count,
        kwpTotal: kwp,
        leadTimeRealMedio: amostraLead > 0 ? somaLeadReal / amostraLead : null,
        aderenciaPct: amostraAder > 0 ? (noPrazo / amostraAder) * 100 : null,
      };
    };
    const mesAtualLabel = `${mesesLabel[hoje.getMonth()]}/${String(hoje.getFullYear()).slice(2)}`;
    const mesAntLabel = `${mesesLabel[mesAnteriorRef.getMonth()]}/${String(mesAnteriorRef.getFullYear()).slice(2)}`;
    const comparativoMes: ComparativoMes = {
      atual: sliceMes(inicioMes, inicioProxMes, mesAtualLabel),
      anterior: sliceMes(mesAnteriorRef, mesAnteriorProx, mesAntLabel),
    };

    const payload: ObraIndicadoresPayload = {
      emExecucao: { count: emExecucaoCount, kwpTotal: emExecucaoKwp },
      atrasadas: { count: atrasadasCount },
      aprovacoesPendentes: { count: aprovacoesPendentesCount },
      aIniciar7d: { count: aIniciar7dCount },
      concluidasMes: { count: concluidasMesCount, kwpTotal: concluidasMesKwp },
      conflitosEquipe: { count: obrasEmConflito.size },
      leadTime: {
        amostra: amostraLeadTime,
        diasRealMedio,
        diasPlanejadoMedio,
        deltaDias,
      },
      aderenciaPrazo: {
        amostra: amostraAderencia,
        percent: percentAderencia,
      },
      obraEnergizacao: {
        amostra: amostraEnergizacao,
        diasMedio: diasMedioEnergizacao,
      },
      semListaMaterial: { count: semListaMaterialCount },
      funil: {
        planejamento: { count: planejamentoCount, kwpTotal: planejamentoKwp },
        emExecucao: { count: emExecucaoCount, kwpTotal: emExecucaoKwp },
        pausadas: { count: pausadasCount },
      },
      pipeline60d: { count: pipeline60dCount, kwpTotal: pipeline60dKwp },
      decisoesSemana: decisoes,
      tendencia12m,
      equipeCarga,
      comparativoMes,
      geradoEm: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/obra/indicadores]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
