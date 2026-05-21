import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getAllPvSystems, type FroniusPvSystem } from "@/lib/fronius";

// POST /api/brasil-solar/sync - Sincronizar plantas Fronius → BrasilSolarClient
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    // Buscar todas as plantas da Fronius
    const froniusSystems = await getAllPvSystems();

    // Buscar clientes já existentes indexados por monitoramentoPlantId
    const existingClients = await prisma.brasilSolarClient.findMany({
      where: { plataformaMonitoramento: "FRONIUS" },
      select: { id: true, monitoramentoPlantId: true },
    });

    const existingMap = new Map(
      existingClients
        .filter((c) => c.monitoramentoPlantId)
        .map((c) => [c.monitoramentoPlantId!, c.id])
    );

    let created = 0;
    let updated = 0;
    let errors = 0;

    // Processar em lotes de 50 para não sobrecarregar o banco
    const BATCH_SIZE = 50;
    for (let i = 0; i < froniusSystems.length; i += BATCH_SIZE) {
      const batch = froniusSystems.slice(i, i + BATCH_SIZE);

      const operations = batch.map((sys) => {
        const data = mapFroniusToClient(sys);
        const existingId = existingMap.get(sys.pvSystemId);

        if (existingId) {
          // Atualizar dados que podem ter mudado
          return prisma.brasilSolarClient
            .update({
              where: { id: existingId },
              data: {
                nome: data.nome,
                endereco: data.endereco,
                cidade: data.cidade,
                potenciaInstalada: data.potenciaInstalada,
                monitoramentoUrl: data.monitoramentoUrl,
                // Atualizar status baseado no lastImport
                ultimaLeitura: data.ultimaLeitura,
              },
            })
            .then(() => { updated++; })
            .catch(() => { errors++; });
        } else {
          // Criar novo cliente
          return prisma.brasilSolarClient
            .create({ data })
            .then(() => { created++; })
            .catch(() => { errors++; });
        }
      });

      await Promise.all(operations);
    }

    return NextResponse.json({
      message: "Sincronizacao concluida",
      total: froniusSystems.length,
      created,
      updated,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function mapFroniusToClient(sys: FroniusPvSystem) {
  // Extrair UF do endereço ou CEP (padrão BR)
  const uf = extractUf(sys.address.state, sys.address.city);

  // Determinar status com base no lastImport
  let statusMonitoramento = "SEM_DADOS";
  if (sys.lastImport) {
    const lastImport = new Date(sys.lastImport);
    const diffHours = (Date.now() - lastImport.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) statusMonitoramento = "ONLINE";
    else if (diffHours < 72) statusMonitoramento = "ALERTA";
    else statusMonitoramento = "OFFLINE";
  }

  return {
    nome: sys.name,
    endereco: sys.address.street || undefined,
    cidade: sys.address.city || undefined,
    uf,
    potenciaInstalada: sys.peakPower ? sys.peakPower / 1000 : undefined, // W → kWp
    dataInstalacao: sys.installationDate ? new Date(sys.installationDate) : undefined,
    plataformaMonitoramento: "FRONIUS",
    monitoramentoPlantId: sys.pvSystemId,
    monitoramentoUrl: `https://www.solarweb.com/PvSystems/PvSystem/${sys.pvSystemId}`,
    statusMonitoramento,
    ultimaLeitura: sys.lastImport ? new Date(sys.lastImport) : undefined,
    statusContrato: "ATIVO",
  };
}

function extractUf(state: string | null, city: string | null): string | undefined {
  if (state && state.length === 2) return state.toUpperCase();
  // Tentar extrair de padrões comuns no nome da cidade
  if (city) {
    const match = city.match(/\b([A-Z]{2})$/);
    if (match) return match[1];
  }
  return undefined;
}
