import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { normalizeCodigoUc } from "@/lib/uc-codigo";
import { isAdminRole } from "@/lib/roles";
import { avaliarExclusaoUsina } from "@/lib/plant-exclusao";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plant = await prisma.plant.findUnique({
    where: { id },
    include: {
      investors: {
        include: {
          investor: { include: { user: { select: { id: true, name: true } } } },
        },
      },
      consumerUnits: {
        select: { id: true, nome: true, codigoUc: true, consumoMedio: true, statusContrato: true },
      },
      // Consumidores que RECEBEM os créditos = só os do rateio VIGENTE, a mesma
      // regra do contador da lista (GET /api/plants). `ConsumerUnit.plantId` é
      // cadastro: marcar a usina no formulário não prova que a concessionária
      // compensa créditos dela para aquela UC — só o rateio aceito prova.
      // Usina sem rateio vigente = nenhum consumidor recebendo.
      rateioVersions: {
        where: { status: "VIGENTE" },
        orderBy: { vigenteAPartirDe: "desc" },
        select: {
          id: true,
          vigenteAPartirDe: true,
          aceitoEm: true,
          items: {
            select: {
              id: true,
              percentual: true,
              consumerUnit: {
                select: {
                  id: true,
                  nome: true,
                  codigoUc: true,
                  cidade: true,
                  consumoMedio: true,
                  active: true,
                  consumer: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
      // Auditoria do liga/desliga — a tela mostra a última e a lista completa.
      statusChanges: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!plant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { rateioVersions, ...plantSemRateios } = plant;

  // Normalmente há uma única versão VIGENTE por usina; se aparecer mais de uma,
  // vale a mais recente (ordenadas por vigência desc) e a UC não é contada duas
  // vezes — contagem e lista saem sempre do MESMO conjunto.
  const vistas = new Set<string>();
  const itensVigentes = rateioVersions
    .flatMap((v) =>
      v.items.map((item) => ({
        id: item.id,
        percentual: item.percentual,
        vigenteAPartirDe: v.vigenteAPartirDe,
        consumerUnit: item.consumerUnit,
      })),
    )
    .filter((item) => {
      if (vistas.has(item.consumerUnit.id)) return false;
      vistas.add(item.consumerUnit.id);
      return true;
    })
    .sort(
      (a, b) =>
        b.percentual - a.percentual ||
        (a.consumerUnit.consumer?.name ?? a.consumerUnit.nome).localeCompare(
          b.consumerUnit.consumer?.name ?? b.consumerUnit.nome,
          "pt-BR",
        ),
    );

  // Quem RECEBE crédito é quem tem fatia > 0. A própria UC geradora pode entrar
  // no rateio com 0% (a tela de Rateios permite, para a usina aparecer no
  // documento enviado à concessionária) — ela não é consumidora e por isso sai
  // da contagem. Vai separada, e não em silêncio: a tela avisa que existe.
  const consumidoresRateio = itensVigentes.filter((i) => i.percentual > 0);
  const ucsRateioSemCredito = itensVigentes
    .filter((i) => i.percentual <= 0)
    .map((i) => ({
      id: i.consumerUnit.id,
      nome: i.consumerUnit.nome,
      codigoUc: i.consumerUnit.codigoUc,
    }));

  return NextResponse.json({
    ...plantSemRateios,
    consumidoresRateio,
    ucsRateioSemCredito,
    ucsRateioCount: consumidoresRateio.length,
    rateioVigenteEm: rateioVersions[0]?.vigenteAPartirDe ?? null,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  await prisma.plant.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.location !== undefined && { location: body.location || null }),
      ...(body.potenciaModulos !== undefined && {
        potenciaModulos: body.potenciaModulos ? Number(body.potenciaModulos) : null,
      }),
      ...(body.potenciaInversor !== undefined && {
        potenciaInversor: body.potenciaInversor ? Number(body.potenciaInversor) : null,
      }),
      ...(body.geracaoMediaMensal !== undefined && {
        geracaoMediaMensal: body.geracaoMediaMensal ? Number(body.geracaoMediaMensal) : null,
      }),
      ...(body.enquadramento !== undefined && { enquadramento: body.enquadramento || null }),
      ...(body.unidadeConsumidora !== undefined && { unidadeConsumidora: normalizeCodigoUc(body.unidadeConsumidora) || null }),
      ...(body.unidadeConsumidoraAntiga !== undefined && { unidadeConsumidoraAntiga: normalizeCodigoUc(body.unidadeConsumidoraAntiga) || null }),
      ...(body.concessionaria !== undefined && { concessionaria: body.concessionaria || null }),
      ...(body.formatoLeitura !== undefined && { formatoLeitura: body.formatoLeitura || null }),
      ...(body.regraInstalacao !== undefined && { regraInstalacao: body.regraInstalacao || null }),
      // `active` NÃO entra aqui de propósito: ativar/desativar exige motivo e
      // grava auditoria, e isso mora em POST /api/plants/[id]/status. Aceitar o
      // campo neste PUT genérico abriria um caminho sem rastro.
      ...(body.inversorMarca !== undefined && { inversorMarca: body.inversorMarca || null }),
      ...(body.inversorModelo !== undefined && { inversorModelo: body.inversorModelo || null }),
      ...(body.monitoramentoPlataforma !== undefined && { monitoramentoPlataforma: body.monitoramentoPlataforma || null }),
      ...(body.monitoramentoLogin !== undefined && { monitoramentoLogin: body.monitoramentoLogin || null }),
      ...(body.monitoramentoSenha !== undefined && { monitoramentoSenha: body.monitoramentoSenha || null }),
      ...(body.monitoramentoUrl !== undefined && { monitoramentoUrl: body.monitoramentoUrl || null }),
      // Novos campos
      ...(body.fonte !== undefined && { fonte: body.fonte || null }),
      ...(body.numeroUsina !== undefined && { numeroUsina: body.numeroUsina || null }),
      ...(body.potenciaInstalada !== undefined && {
        potenciaInstalada: body.potenciaInstalada ? Number(body.potenciaInstalada) : null,
      }),
      ...(body.grupo !== undefined && { grupo: body.grupo || null }),
      ...(body.cpfCnpj !== undefined && { cpfCnpj: body.cpfCnpj || null }),
      ...(body.distribuidora !== undefined && { distribuidora: body.distribuidora || null }),
      ...(body.acesso !== undefined && { acesso: body.acesso || null }),
      // Texto legado do contrato. Nenhuma tela envia hoje — quem mantém ele em
      // sincronia com `active` é a rota /status.
      ...(body.statusContrato !== undefined && { statusContrato: body.statusContrato || null }),
      ...(body.dataAssinaturaContrato !== undefined && {
        dataAssinaturaContrato: body.dataAssinaturaContrato
          ? new Date(body.dataAssinaturaContrato)
          : null,
      }),
      ...(body.diaPagamentoInvestidor !== undefined && {
        diaPagamentoInvestidor: Math.min(
          28,
          Math.max(1, Number(body.diaPagamentoInvestidor) || 20)
        ),
      }),
      ...(body.loginDistribuidora !== undefined && { loginDistribuidora: body.loginDistribuidora || null }),
      ...(body.senhaDistribuidora !== undefined && { senhaDistribuidora: body.senhaDistribuidora || null }),
      ...(body.pagadorFaturaEnergia !== undefined && {
        pagadorFaturaEnergia:
          body.pagadorFaturaEnergia === "INVESTIDORES" ? "INVESTIDORES" : "GESTORA",
      }),
      ...(body.usinaDeInvestidor !== undefined && {
        usinaDeInvestidor: body.usinaDeInvestidor === true || body.usinaDeInvestidor === "true",
      }),
    },
  });

  return NextResponse.json({ success: true });
}

// Exclusão permanente da usina. Recusa (409) enquanto existir histórico
// financeiro/energético apontando pra ela — nesses casos o caminho é desativar
// (statusContrato/active), não apagar. Vínculos que o schema desfaz sozinho
// (investidores, UCs, documentos, credencial) só viram aviso no preview.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const impacto = await avaliarExclusaoUsina(id);
  if (!impacto) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (impacto.bloqueios.length > 0) {
    return NextResponse.json(
      {
        error: "Usina possui histórico e não pode ser excluída",
        details: impacto.bloqueios,
      },
      { status: 409 },
    );
  }

  try {
    await prisma.plant.delete({ where: { id } });
  } catch {
    // Rede de segurança: alguma relação nova sem cascade que o preview ainda
    // não conhece. Melhor 409 legível do que 500.
    return NextResponse.json(
      {
        error: "Usina possui vínculos e não pode ser excluída",
        details: ["Registros vinculados impedem a exclusão"],
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true });
}
