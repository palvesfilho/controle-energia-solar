/**
 * Público de uma campanha de MENSAGENS: quem recebe o aviso.
 *
 * A audiência é sempre `BrasilSolarProprietario` ativo — é o cliente que tem
 * portal, celular inscrito e é dono da usina. Consumidor da Associação não
 * entra aqui: não existe push para ele (`PushSubscription` pendura no
 * proprietário) e a oferta é outra.
 *
 * O filtro é SEMPRE um recorte, nunca uma lista salva de nomes. Motivo prático:
 * campanha escrita hoje e disparada semana que vem tem de pegar o cliente que
 * entrou no meio, e não pode pegar quem saiu. A lista só vira concreta no
 * disparo (`mensagens-campanha.ts`), e aí é congelada em `CampanhaEnvio`.
 *
 * ⚠️ Os campos de usina (potência, marca de inversor, leitura, garantia) são
 * checados com `plantas: { some: ... }` — basta UMA usina do cliente casar.
 * Cliente com duas usinas de portes diferentes cai nas duas faixas de potência,
 * e isso é proposital: quem oferece limpeza quer alcançar o telhado que se
 * encaixa, não uma média que não existe em lugar nenhum.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Recorte do público. Todo campo é opcional e todos se somam com E:
 * `{ uf: ["RS"], somenteComApp: true }` = clientes do RS QUE TAMBÉM têm app.
 *
 * Filtro vazio (`{}`) = todos os clientes ativos.
 */
export interface FiltroPublico {
  /** Só quem tem pelo menos um celular inscrito para push. */
  somenteComApp?: boolean;
  /** Só quem NÃO tem app — público de campanha "instale o app". */
  somenteSemApp?: boolean;

  /** Acesso pago ao portal: ATIVO | SEM_ACESSO. Ausente = tanto faz. */
  acessoPortal?: "ATIVO" | "SEM_ACESSO";

  uf?: string[];
  cidade?: string[];

  /** kWp de ao menos uma usina do cliente. */
  potenciaMin?: number;
  potenciaMax?: number;

  /** Marca do inversor (GROWATT, SUNGROW, ...). Casa por igualdade exata. */
  inversorMarcas?: string[];

  /** Código de `src/lib/tipos-telhado.ts` — o que decide preço de limpeza. */
  tiposTelhado?: string[];

  /** Quem executou a obra: BRASIL_SOLAR | TERCEIRO. */
  executadoPor?: "BRASIL_SOLAR" | "TERCEIRO";

  /** Status desnormalizado da usina: ONLINE | OFFLINE | ALERTA | SEM_DADOS. */
  statusMonitoramento?: string[];

  /**
   * Usina sem leitura nova há N dias (inclui a que nunca leu). É o filtro da
   * campanha de reconexão de wi-fi: datalogger mudo aparece exatamente assim.
   */
  semLeituraDias?: number;

  /** Sistema instalado há pelo menos N meses — limpeza/manutenção periódica. */
  idadeMesesMin?: number;

  /** Garantia terminando dentro de N dias — gancho de seguro/extensão. */
  garantiaVenceEmDias?: number;

  /** Escolha manual: ids de proprietários. Some com os demais filtros. */
  proprietarioIds?: string[];
}

export interface DestinatarioPublico {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  aparelhos: number;
}

export interface PreviaPublico {
  total: number;
  comApp: number;
  aparelhos: number;
  resumo: string;
  /** Primeiros nomes, só para o operador conferir que o recorte faz sentido. */
  amostra: DestinatarioPublico[];
}

/** Meia-noite de hoje menos N dias, para comparar com timestamps. */
function diasAtras(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d;
}

function mesesAtras(meses: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d;
}

/**
 * Traduz o filtro para um `where` do Prisma.
 *
 * Condições de usina entram cada uma em seu próprio `plantas: { some: ... }`
 * dentro de um AND. Juntar tudo num `some` só significaria "existe UMA usina
 * que satisfaz TODAS" — recorte diferente, e mais estreito do que o operador
 * espera ao marcar duas caixas.
 */
export function filtroParaWhere(
  filtro: FiltroPublico,
): Prisma.BrasilSolarProprietarioWhereInput {
  const and: Prisma.BrasilSolarProprietarioWhereInput[] = [];

  if (filtro.somenteComApp) and.push({ pushSubscriptions: { some: {} } });
  if (filtro.somenteSemApp) and.push({ pushSubscriptions: { none: {} } });

  if (filtro.acessoPortal === "ATIVO") {
    and.push({ acesso: { status: "ATIVO" } });
  } else if (filtro.acessoPortal === "SEM_ACESSO") {
    and.push({ OR: [{ acesso: null }, { acesso: { status: { not: "ATIVO" } } }] });
  }

  if (filtro.uf?.length) and.push({ uf: { in: filtro.uf } });
  if (filtro.cidade?.length) and.push({ cidade: { in: filtro.cidade } });

  if (filtro.executadoPor) and.push({ executadoPor: filtro.executadoPor });
  if (filtro.tiposTelhado?.length) and.push({ tipoTelhado: { in: filtro.tiposTelhado } });

  if (filtro.proprietarioIds?.length) and.push({ id: { in: filtro.proprietarioIds } });

  if (filtro.potenciaMin != null || filtro.potenciaMax != null) {
    and.push({
      plantas: {
        some: {
          active: true,
          potenciaInstalada: {
            ...(filtro.potenciaMin != null ? { gte: filtro.potenciaMin } : {}),
            ...(filtro.potenciaMax != null ? { lte: filtro.potenciaMax } : {}),
          },
        },
      },
    });
  }

  if (filtro.inversorMarcas?.length) {
    and.push({ plantas: { some: { active: true, inversorMarca: { in: filtro.inversorMarcas } } } });
  }

  if (filtro.statusMonitoramento?.length) {
    and.push({
      plantas: { some: { active: true, statusMonitoramento: { in: filtro.statusMonitoramento } } },
    });
  }

  if (filtro.semLeituraDias != null) {
    const limite = diasAtras(filtro.semLeituraDias);
    and.push({
      plantas: {
        some: {
          active: true,
          OR: [{ ultimaLeitura: null }, { ultimaLeitura: { lt: limite } }],
        },
      },
    });
  }

  if (filtro.idadeMesesMin != null) {
    and.push({
      plantas: { some: { active: true, dataInstalacao: { lte: mesesAtras(filtro.idadeMesesMin) } } },
    });
  }

  if (filtro.garantiaVenceEmDias != null) {
    const hoje = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + filtro.garantiaVenceEmDias);
    and.push({
      plantas: { some: { active: true, garantiaAte: { gte: hoje, lte: limite } } },
    });
  }

  return and.length > 0 ? { active: true, AND: and } : { active: true };
}

/**
 * Resolve o público AGORA. Devolve na ordem alfabética para a prévia ficar
 * estável entre dois cliques (lista que embaralha faz o operador desconfiar
 * que o filtro mudou).
 */
export async function resolverPublico(
  filtro: FiltroPublico,
): Promise<DestinatarioPublico[]> {
  const linhas = await prisma.brasilSolarProprietario.findMany({
    where: filtroParaWhere(filtro),
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      cidade: true,
      uf: true,
      _count: { select: { pushSubscriptions: true } },
    },
  });

  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    cidade: l.cidade,
    uf: l.uf,
    aparelhos: l._count.pushSubscriptions,
  }));
}

const ROTULO_TELHADO: Record<string, string> = {
  TELHADO_METALICO: "metálico",
  CERAMICO_CONCRETO: "cerâmico/concreto",
  FIBROCIMENTO: "fibrocimento",
  CALHETAO_METALICO: "calhetão metálico",
  CALHETAO_FIBROCIMENTO: "calhetão fibrocimento",
  LAJE: "laje",
  ESTRUTURA_SOLO: "solo",
  ESTRUTURA_ESTACIONAMENTO: "estacionamento",
  PERSONALIZADA_MISTA: "mista",
};

/**
 * Frase curta que descreve o recorte, para congelar na campanha e aparecer no
 * relatório. Sem isso, meses depois ninguém sabe quem recebeu aquele disparo —
 * o Json do filtro está lá, mas ninguém lê Json numa reunião.
 */
export function descreverFiltro(filtro: FiltroPublico): string {
  const partes: string[] = [];

  if (filtro.somenteComApp) partes.push("com app instalado");
  if (filtro.somenteSemApp) partes.push("sem app");
  if (filtro.acessoPortal === "ATIVO") partes.push("portal ativo");
  if (filtro.acessoPortal === "SEM_ACESSO") partes.push("sem portal pago");
  if (filtro.uf?.length) partes.push(filtro.uf.join("/"));
  if (filtro.cidade?.length) partes.push(filtro.cidade.join(", "));
  if (filtro.potenciaMin != null && filtro.potenciaMax != null)
    partes.push(`${filtro.potenciaMin}–${filtro.potenciaMax} kWp`);
  else if (filtro.potenciaMin != null) partes.push(`≥ ${filtro.potenciaMin} kWp`);
  else if (filtro.potenciaMax != null) partes.push(`até ${filtro.potenciaMax} kWp`);
  if (filtro.inversorMarcas?.length) partes.push(`inversor ${filtro.inversorMarcas.join("/")}`);
  if (filtro.tiposTelhado?.length)
    partes.push(
      `telhado ${filtro.tiposTelhado.map((t) => ROTULO_TELHADO[t] ?? t).join("/")}`,
    );
  if (filtro.executadoPor === "BRASIL_SOLAR") partes.push("obra Brasil Solar");
  if (filtro.executadoPor === "TERCEIRO") partes.push("obra de terceiro");
  if (filtro.statusMonitoramento?.length)
    partes.push(`usina ${filtro.statusMonitoramento.join("/").toLowerCase()}`);
  if (filtro.semLeituraDias != null)
    partes.push(`sem leitura há ${filtro.semLeituraDias} dia(s)`);
  if (filtro.idadeMesesMin != null) partes.push(`instalada há ${filtro.idadeMesesMin}+ meses`);
  if (filtro.garantiaVenceEmDias != null)
    partes.push(`garantia vence em ${filtro.garantiaVenceEmDias} dias`);
  if (filtro.proprietarioIds?.length)
    partes.push(`${filtro.proprietarioIds.length} cliente(s) escolhido(s) à mão`);

  return partes.length ? partes.join(" · ") : "Todos os clientes ativos";
}

/** Prévia para a tela: contagem + amostra, sem disparar nada. */
export async function previaPublico(filtro: FiltroPublico): Promise<PreviaPublico> {
  const lista = await resolverPublico(filtro);
  return {
    total: lista.length,
    comApp: lista.filter((d) => d.aparelhos > 0).length,
    aparelhos: lista.reduce((s, d) => s + d.aparelhos, 0),
    resumo: descreverFiltro(filtro),
    amostra: lista.slice(0, 12),
  };
}

/**
 * Valores que existem de fato no banco, para a tela oferecer só recorte que
 * devolve gente. Lista fixa de UF/marca acabaria oferecendo filtro que sempre
 * dá zero, e o operador conclui que a ferramenta está quebrada.
 */
export async function opcoesDeFiltro(): Promise<{
  ufs: string[];
  cidades: string[];
  inversorMarcas: string[];
  tiposTelhado: string[];
}> {
  const [props, plantas] = await Promise.all([
    prisma.brasilSolarProprietario.findMany({
      where: { active: true },
      select: { uf: true, cidade: true, tipoTelhado: true },
    }),
    prisma.brasilSolarClient.findMany({
      where: { active: true },
      select: { inversorMarca: true },
    }),
  ]);

  const unicos = (vs: (string | null)[]) =>
    Array.from(new Set(vs.filter((v): v is string => !!v && v.trim() !== ""))).sort();

  return {
    ufs: unicos(props.map((p) => p.uf)),
    cidades: unicos(props.map((p) => p.cidade)),
    inversorMarcas: unicos(plantas.map((p) => p.inversorMarca)),
    tiposTelhado: unicos(props.map((p) => p.tipoTelhado)),
  };
}
