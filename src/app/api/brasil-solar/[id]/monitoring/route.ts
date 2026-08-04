import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { performanceRatioMesAtual } from "@/lib/geracao-esperada";

// POST /api/brasil-solar/[id]/monitoring - Registrar leitura de UM DIA a mao.
//
// Grava origem=MANUAL: nao veio da plataforma, e o proximo sync do dia
// sobrescreve. Pra lancar o TOTAL DE UM MES (caso comum quando a plataforma nao
// integra), use /api/brasil-solar/[id]/geracao-manual — ele rateia o total e
// registra auditoria em ManualGenerationEntry.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const data = new Date(body.data);
  data.setUTCHours(12, 0, 0, 0); // Normalizar para meio-dia UTC (fixa o dia independente do TZ do processo)

  const log = await prisma.monitoringLog.upsert({
    where: {
      clientId_data: { clientId: id, data },
    },
    update: {
      origem: "MANUAL",
      geracaoDiaria: parseFloat(body.geracaoDiaria),
      geracaoEsperada: body.geracaoEsperada ? parseFloat(body.geracaoEsperada) : undefined,
      picoMaximo: body.picoMaximo ? parseFloat(body.picoMaximo) : undefined,
      horasSol: body.horasSol ? parseFloat(body.horasSol) : undefined,
      irradiacao: body.irradiacao ? parseFloat(body.irradiacao) : undefined,
      temperatura: body.temperatura ? parseFloat(body.temperatura) : undefined,
    },
    create: {
      clientId: id,
      data,
      origem: "MANUAL",
      geracaoDiaria: parseFloat(body.geracaoDiaria),
      geracaoEsperada: body.geracaoEsperada ? parseFloat(body.geracaoEsperada) : null,
      picoMaximo: body.picoMaximo ? parseFloat(body.picoMaximo) : null,
      horasSol: body.horasSol ? parseFloat(body.horasSol) : null,
      irradiacao: body.irradiacao ? parseFloat(body.irradiacao) : null,
      temperatura: body.temperatura ? parseFloat(body.temperatura) : null,
    },
  });

  // Atualizar campos desnormalizados do cliente
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthLogs = await prisma.monitoringLog.aggregate({
    where: {
      clientId: id,
      data: { gte: startOfMonth },
    },
    _sum: { geracaoDiaria: true },
  });

  const client = await prisma.brasilSolarClient.findUnique({
    where: { id },
    select: { geracaoMediaEsperada: true, geracaoAnualEsperada: true },
  });

  const geracaoMes = monthLogs._sum.geracaoDiaria ?? 0;
  const pr = client
    ? performanceRatioMesAtual(client, geracaoMes, new Date())
    : null;

  // Nao mexe em statusMonitoramento nem em ultimaLeitura: digitar geracao a mao
  // nao faz a plataforma voltar a enviar. Marcar ONLINE aqui apagaria o alerta
  // de usina muda — o problema que motivou o lancamento manual.
  await prisma.brasilSolarClient.update({
    where: { id },
    data: {
      geracaoMesAtual: geracaoMes,
      performanceRatio: pr,
    },
  });

  return NextResponse.json(log, { status: 201 });
}
