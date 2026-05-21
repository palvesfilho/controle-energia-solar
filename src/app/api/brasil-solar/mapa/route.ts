import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export interface MapaUsinaMarker {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  cidade: string | null;
  uf: string | null;
  statusMonitoramento: string;
  potenciaInstalada: number | null;
}

export interface UsinaComErro {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  statusMonitoramento: string;
  potenciaInstalada: number | null;
  ultimaLeitura: string | null;
  latitude: number | null;
  longitude: number | null;
}

const STATUS_ERRO = ["OFFLINE", "ALERTA", "SEM_DADOS"] as const;

// GET /api/brasil-solar/mapa - Retorna usinas geolocalizadas + lista de usinas com erro
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const rows = await prisma.brasilSolarClient.findMany({
    where: { active: true },
    select: {
      id: true,
      nome: true,
      latitude: true,
      longitude: true,
      cidade: true,
      uf: true,
      statusMonitoramento: true,
      potenciaInstalada: true,
      ultimaLeitura: true,
    },
  });

  const clients: MapaUsinaMarker[] = rows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      nome: r.nome,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      cidade: r.cidade,
      uf: r.uf,
      statusMonitoramento: r.statusMonitoramento,
      potenciaInstalada: r.potenciaInstalada,
    }));

  const plantasComErro: UsinaComErro[] = rows
    .filter((r) => STATUS_ERRO.includes(r.statusMonitoramento as typeof STATUS_ERRO[number]))
    .map((r) => ({
      id: r.id,
      nome: r.nome,
      cidade: r.cidade,
      uf: r.uf,
      statusMonitoramento: r.statusMonitoramento,
      potenciaInstalada: r.potenciaInstalada,
      ultimaLeitura: r.ultimaLeitura ? r.ultimaLeitura.toISOString() : null,
      latitude: r.latitude,
      longitude: r.longitude,
    }))
    .sort((a, b) => {
      const ta = a.ultimaLeitura ? new Date(a.ultimaLeitura).getTime() : 0;
      const tb = b.ultimaLeitura ? new Date(b.ultimaLeitura).getTime() : 0;
      return tb - ta;
    });

  return NextResponse.json({ clients, plantasComErro });
}
