/**
 * Script para importar plantas Fronius → BrasilSolarClient
 * Roda diretamente sem precisar de sessão web
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FRONIUS_BASE_URL = "https://api.solarweb.com/swqapi";

function getHeaders(): Record<string, string> {
  return {
    AccessKeyId: process.env.FRONIUS_ACCESS_KEY_ID!,
    AccessKeyValue: process.env.FRONIUS_ACCESS_KEY_VALUE!,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

interface FroniusPvSystem {
  pvSystemId: string;
  name: string;
  address: {
    country: string;
    zipCode: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
  };
  peakPower: number;
  installationDate: string;
  lastImport: string | null;
}

async function froniusFetch<T>(path: string): Promise<T> {
  const url = `${FRONIUS_BASE_URL}${path}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fronius API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function getAllPvSystems(): Promise<FroniusPvSystem[]> {
  const countData = await froniusFetch<{ count: number }>("/pvsystems-count");
  console.log(`Total de plantas na Fronius: ${countData.count}`);

  const all: FroniusPvSystem[] = [];
  const pageSize = 100;
  const pages = Math.ceil(countData.count / pageSize);

  for (let page = 0; page < pages; page++) {
    const offset = page * pageSize;
    const data = await froniusFetch<{ pvSystems: FroniusPvSystem[] }>(
      `/pvsystems?offset=${offset}&limit=${pageSize}`
    );
    all.push(...data.pvSystems);
    console.log(`  Pagina ${page + 1}/${pages}: ${data.pvSystems.length} plantas`);
  }

  return all;
}

function extractUf(state: string | null, city: string | null): string | undefined {
  if (state && state.length === 2) return state.toUpperCase();
  if (city) {
    const match = city.match(/\b([A-Z]{2})$/);
    if (match) return match[1];
  }
  return undefined;
}

async function main() {
  console.log("Sincronizando plantas Fronius -> Brasil Solar Clients\n");

  const froniusSystems = await getAllPvSystems();

  // Buscar existentes
  const existing = await prisma.brasilSolarClient.findMany({
    where: { plataformaMonitoramento: "FRONIUS" },
    select: { id: true, monitoramentoPlantId: true },
  });

  const existingMap = new Map(
    existing.filter((c) => c.monitoramentoPlantId).map((c) => [c.monitoramentoPlantId!, c.id])
  );

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const sys of froniusSystems) {
    let statusMonitoramento = "SEM_DADOS";
    if (sys.lastImport) {
      const diffHours = (Date.now() - new Date(sys.lastImport).getTime()) / (1000 * 60 * 60);
      if (diffHours < 24) statusMonitoramento = "ONLINE";
      else if (diffHours < 72) statusMonitoramento = "ALERTA";
      else statusMonitoramento = "OFFLINE";
    }

    const data = {
      nome: sys.name,
      endereco: sys.address.street || undefined,
      cidade: sys.address.city || undefined,
      uf: extractUf(sys.address.state, sys.address.city),
      potenciaInstalada: sys.peakPower ? sys.peakPower / 1000 : undefined,
      dataInstalacao: sys.installationDate ? new Date(sys.installationDate) : undefined,
      plataformaMonitoramento: "FRONIUS" as const,
      monitoramentoPlantId: sys.pvSystemId,
      monitoramentoUrl: `https://www.solarweb.com/PvSystems/PvSystem/${sys.pvSystemId}`,
      statusMonitoramento,
      ultimaLeitura: sys.lastImport ? new Date(sys.lastImport) : undefined,
      statusContrato: "ATIVO" as const,
    };

    const existingId = existingMap.get(sys.pvSystemId);

    try {
      if (existingId) {
        await prisma.brasilSolarClient.update({
          where: { id: existingId },
          data: {
            nome: data.nome,
            endereco: data.endereco,
            cidade: data.cidade,
            potenciaInstalada: data.potenciaInstalada,
            monitoramentoUrl: data.monitoramentoUrl,
            ultimaLeitura: data.ultimaLeitura,
            statusMonitoramento: data.statusMonitoramento,
          },
        });
        updated++;
      } else {
        await prisma.brasilSolarClient.create({ data });
        created++;
      }
    } catch (e) {
      errors++;
      console.error(`  Erro em "${sys.name}": ${(e as Error).message}`);
    }
  }

  console.log(`\nResultado:`);
  console.log(`  Total Fronius: ${froniusSystems.length}`);
  console.log(`  Criados:       ${created}`);
  console.log(`  Atualizados:   ${updated}`);
  console.log(`  Erros:         ${errors}`);

  const totalBS = await prisma.brasilSolarClient.count();
  console.log(`\n  Total Brasil Solar Clients no banco: ${totalBS}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
