import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const alertas = await prisma.monitoringAlert.findMany({
      where: { status: { in: ["ABERTO", "EM_ANDAMENTO"] } },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        tipo: true,
        severidade: true,
        acaoRequerida: true,
        codigoErroFabricante: true,
        titulo: true,
        descricao: true,
        status: true,
        createdAt: true,
        client: {
          select: {
            id: true,
            nome: true,
            cidade: true,
            uf: true,
            potenciaInstalada: true,
            ultimaLeitura: true,
            statusMonitoramento: true,
            latitude: true,
            longitude: true,
            inversorMarca: true,
            plataformaMonitoramento: true,
          },
        },
      },
    });

    const itens = alertas.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      severidade: a.severidade,
      acaoRequerida: a.acaoRequerida,
      codigoErroFabricante: a.codigoErroFabricante,
      titulo: a.titulo,
      descricao: a.descricao,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      usina: a.client,
    }));

    const counts = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 } as Record<string, number>;
    for (const a of itens) {
      if (a.severidade in counts) counts[a.severidade]++;
    }

    return NextResponse.json({ alertas: itens, total: itens.length, counts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/brasil-solar/alertas-usinas]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
