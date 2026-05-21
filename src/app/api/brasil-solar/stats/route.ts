import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/brasil-solar/stats - Dashboard stats
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const [
    totalProprietarios,
    plantasSemProprietario,
  ] = await Promise.all([
    prisma.brasilSolarProprietario.count({ where: { active: true } }),
    prisma.brasilSolarClient.count({ where: { active: true, proprietarioId: null } }),
  ]);

  const [
    totalClientes,
    clientesOnline,
    clientesOffline,
    clientesAlerta,
    clientesSemDados,
    alertasAbertos,
    alertasCriticos,
    geracaoHoje,
    geracaoMes,
    clientesPorPlataforma,
    clientesPorUf,
    alertasPorTipo,
  ] = await Promise.all([
    prisma.brasilSolarClient.count({ where: { active: true } }),
    prisma.brasilSolarClient.count({ where: { active: true, statusMonitoramento: "ONLINE" } }),
    prisma.brasilSolarClient.count({ where: { active: true, statusMonitoramento: "OFFLINE" } }),
    prisma.brasilSolarClient.count({ where: { active: true, statusMonitoramento: "ALERTA" } }),
    prisma.brasilSolarClient.count({ where: { active: true, statusMonitoramento: "SEM_DADOS" } }),
    prisma.monitoringAlert.count({ where: { status: "ABERTO" } }),
    prisma.monitoringAlert.count({ where: { status: "ABERTO", severidade: "CRITICA" } }),
    // Soma da geracao do dia de hoje
    prisma.monitoringLog.aggregate({
      where: {
        data: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
      _sum: { geracaoDiaria: true },
      _count: true,
    }),
    // Soma da geracao do mes atual (campo desnormalizado)
    prisma.brasilSolarClient.aggregate({
      where: { active: true },
      _sum: { geracaoMesAtual: true },
    }),
    // Distribuicao por plataforma
    prisma.brasilSolarClient.groupBy({
      by: ["plataformaMonitoramento"],
      where: { active: true },
      _count: true,
    }),
    // Distribuicao por UF
    prisma.brasilSolarClient.groupBy({
      by: ["uf"],
      where: { active: true },
      _count: true,
      orderBy: { _count: { uf: "desc" } },
      take: 10,
    }),
    // Alertas por tipo
    prisma.monitoringAlert.groupBy({
      by: ["tipo"],
      where: { status: "ABERTO" },
      _count: true,
    }),
  ]);

  return NextResponse.json({
    totalProprietarios,
    plantasSemProprietario,
    totalClientes,
    statusDistribution: {
      online: clientesOnline,
      offline: clientesOffline,
      alerta: clientesAlerta,
      semDados: clientesSemDados,
    },
    alertas: {
      abertos: alertasAbertos,
      criticos: alertasCriticos,
    },
    geracao: {
      hoje: geracaoHoje._sum.geracaoDiaria ?? 0,
      clientesComDadosHoje: geracaoHoje._count,
      mesAtual: geracaoMes._sum.geracaoMesAtual ?? 0,
    },
    distribuicao: {
      plataforma: clientesPorPlataforma.map((p) => ({
        plataforma: p.plataformaMonitoramento || "Nao informado",
        count: p._count,
      })),
      uf: clientesPorUf.map((u) => ({
        uf: u.uf || "Nao informado",
        count: u._count,
      })),
      alertasPorTipo: alertasPorTipo.map((a) => ({
        tipo: a.tipo,
        count: a._count,
      })),
    },
  });
}
