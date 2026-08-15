import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { normalizeCodigoUc } from "@/lib/uc-codigo";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plants = await prisma.plant.findMany({
    include: {
      investors: {
        include: {
          investor: { include: { user: { select: { name: true } } } },
        },
      },
      // Quantidade de UCs ligadas à usina = SÓ as que estão no rateio VIGENTE.
      // O campo ConsumerUnit.plantId é cadastro (a UC que o operador marcou no
      // formulário) e NÃO conta aqui: marcar a usina no form não prova que a
      // concessionária compensa créditos dela pra aquela UC — só o rateio
      // submetido e aceito prova. Usina sem rateio vigente = 0 UCs.
      // O plantId continua existindo e alimenta a tela de Rateios, onde é a
      // lista de candidatas pra montar o rateio.
      rateioVersions: {
        where: { status: "VIGENTE" },
        select: { items: { select: { consumerUnitId: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  // Deduplicado por UC: normalmente há uma única versão VIGENTE por usina, mas
  // contar por Set evita inflar caso apareça mais de uma.
  const comContagem = plants.map(({ rateioVersions, ...plant }) => ({
    ...plant,
    ucsRateioCount: new Set(
      rateioVersions.flatMap((v) => v.items.map((i) => i.consumerUnitId)),
    ).size,
  }));

  return NextResponse.json(comContagem);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.name) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const plant = await prisma.plant.create({
    data: {
      name: body.name,
      // Campos legados (mantidos)
      location: body.location || null,
      potenciaModulos: body.potenciaModulos ? Number(body.potenciaModulos) : null,
      potenciaInversor: body.potenciaInversor ? Number(body.potenciaInversor) : null,
      geracaoMediaMensal: body.geracaoMediaMensal ? Number(body.geracaoMediaMensal) : null,
      enquadramento: body.enquadramento || null,
      unidadeConsumidora: normalizeCodigoUc(body.unidadeConsumidora) || null,
      unidadeConsumidoraAntiga: normalizeCodigoUc(body.unidadeConsumidoraAntiga) || null,
      concessionaria: body.concessionaria || null,
      formatoLeitura: body.formatoLeitura || null,
      inversorMarca: body.inversorMarca || null,
      inversorModelo: body.inversorModelo || null,
      monitoramentoPlataforma: body.monitoramentoPlataforma || null,
      monitoramentoLogin: body.monitoramentoLogin || null,
      monitoramentoSenha: body.monitoramentoSenha || null,
      monitoramentoUrl: body.monitoramentoUrl || null,
      // Novos campos
      fonte: body.fonte || null,
      numeroUsina: body.numeroUsina || null,
      potenciaInstalada: body.potenciaInstalada ? Number(body.potenciaInstalada) : null,
      grupo: body.grupo || null,
      cpfCnpj: body.cpfCnpj || null,
      distribuidora: body.distribuidora || null,
      acesso: body.acesso || null,
      statusContrato: body.statusContrato || null,
      dataAssinaturaContrato: body.dataAssinaturaContrato
        ? new Date(body.dataAssinaturaContrato)
        : null,
      loginDistribuidora: body.loginDistribuidora || null,
      senhaDistribuidora: body.senhaDistribuidora || null,
      pagadorFaturaEnergia:
        body.pagadorFaturaEnergia === "INVESTIDORES" ? "INVESTIDORES" : "GESTORA",
      usinaDeInvestidor: body.usinaDeInvestidor === true,
    },
  });

  if (body.investorId) {
    // Regime Dommo: gestora fica com 100% do lucro — sem gestão fixa e sem
    // R$/kWh de contrato. Ver lib/usina-dommo.ts.
    const isUsinaDommo = body.isUsinaDommo === true;
    await prisma.investorPlant.create({
      data: {
        investorId: body.investorId,
        plantId: plant.id,
        sharePercent: body.sharePercent ? Number(body.sharePercent) : 100,
        valorKwhContrato:
          isUsinaDommo || !body.valorKwhContrato ? null : Number(body.valorKwhContrato),
        gestaoFixaContrato:
          isUsinaDommo || !body.gestaoFixaContrato ? null : Number(body.gestaoFixaContrato),
        isUsinaDommo,
      },
    });
  }

  return NextResponse.json(plant, { status: 201 });
}
