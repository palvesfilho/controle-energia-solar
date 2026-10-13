import { prisma } from "./prisma";
import { addDaysOnly, dayInBrasil, formatDateOnlyBR, startOfDayInstant, todayInBrasil } from "./date-only";
import {
  CANAL_CONTATO_LABEL,
  RESULTADO_CONTATO_LABEL,
  type CanalContato,
  type ResultadoContato,
} from "./acoes-diarias-contato";

/**
 * Ações Diárias — a tela de entrada do pós-venda no módulo Brasil Solar.
 *
 * Mesmo desenho do Painel do Dia da Associação (`painel-do-dia.ts`): filas do
 * que FALTA FAZER, indicadores no topo. Não redetecta nada — as filas de usina
 * leem `MonitoringAlert`, que é o que o coletor abre e fecha sozinho a cada
 * rodada; a de acesso lê o cadastro do cliente.
 *
 * ⚠️ Nenhuma fila tem prazo nem "atrasado", de propósito (decisão do Paulo em
 * 13/10/2026): ainda não há operador e a cadência de contatos não foi definida.
 * Qualquer data criada agora nasceria vencida. As datas mostradas são FATOS
 * (última leitura, abertura do alerta), não vencimentos.
 */

/** Alerta de usina parada aberto há até este número de dias é "parou há pouco". */
export const DIAS_PARADA_RECENTE = 7;

/** Linhas desenhadas por fila. O total e os contadores são sempre da fila inteira. */
export const LIMITE_LINHAS = 200;

/** Janela do contador de contatos. */
export const DIAS_CONTATOS = 7;

export type FilaAcaoKey =
  | "PAROU_RECENTE"
  | "PARADA_LONGA"
  | "ERRO_INVERSOR"
  | "BAIXA_GERACAO"
  | "OUTROS_ALERTAS"
  | "NUNCA_COMUNICOU"
  | "ACESSO_PORTAL"
  | "SEM_CLIENTE";

/** "novo" = ninguém tocou ainda; "andamento" = já houve contato ou a etapa avançou. */
export type EstadoItem = "novo" | "andamento";

export interface ItemAcao {
  id: string;
  titulo: string;
  detalhe: string | null;
  estado: EstadoItem;
  /** Data da linha, em dd/mm/aaaa — o significado está em `FilaAcao.rotuloData`. */
  data: string | null;
  telefone: string | null;
  /** "12/10/2026 · WhatsApp · Sem resposta" — o contato mais recente, se houve. */
  ultimoContato: string | null;
  href: string;
  /** A quem o contato fica ligado. Ausente = a linha não aceita registro de contato. */
  alvo: { clientId?: string; proprietarioId?: string; alertaId?: string } | null;
}

export interface FilaAcao {
  key: FilaAcaoKey;
  titulo: string;
  /** O que fazer com isto, em uma linha — quem abre a tela é gente nova. */
  instrucao: string;
  /** Roteiro de atendimento, na ordem. */
  passos: string[];
  total: number;
  novos: number;
  /** Sobre o que a conta foi feita — KPI sem denominador esconde buraco. */
  base: string;
  aviso: string | null;
  rotuloData: string;
  /** Até `LIMITE_LINHAS` itens, já na ordem de trabalho. */
  itens: ItemAcao[];
}

export interface AcoesDiarias {
  hoje: string; // dd/mm/aaaa
  indicadores: {
    usinasAtivas: number;
    usinasComunicando: number;
    usinasParadas: number;
    usinasSemDados: number;
    alertasAbertos: number;
    alertasSemTratamento: number;
    clientesCadastrados: number;
    clientesComLogin: number;
    clientesComAvisoNoCelular: number;
    usinasSemCliente: number;
    contatosHoje: number;
    contatosJanela: number;
  };
  filas: FilaAcao[];
}

const TIPOS_PARADA = ["OFFLINE"];
const TIPOS_ERRO_INVERSOR = ["ERRO_INVERSOR", "TEMPERATURA_INVERSOR"];
const ABERTOS = ["ABERTO", "EM_ANDAMENTO"];

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}

function diaBR(instante: Date | null | undefined): string | null {
  return instante ? formatDateOnlyBR(dayInBrasil(instante)) : null;
}

function resumoContato(c: { createdAt: Date; canal: string; resultado: string }): string {
  const canal = CANAL_CONTATO_LABEL[c.canal as CanalContato] ?? c.canal;
  const resultado = RESULTADO_CONTATO_LABEL[c.resultado as ResultadoContato] ?? c.resultado;
  return `${diaBR(c.createdAt)} · ${canal} · ${resultado}`;
}

function montarFila(
  meta: Pick<FilaAcao, "key" | "titulo" | "instrucao" | "passos" | "base" | "rotuloData"> & {
    aviso?: string | null;
  },
  itens: ItemAcao[],
): FilaAcao {
  const ocultos = itens.length - LIMITE_LINHAS;
  const avisos = [
    meta.aviso ?? null,
    ocultos > 0
      ? `Mostrando as primeiras ${LIMITE_LINHAS} de ${itens.length.toLocaleString("pt-BR")}. As demais aparecem conforme estas saem da fila.`
      : null,
  ].filter(Boolean);
  return {
    key: meta.key,
    titulo: meta.titulo,
    instrucao: meta.instrucao,
    passos: meta.passos,
    total: itens.length,
    novos: itens.filter((i) => i.estado === "novo").length,
    base: meta.base,
    aviso: avisos.length > 0 ? avisos.join(" ") : null,
    rotuloData: meta.rotuloData,
    itens: itens.slice(0, LIMITE_LINHAS),
  };
}

export async function getAcoesDiarias(): Promise<AcoesDiarias> {
  const hoje = todayInBrasil();
  const inicioHoje = startOfDayInstant(hoje);
  const inicioJanela = startOfDayInstant(addDaysOnly(hoje, -(DIAS_CONTATOS - 1)));
  const corteRecente = new Date(Date.now() - DIAS_PARADA_RECENTE * 86_400_000);

  const [porStatus, alertas, proprietarios, usinasSemCliente, contatosHoje, contatosJanela] =
    await Promise.all([
      prisma.brasilSolarClient.groupBy({
        by: ["statusMonitoramento"],
        where: { active: true },
        _count: true,
      }),
      prisma.monitoringAlert.findMany({
        where: { status: { in: ABERTOS }, client: { active: true } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          tipo: true,
          severidade: true,
          titulo: true,
          status: true,
          createdAt: true,
          codigoErroFabricante: true,
          client: {
            select: {
              id: true,
              nome: true,
              cidade: true,
              telefone: true,
              plataformaMonitoramento: true,
              ultimaLeitura: true,
              createdAt: true,
              proprietario: { select: { id: true, nome: true, telefone: true } },
            },
          },
        },
      }),
      // Só quem tem usina ativa: cliente sem usina não tem o que acompanhar.
      prisma.brasilSolarProprietario.findMany({
        where: { active: true, plantas: { some: { active: true } } },
        orderBy: { nome: "asc" },
        select: {
          id: true,
          nome: true,
          email: true,
          telefone: true,
          clerkUserId: true,
          acesso: { select: { status: true, modalidade: true, conviteEnviadoEm: true } },
          _count: { select: { pushSubscriptions: true, plantas: { where: { active: true } } } },
        },
      }),
      prisma.brasilSolarClient.findMany({
        where: { active: true, proprietarioId: null },
        orderBy: { nome: "asc" },
        select: {
          id: true,
          nome: true,
          cidade: true,
          telefone: true,
          plataformaMonitoramento: true,
          statusMonitoramento: true,
        },
      }),
      prisma.brasilSolarContato.count({ where: { createdAt: { gte: inicioHoje } } }),
      prisma.brasilSolarContato.count({ where: { createdAt: { gte: inicioJanela } } }),
    ]);

  const semLogin = proprietarios.filter((p) => !p.clerkUserId);

  // Contato mais recente por alerta e por cliente — só dos que estão em fila.
  const contatos = await prisma.brasilSolarContato.findMany({
    where: {
      OR: [
        { alertaId: { in: alertas.map((a) => a.id) } },
        { proprietarioId: { in: semLogin.map((p) => p.id) }, alertaId: null },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { alertaId: true, proprietarioId: true, canal: true, resultado: true, createdAt: true },
  });
  const contatoDoAlerta = new Map<string, string>();
  const contatoDoCliente = new Map<string, string>();
  for (const c of contatos) {
    if (c.alertaId) {
      if (!contatoDoAlerta.has(c.alertaId)) contatoDoAlerta.set(c.alertaId, resumoContato(c));
    } else if (c.proprietarioId && !contatoDoCliente.has(c.proprietarioId)) {
      contatoDoCliente.set(c.proprietarioId, resumoContato(c));
    }
  }

  // ─── Filas de usina: uma linha por alerta aberto ───
  type Alerta = (typeof alertas)[number];
  const itemDoAlerta = (a: Alerta, data: Date | null, detalheExtra?: string | null): ItemAcao => {
    const ultimoContato = contatoDoAlerta.get(a.id) ?? null;
    const dono = a.client.proprietario;
    return {
      id: a.id,
      titulo: a.client.nome,
      detalhe:
        [
          dono && dono.nome !== a.client.nome ? `Cliente: ${dono.nome}` : null,
          a.client.cidade,
          a.client.plataformaMonitoramento,
          detalheExtra,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      estado: a.status === "EM_ANDAMENTO" || ultimoContato ? "andamento" : "novo",
      data: diaBR(data),
      telefone: dono?.telefone ?? a.client.telefone,
      ultimoContato,
      href: `/admin/brasil-solar/${a.client.id}`,
      alvo: { clientId: a.client.id, proprietarioId: dono?.id, alertaId: a.id },
    };
  };

  const paradas = alertas.filter((a) => TIPOS_PARADA.includes(a.tipo));
  const paradasRecentes = paradas.filter((a) => a.createdAt >= corteRecente);
  const paradasLongas = paradas.filter((a) => a.createdAt < corteRecente);
  const errosInversor = alertas.filter((a) => TIPOS_ERRO_INVERSOR.includes(a.tipo));
  const baixaGeracao = alertas.filter((a) => a.tipo === "BAIXA_GERACAO");
  const nuncaComunicou = alertas.filter((a) => a.tipo === "NUNCA_COMUNICOU");
  // Rede de segurança: tipo de alerta novo cai aqui em vez de sumir da tela.
  const classificados = new Set([
    ...TIPOS_PARADA,
    ...TIPOS_ERRO_INVERSOR,
    "BAIXA_GERACAO",
    "NUNCA_COMUNICOU",
  ]);
  const outros = alertas.filter((a) => !classificados.has(a.tipo));

  const usinasAtivas = porStatus.reduce((s, r) => s + r._count, 0);
  const contar = (status: string) =>
    porStatus.find((r) => r.statusMonitoramento === status)?._count ?? 0;
  const baseUsinas = `${usinasAtivas.toLocaleString("pt-BR")} usinas ativas monitoradas`;

  const filas: FilaAcao[] = [
    montarFila(
      {
        key: "PAROU_RECENTE",
        titulo: "Parou há pouco",
        instrucao: `Usina que gerava e parou de enviar dados nos últimos ${DIAS_PARADA_RECENTE} dias. É onde uma ligação mais resolve.`,
        passos: [
          "Abrir a usina e conferir a última leitura e a curva do dia: parou de vez ou só falhou a comunicação?",
          "Ligar ou mandar WhatsApp: houve queda de luz, troca de internet ou de senha do Wi-Fi? O disjuntor do inversor está ligado?",
          "Pedir uma foto do visor do inversor. Se mostrar código de erro, anotar no contato.",
          "Não resolveu por telefone: registrar como encaminhado para visita técnica.",
        ],
        base: baseUsinas,
        rotuloData: "Última leitura",
      },
      paradasRecentes.map((a) => itemDoAlerta(a, a.client.ultimaLeitura ?? a.createdAt)),
    ),
    montarFila(
      {
        key: "PARADA_LONGA",
        titulo: "Parada há mais tempo",
        instrucao: `Usina sem enviar dados há mais de ${DIAS_PARADA_RECENTE} dias. Confirmar com o cliente se o sistema segue em uso.`,
        passos: [
          "Confirmar com o cliente se a usina está gerando no visor do inversor: muitas vezes só a internet caiu.",
          "Gerando sem comunicar: orientar a reconectar o Wi-Fi do inversor.",
          "Sem gerar: registrar como encaminhado para visita técnica.",
          "Cliente desligou, vendeu o imóvel ou não é mais atendido: anotar no contato para a usina ser desativada no cadastro.",
        ],
        base: baseUsinas,
        rotuloData: "Última leitura",
      },
      paradasLongas.map((a) => itemDoAlerta(a, a.client.ultimaLeitura ?? a.createdAt)),
    ),
    montarFila(
      {
        key: "ERRO_INVERSOR",
        titulo: "Erro ou temperatura do inversor",
        instrucao: "O inversor reportou falha. Normalmente pede visita técnica.",
        passos: [
          "Abrir a usina e ver o código do erro e a ação sugerida para ele.",
          "Avisar o cliente do que foi detectado e do próximo passo.",
          "Registrar o contato e encaminhar para visita técnica quando a ação sugerida for ir a campo.",
        ],
        base: baseUsinas,
        rotuloData: "Alerta aberto em",
      },
      errosInversor.map((a) =>
        itemDoAlerta(
          a,
          a.createdAt,
          a.codigoErroFabricante ? `Código ${a.codigoErroFabricante}` : a.titulo,
        ),
      ),
    ),
    montarFila(
      {
        key: "BAIXA_GERACAO",
        titulo: "Geração abaixo do esperado",
        instrucao: "A usina comunica, mas gera menos que o previsto para ela.",
        passos: [
          "Abrir a usina e comparar a curva dos últimos dias com a de usinas vizinhas: se todas caíram, foi o tempo.",
          "Só esta caiu: perguntar ao cliente sobre sombra nova, sujeira nos módulos ou obra no telhado.",
          "Persistindo sem causa aparente: encaminhar para visita técnica.",
        ],
        base: baseUsinas,
        rotuloData: "Alerta aberto em",
      },
      baixaGeracao.map((a) => itemDoAlerta(a, a.createdAt, a.titulo)),
    ),
    montarFila(
      {
        key: "OUTROS_ALERTAS",
        titulo: "Outros alertas",
        instrucao: "Tensão ou frequência da rede fora do padrão e plano de monitoramento vencendo.",
        passos: [
          "Abrir a usina e ler a descrição do alerta.",
          "Tensão ou frequência: orientar o cliente a abrir chamado na concessionária.",
          "Plano vencendo ou vencido: contatar o cliente para a renovação.",
        ],
        base: baseUsinas,
        rotuloData: "Alerta aberto em",
      },
      outros.map((a) => itemDoAlerta(a, a.createdAt, a.titulo)),
    ),
    montarFila(
      {
        key: "NUNCA_COMUNICOU",
        titulo: "Nunca comunicou",
        instrucao: "Usina cadastrada que nunca entregou geração. Quase sempre é cadastro ou vínculo no portal do fabricante, não defeito.",
        passos: [
          "Abrir a usina e conferir plataforma, login e identificação da planta no portal do fabricante.",
          "Entrar no portal do fabricante: a planta existe lá e está na nossa conta?",
          "Planta existe e está sem dados: o inversor nunca foi conectado à internet. Contatar o cliente para configurar o Wi-Fi.",
          "Cadastro duplicado ou de teste: anotar no contato para a usina ser desativada.",
        ],
        base: baseUsinas,
        rotuloData: "Cadastrada em",
      },
      nuncaComunicou.map((a) => itemDoAlerta(a, a.client.createdAt)),
    ),
    montarFila(
      {
        key: "ACESSO_PORTAL",
        titulo: "Acesso ao portal do cliente",
        instrucao: "Cliente cadastrado que ainda não entra no nosso portal. É a fila da saída do SolarZ.",
        passos: [
          "Abrir o cliente e conferir e-mail e telefone: o convite de cadastro vai por e-mail.",
          "No botão “Enviar convite”, emitir o acesso na modalidade combinada com o cliente (pago ou cortesia).",
          "Com o acesso ativo, enviar o cadastro pelo mesmo botão e avisar o cliente por WhatsApp para ele olhar a caixa de entrada.",
          "Depois do primeiro login, orientar a instalar o aplicativo na tela inicial do celular e ligar os avisos.",
        ],
        base: `${plural(proprietarios.length, "cliente cadastrado", "clientes cadastrados")} com usina ativa`,
        rotuloData: "Convite enviado em",
        aviso:
          semLogin.some((p) => !p.email)
            ? `${plural(semLogin.filter((p) => !p.email).length, "cliente está", "clientes estão")} sem e-mail: sem ele não há como enviar o convite.`
            : null,
      },
      semLogin.map((p) => {
        const ultimoContato = contatoDoCliente.get(p.id) ?? null;
        const etapa = !p.acesso
          ? "Acesso ainda não emitido"
          : p.acesso.status === "AGUARDANDO_PAGAMENTO"
            ? "Aguardando o pagamento do plano"
            : p.acesso.status !== "ATIVO"
              ? `Acesso ${p.acesso.status.toLowerCase()}`
              : p.acesso.conviteEnviadoEm
                ? "Convite enviado, cliente ainda não se cadastrou"
                : "Acesso ativo: falta enviar o convite de cadastro";
        return {
          id: p.id,
          titulo: p.nome,
          detalhe: [
            etapa,
            plural(p._count.plantas, "usina", "usinas"),
            p.email ? null : "sem e-mail",
          ]
            .filter(Boolean)
            .join(" · "),
          estado: p.acesso || ultimoContato ? "andamento" : "novo",
          data: diaBR(p.acesso?.conviteEnviadoEm),
          telefone: p.telefone,
          ultimoContato,
          href: `/admin/brasil-solar/proprietarios/${p.id}`,
          alvo: { proprietarioId: p.id },
        } satisfies ItemAcao;
      }),
    ),
    montarFila(
      {
        key: "SEM_CLIENTE",
        titulo: "Usina sem cliente cadastrado",
        instrucao: "Usina monitorada sem cliente vinculado: sem o cadastro não há telefone para ligar nem como emitir o acesso ao portal.",
        passos: [
          "Localizar o dono da usina (cadastro do SolarZ, CRM ou portal do fabricante).",
          "Cadastrar o cliente em Clientes Brasil Solar com nome, CPF/CNPJ, e-mail e telefone.",
          "Vincular a usina ao cliente. Ela sai desta fila e o cliente entra na de acesso ao portal.",
        ],
        base: baseUsinas,
        rotuloData: "—",
      },
      usinasSemCliente.map((u) => ({
        id: u.id,
        titulo: u.nome,
        detalhe:
          [u.cidade, u.plataformaMonitoramento, u.statusMonitoramento === "ONLINE" ? null : "sem comunicar"]
            .filter(Boolean)
            .join(" · ") || null,
        estado: "novo",
        data: null,
        telefone: u.telefone,
        ultimoContato: null,
        href: `/admin/brasil-solar/${u.id}`,
        alvo: null,
      })),
    ),
  ];

  const filasDeAlerta = filas.filter((f) => f.key !== "ACESSO_PORTAL" && f.key !== "SEM_CLIENTE");

  return {
    hoje: formatDateOnlyBR(hoje),
    indicadores: {
      usinasAtivas,
      // ALERTA = comunicando com algum alerta aberto; segue sendo usina no ar.
      usinasComunicando: contar("ONLINE") + contar("ALERTA"),
      usinasParadas: contar("OFFLINE"),
      usinasSemDados: contar("SEM_DADOS"),
      alertasAbertos: alertas.length,
      alertasSemTratamento: filasDeAlerta.reduce((s, f) => s + f.novos, 0),
      clientesCadastrados: proprietarios.length,
      clientesComLogin: proprietarios.length - semLogin.length,
      clientesComAvisoNoCelular: proprietarios.filter((p) => p._count.pushSubscriptions > 0).length,
      usinasSemCliente: usinasSemCliente.length,
      contatosHoje,
      contatosJanela,
    },
    filas,
  };
}
