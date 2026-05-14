import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const candidatos = await prisma.brasilSolarClient.findMany({
    where: { statusMonitoramento: "ALERTA", active: true },
    select: { id: true, nome: true },
  });

  console.log(`${candidatos.length} clientes com statusMonitoramento=ALERTA`);

  let resetados = 0;
  let mantidos = 0;

  for (const c of candidatos) {
    const temAlerta = await prisma.monitoringAlert.findFirst({
      where: {
        clientId: c.id,
        status: { in: ["ABERTO", "EM_ANDAMENTO"] },
      },
      select: { id: true },
    });

    if (temAlerta) {
      mantidos++;
    } else {
      await prisma.brasilSolarClient.update({
        where: { id: c.id },
        data: { statusMonitoramento: "ONLINE" },
      });
      resetados++;
    }
  }

  console.log(`\nResetados pra ONLINE (sem MonitoringAlert ativo): ${resetados}`);
  console.log(`Mantidos em ALERTA (com MonitoringAlert ativo): ${mantidos}`);
}

main().finally(() => prisma.$disconnect());
