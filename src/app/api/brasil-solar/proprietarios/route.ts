import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { serializeObraObservacoes } from "@/lib/obra-meta";
import { parseDateOnly } from "@/lib/obra-calendario";
import { encrypt } from "@/lib/crypto";
import { normalizeCodigoUc, whereCodigoUc } from "@/lib/uc-codigo";
import { buscarIds } from "@/lib/busca-sql";
import { normalizeConcessionaria } from "@/lib/concessionarias";
import {
  avisosDaPropagacao,
  propagarCodigosDoProprietario,
} from "@/lib/codigo-uc-propagacao";
import {
  propagarCredencialParaBeneficiarias,
  resumoPropagacao,
} from "@/lib/credencial-beneficiarias";
import {
  TIPOS_TELHADO_VALIDOS,
  TIPOS_COM_ESTRUTURA,
  TIPOS_COM_DESCRICAO,
  PRAZO_MIN_COM_ESTRUTURA,
  rotuloTipoTelhado,
} from "@/lib/tipos-telhado";

const ESTRUTURA_DURACAO_DIAS = 3;
const LAG_ENTRE_TAREFAS = 15;

const EXECUTADO_POR_VALORES = new Set(["BRASIL_SOLAR", "TERCEIRO"]);

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// GET /api/brasil-solar/proprietarios - Lista paginada de proprietarios
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "50")));
  const search = searchParams.get("search") || "";
  const orderBy = searchParams.get("orderBy") || "nome";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";
  const all = searchParams.get("all") === "true";

  const where: Record<string, unknown> = { active: true };

  if (search) {
    // Acento/caixa/pontuacao-insensivel (ver src/lib/busca-sql.ts).
    const ids = await buscarIds({
      tabela: "brasil_solar_proprietarios",
      colunas: ["nome", "cpf_cnpj", "email", "telefone", "cidade", "codigo_uc", "codigo_uc_antigo"],
      termo: search,
    });
    where.id = { in: ids ?? [] };
  }

  // Modo "all" para o combobox de selecao (retorna id + nome apenas)
  if (all) {
    const proprietarios = await prisma.brasilSolarProprietario.findMany({
      where,
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cpfCnpj: true },
    });
    return NextResponse.json({ proprietarios });
  }

  const [proprietarios, total] = await Promise.all([
    prisma.brasilSolarProprietario.findMany({
      where,
      orderBy: { [orderBy]: order },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        nome: true,
        cpfCnpj: true,
        email: true,
        telefone: true,
        cidade: true,
        uf: true,
        createdAt: true,
        // Tag da marca do inversor (ver src/lib/marca-inversor.ts): a declarada
        // manda, a plataforma das usinas entra como derivação.
        inversorMarca: true,
        executadoPor: true,
        empresaTerceira: { select: { id: true, nome: true } },
        plantas: { select: { plataformaMonitoramento: true } },
        _count: {
          select: { plantas: true },
        },
      },
    }),
    prisma.brasilSolarProprietario.count({ where }),
  ]);

  // Um proprietário pode ter várias usinas; a tag mostra uma marca só. Pega a
  // primeira plataforma preenchida — na prática são todas iguais, e quando não
  // são, a marca declarada (que ganha da plataforma) é quem resolve.
  const proprietariosComTag = proprietarios.map((p) => {
    const { plantas, ...resto } = p as typeof p & {
      plantas: { plataformaMonitoramento: string | null }[];
    };
    return {
      ...resto,
      plataformaMonitoramento:
        plantas.find((u) => (u.plataformaMonitoramento ?? "").trim())
          ?.plataformaMonitoramento ?? null,
    };
  });

  return NextResponse.json({
    proprietarios: proprietariosComTag,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// POST /api/brasil-solar/proprietarios - Criar proprietario
// Aceita opcionalmente body.planta {...} com os dados técnicos extraídos
// do Anexo F (latitude, longitude, módulos, inversor, UC, concessionária).
// Esses campos ficam no próprio Proprietário — a usina em si é sincronizada
// por API (Fronius/SolarEdge/...) e vinculada manualmente depois.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  // executadoPor define se Brasil Solar executa a obra (fluxo completo,
  // com Obra+tarefas auto) ou se é só monitoramento de usina de terceiro.
  const executadoPor =
    typeof body.executadoPor === "string" ? body.executadoPor.trim() : "BRASIL_SOLAR";
  if (!EXECUTADO_POR_VALORES.has(executadoPor)) {
    return NextResponse.json(
      { error: "Campo 'executadoPor' inválido (use BRASIL_SOLAR ou TERCEIRO)" },
      { status: 400 }
    );
  }
  const isTerceiro = executadoPor === "TERCEIRO";

  // Qual empresa executou, quando não foi a Brasil Solar. Só vale pra TERCEIRO —
  // se vier num cadastro BRASIL_SOLAR é ignorado, senão a ficha guarda uma
  // empresa executora que contradiz o próprio executadoPor.
  let empresaTerceiraId: string | null = null;
  if (isTerceiro) {
    const id = typeof body.empresaTerceiraId === "string" ? body.empresaTerceiraId.trim() : "";
    if (id) {
      // Valida a FK aqui pra devolver mensagem útil em vez de P2003 cru.
      const empresa = await prisma.empresaTerceira.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!empresa) {
        return NextResponse.json(
          { error: "Empresa executora não encontrada — recarregue a lista e escolha de novo" },
          { status: 400 },
        );
      }
      empresaTerceiraId = empresa.id;
    }
  }

  // Obra da Brasil Solar já executada antes do cadastro: não há cronograma a
  // agendar, então pula Obra e tarefas igual ao TERCEIRO. Só faz sentido
  // quando a Brasil Solar é a executora.
  const obraJaExecutada = body.obraJaExecutada === true && !isTerceiro;

  // Quando não há obra a agendar (TERCEIRO ou obra já executada), os campos
  // de telhado/data/prazo existem só para montar o cronograma — ficam nulos e
  // o fluxo automático de Obra/tarefas é pulado mais abaixo.
  const semObraAAgendar = isTerceiro || obraJaExecutada;

  // ---- Validação dos campos do contrato/obra ---------------------------
  let tipoTelhado: string | null = null;
  let tipoTelhadoOutro: string | null = null;
  let dataPagamento: Date | null = null;
  let prazoContratoDias: number | null = null;

  if (!semObraAAgendar) {
    const t = typeof body.tipoTelhado === "string" ? body.tipoTelhado.trim() : "";
    if (!t || !TIPOS_TELHADO_VALIDOS.has(t)) {
      return NextResponse.json(
        { error: "Tipo de estrutura inválido ou ausente" },
        { status: 400 }
      );
    }

    if (TIPOS_COM_DESCRICAO.has(t)) {
      const v =
        typeof body.tipoTelhadoOutro === "string" ? body.tipoTelhadoOutro.trim() : "";
      if (!v) {
        return NextResponse.json(
          { error: "Descreva a estrutura personalizada" },
          { status: 400 }
        );
      }
      tipoTelhadoOutro = v;
    }

    const dp = parseDateOnly(
      typeof body.dataPagamento === "string" ? body.dataPagamento : null
    );
    if (!dp) {
      return NextResponse.json(
        { error: "Data de pagamento inválida ou ausente" },
        { status: 400 }
      );
    }

    const pcd = toInt(body.prazoContratoDias);
    if (!pcd || pcd <= 0) {
      return NextResponse.json(
        { error: "Prazo do contrato deve ser maior que zero" },
        { status: 400 }
      );
    }
    if (TIPOS_COM_ESTRUTURA.has(t) && pcd < PRAZO_MIN_COM_ESTRUTURA) {
      return NextResponse.json(
        {
          error: `Para ${rotuloTipoTelhado(t)} o prazo precisa ser de no mínimo ${PRAZO_MIN_COM_ESTRUTURA} dias (3d estrutura + 15d intervalo + instalação)`,
        },
        { status: 400 }
      );
    }

    tipoTelhado = t;
    dataPagamento = dp;
    prazoContratoDias = pcd;
  }
  // ----------------------------------------------------------------------

  const planta = body.planta && typeof body.planta === "object" ? body.planta : {};

  // codigoUc e concessionaria podem vir direto no body (form de cadastro manual)
  // ou dentro de `planta` (prefill do Anexo F). Direto no body tem precedência.
  const codigoUcInput =
    normalizeCodigoUc(
      (typeof body.codigoUc === "string" && body.codigoUc.trim()) ||
      (typeof planta.codigoUc === "string" && planta.codigoUc.trim()) ||
      null
    ) ?? null;
  const codigoUcAntigoInput =
    normalizeCodigoUc(
      (typeof body.codigoUcAntigo === "string" && body.codigoUcAntigo.trim()) ||
      (typeof planta.codigoUcAntigo === "string" && planta.codigoUcAntigo.trim()) ||
      null
    ) ?? null;
  // Normaliza para a lista canônica: o PDF do projeto e planilhas de import
  // trazem grafias antigas ("RGE", "NOVA PALMA") que precisam casar com a lista.
  const concessionariaBruta =
    (typeof body.concessionaria === "string" && body.concessionaria.trim()) ||
    (typeof planta.concessionaria === "string" && planta.concessionaria.trim()) ||
    null;
  const concessionariaInput =
    normalizeConcessionaria(concessionariaBruta) ?? concessionariaBruta;

  const proprietario = await prisma.brasilSolarProprietario.create({
    data: {
      nome: body.nome.trim(),
      cpfCnpj: body.cpfCnpj?.trim() || null,
      email: body.email?.trim() || null,
      telefone: body.telefone?.trim() || null,
      endereco: body.endereco?.trim() || null,
      cidade: body.cidade?.trim() || null,
      uf: body.uf?.trim() || null,
      observacoes: body.observacoes?.trim() || null,
      executadoPor,
      empresaTerceiraId,
      obraJaExecutada,
      tipoTelhado,
      tipoTelhadoOutro,
      dataPagamento,
      prazoContratoDias,
      latitude: toFloat(planta.latitude),
      longitude: toFloat(planta.longitude),
      codigoUc: codigoUcInput,
      codigoUcAntigo: codigoUcAntigoInput,
      concessionaria: concessionariaInput,
      potenciaInstalada: toFloat(planta.potenciaInstalada),
      modulosMarca: planta.modulosMarca?.toString().trim() || null,
      modulosModelo: planta.modulosModelo?.toString().trim() || null,
      modulosQuantidade: toInt(planta.modulosQuantidade),
      inversorMarca: planta.inversorMarca?.toString().trim() || null,
      inversorModelo: planta.inversorModelo?.toString().trim() || null,
      inversorQuantidade: toInt(planta.inversorQuantidade),
      inversorPotencia: toFloat(planta.inversorPotencia),
      numeroFases: planta.numeroFases?.toString().trim() || null,
      tipoAtendimento: planta.tipoAtendimento?.toString().trim() || null,
    },
  });

  // Avisos NÃO fatais: o que o cadastro tentou fazer e não conseguiu. Vão na
  // resposta para a tela mostrar ao operador.
  //
  // ⚠️ Por que isso existe: estas etapas ficam em try/catch para não derrubar o
  // cadastro do proprietário — mas engolir o erro fazia o operador digitar
  // email/senha do portal e o servidor descartar tudo em silêncio, respondendo
  // "Proprietário criado". Só se descobria dias depois, no botão "Sincronizar
  // faturas antigas", como "Nenhuma UC com credencial" (GRÁFICA JACUI, 05/08/26).
  const avisos: string[] = [];

  // Cria automaticamente a ConsumerUnit quando o código UC foi informado.
  // Não falha o cadastro do proprietário se a UC não puder ser criada
  // (ex.: código já em uso).
  let consumerUnitId: string | null = null;
  let motivoUcFalhou: string | null = null;
  if (codigoUcInput) {
    try {
      // Casa também pelo código antigo — ver `whereCodigoUc`. Com `findUnique`
      // no código exato, cadastrar um proprietário com o código pré-migração
      // criava uma UC duplicada da que já existia com o código novo.
      //
      // Procura pelos DOIS códigos digitados, não só pelo novo: a UC pode estar
      // cadastrada apenas com o antigo, e casar por um lado só recriava a mesma
      // UC em duplicata.
      const existing = await prisma.consumerUnit.findFirst({
        where: {
          OR: [
            whereCodigoUc(codigoUcInput),
            ...(codigoUcAntigoInput ? [whereCodigoUc(codigoUcAntigoInput)] : []),
          ],
        },
      });
      if (existing) {
        consumerUnitId = existing.id;
      } else {
        const created = await prisma.consumerUnit.create({
          data: {
            nome: proprietario.nome,
            codigoUc: codigoUcInput,
            codigoUcAntigo: codigoUcAntigoInput,
            cpfCnpj: proprietario.cpfCnpj,
            distribuidora: concessionariaInput,
            cidade: proprietario.cidade,
            origem: "BRASIL_SOLAR_TITULAR",
          },
        });
        consumerUnitId = created.id;
      }
      // A UC recém-criada já nasce com os dois códigos; a que JÁ existia, não —
      // e era mais um caminho para o "antigo" ficar só na ficha do proprietário.
      avisos.push(...avisosDaPropagacao(await propagarCodigosDoProprietario(proprietario.id)));
    } catch (e) {
      motivoUcFalhou = e instanceof Error ? e.message : String(e);
      console.error("[POST /brasil-solar/proprietarios] auto-UC falhou:", e);
      avisos.push(
        `A Unidade Consumidora ${codigoUcInput} não pôde ser criada automaticamente: ${motivoUcFalhou}`,
      );
    }
  }

  // Cria a credencial de acesso à concessionária (CpflCredential, usada também
  // para RGE) quando o bloco `portal` veio no body e a UC já existe. Senha é
  // sempre criptografada (AES-GCM via encrypt()). Falha aqui não derruba o
  // cadastro do proprietário/UC.
  const portal =
    body.portal && typeof body.portal === "object" ? body.portal : null;
  const AVISO_CADASTRAR_DEPOIS =
    'Cadastre o acesso no card "Status e acesso à concessionária", na tela do proprietário.';

  if (portal && !consumerUnitId) {
    // O operador digitou email/senha do portal e não há UC para pendurá-los.
    // ANTES o bloco inteiro era pulado por um `if (consumerUnitId && portal)`
    // e a credencial sumia sem rastro. Agora o cadastro conclui, mas dizendo
    // exatamente o que não foi salvo e por quê.
    const motivo = motivoUcFalhou
      ? `a UC não pôde ser criada (${motivoUcFalhou})`
      : "o código da UC não foi informado";
    avisos.push(
      `O acesso ao portal da concessionária NÃO foi salvo porque ${motivo}. ${AVISO_CADASTRAR_DEPOIS}`,
    );
  } else if (portal && consumerUnitId) {
    try {
      // A concessionária da credencial é a mesma dos dados técnicos — a tela não
      // pergunta duas vezes. `portal.distribuidora` não é mais lido do body.
      const distribuidora = normalizeConcessionaria(concessionariaInput) ?? "RGE/CPFL";
      const email = typeof portal.email === "string" ? portal.email.trim() : "";
      const senha = typeof portal.senha === "string" ? portal.senha : "";
      // Pode chegar pontuado da tela; o portal/Infosimples é chaveado por dígitos.
      const instalacao =
        normalizeCodigoUc(
          (typeof portal.instalacao === "string" && portal.instalacao.trim()) || null,
        ) ||
        codigoUcInput ||
        "";

      if (email && senha && instalacao) {
        const existingCred = await prisma.cpflCredential.findUnique({
          where: { consumerUnitId },
        });
        if (!existingCred) {
          await prisma.cpflCredential.create({
            data: {
              consumerUnitId,
              emailCpfl: email,
              senhaCpfl: encrypt(senha),
              instalacao,
              distribuidora,
              statusSync: "PENDING",
            },
          });
        }
        // Beneficiárias já cadastradas herdam o acesso agora. No cadastro novo
        // ainda não há nenhuma, mas o mesmo POST atende reedição — e é aqui que
        // a ordem "UCs primeiro, senha depois" deixava de propagar.
        const propagacao = await propagarCredencialParaBeneficiarias(consumerUnitId);
        const resumo = resumoPropagacao(propagacao);
        if (resumo) avisos.push(`Acesso à concessionária: ${resumo}.`);
      } else {
        // Faltou campo. A tela valida antes de enviar, então chegar aqui indica
        // payload de outra origem (import/API) — nunca silenciar.
        const faltando = [
          !email && "email",
          !senha && "senha",
          !instalacao && "instalação",
        ].filter(Boolean).join(", ");
        avisos.push(
          `O acesso ao portal NÃO foi salvo: faltou ${faltando}. ${AVISO_CADASTRAR_DEPOIS}`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[POST /brasil-solar/proprietarios] auto-credencial falhou:", e);
      avisos.push(`O acesso ao portal NÃO foi salvo: ${msg}. ${AVISO_CADASTRAR_DEPOIS}`);
    }
  }

  // Só gera Obra + tarefas quando há cronograma a acompanhar. Pulado quando o
  // sistema é de terceiro (Brasil Solar apenas monitora) ou quando a obra já
  // foi executada antes do cadastro.
  if (!semObraAAgendar && dataPagamento && prazoContratoDias && tipoTelhado) {
  try {
    const localParts = [proprietario.endereco, proprietario.cidade, proprietario.uf].filter(Boolean);
    const dataFimPrevista = addDays(dataPagamento, prazoContratoDias);

    const obra = await prisma.obra.create({
      data: {
        nome: `Instalação — ${proprietario.nome}`,
        descricao: "Obra gerada automaticamente a partir do cadastro do proprietário.",
        cliente: proprietario.nome,
        local: localParts.length ? localParts.join(", ") : null,
        status: "PLANEJAMENTO",
        aprovacao: "PENDENTE",
        brasilSolarProprietarioId: proprietario.id,
        dataInicioPrevista: dataPagamento,
        dataFimPrevista,
        observacoes: serializeObraObservacoes(
          {
            proprietarioId: proprietario.id,
            potenciaKwp: proprietario.potenciaInstalada ?? null,
            inversorPotenciaKw: proprietario.inversorPotencia ?? null,
          },
          null
        ),
      },
    });

    if (TIPOS_COM_ESTRUTURA.has(tipoTelhado)) {
      const estruturaLabel = rotuloTipoTelhado(tipoTelhado).toUpperCase();
      const tarefa1Fim = addDays(dataPagamento, ESTRUTURA_DURACAO_DIAS);
      const tarefa2Inicio = addDays(tarefa1Fim, LAG_ENTRE_TAREFAS);
      const tarefa2DuracaoDias = Math.max(
        1,
        prazoContratoDias - ESTRUTURA_DURACAO_DIAS - LAG_ENTRE_TAREFAS
      );
      const tarefa2Fim = addDays(tarefa2Inicio, tarefa2DuracaoDias);

      const tarefa1 = await prisma.obraTarefa.create({
        data: {
          obraId: obra.id,
          nome: `Execução da estrutura de fixação — ${estruturaLabel}`,
          ordem: 0,
          dataInicioPlan: dataPagamento,
          dataFimPlan: tarefa1Fim,
          duracaoDias: ESTRUTURA_DURACAO_DIAS,
          status: "NAO_INICIADA",
        },
      });

      const tarefa2 = await prisma.obraTarefa.create({
        data: {
          obraId: obra.id,
          nome: "Instalação do sistema fotovoltaico",
          ordem: 1,
          dataInicioPlan: tarefa2Inicio,
          dataFimPlan: tarefa2Fim,
          duracaoDias: tarefa2DuracaoDias,
          status: "NAO_INICIADA",
        },
      });

      await prisma.tarefaDependencia.create({
        data: {
          tarefaId: tarefa2.id,
          dependeDeId: tarefa1.id,
          tipo: "FS",
          lagDias: LAG_ENTRE_TAREFAS,
        },
      });
    }
  } catch (e) {
    // Não falhar a criação do proprietário se a obra/tarefas não puderem ser criadas.
    console.error("[POST /brasil-solar/proprietarios] auto-obra falhou:", e);
    avisos.push(
      `A obra e as tarefas do cronograma não foram criadas: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  }

  // `avisos` só aparece quando algo ficou pelo caminho — a tela usa a presença
  // dele para trocar o "Proprietário criado" por um alerta do que falta fazer.
  return NextResponse.json(
    avisos.length ? { ...proprietario, avisos } : proprietario,
    { status: 201 },
  );
}

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
