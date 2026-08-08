/**
 * Por que o Fronius superestimou o dia em até +493% quando liguei a paginação?
 *
 * Suspeita: `links.next` não continua no tempo — ele anda por DISPOSITIVO. Se
 * a página 1 é o agregado da usina (deviceId=null) e as seguintes são cada
 * inversor, somar tudo conta a mesma energia várias vezes.
 *
 * Só lê. Uso: npx tsx scripts/probe-fronius-paginacao.ts --dia=2026-08-05
 */
import { prisma } from "../src/lib/prisma";

const BASE = "https://api.solarweb.com/swqapi";

function arg(nome: string): string | undefined {
  const flag = `--${nome}=`;
  const a = process.argv.find((x) => x.startsWith(flag));
  return a ? a.slice(flag.length) : undefined;
}

async function main() {
  const dia = arg("dia") ?? "2026-08-05";
  const headers = {
    AccessKeyId: process.env.FRONIUS_ACCESS_KEY_ID ?? "",
    AccessKeyValue: process.env.FRONIUS_ACCESS_KEY_VALUE ?? "",
    Accept: "application/json",
  };

  const usina = await prisma.brasilSolarClient.findFirst({
    where: { active: true, plataformaMonitoramento: "FRONIUS", nome: { contains: "MIO3K" } },
    select: { nome: true, monitoramentoPlantId: true },
  });
  if (!usina?.monitoramentoPlantId) {
    console.log("usina não encontrada");
    return;
  }
  console.log(`${usina.nome} · ${usina.monitoramentoPlantId}\n`);

  let url: string | null =
    `${BASE}/pvsystems/${usina.monitoramentoPlantId}/histdata` +
    `?from=${dia}T08:00:00Z&to=${dia}T23:00:00Z&channel=EnergyProductionTotal&timezone=zulu&limit=200`;

  const vistos = new Map<string, number>(); // "deviceId|logDateTime" -> vezes
  const porDevice = new Map<string, { registros: number; somaWh: number }>();

  for (let pagina = 0; url && pagina < 12; pagina++) {
    const res: Response = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      console.log(`página ${pagina}: HTTP ${res.status}`);
      break;
    }
    const body = (await res.json()) as {
      pvSystemId?: string;
      deviceId?: string | null;
      data?: Array<{ logDateTime: string; channels?: Array<{ channelName: string; value: number | null }> }>;
      links?: { next?: string | null };
    };

    const dev = body.deviceId ?? "(agregado da usina)";
    const registros = body.data?.length ?? 0;
    let soma = 0;
    for (const d of body.data ?? []) {
      const v = d.channels?.find((c) => c.channelName === "EnergyProductionTotal")?.value ?? 0;
      soma += v ?? 0;
      const chave = `${dev}|${d.logDateTime}`;
      vistos.set(chave, (vistos.get(chave) ?? 0) + 1);
    }

    const acc = porDevice.get(dev) ?? { registros: 0, somaWh: 0 };
    acc.registros += registros;
    acc.somaWh += soma;
    porDevice.set(dev, acc);

    console.log(
      `página ${pagina}: deviceId=${dev} · ${registros} registros · ${(soma / 1000).toFixed(2)} kWh` +
        `${body.links?.next ? "" : "  (última)"}`,
    );
    url = body.links?.next ?? null;
  }

  console.log("\nPor dispositivo:");
  let total = 0;
  for (const [dev, acc] of porDevice) {
    console.log(`  ${dev}: ${acc.registros} registros · ${(acc.somaWh / 1000).toFixed(2)} kWh`);
    total += acc.somaWh;
  }
  console.log(`\nSoma de TUDO (o que o coletor estava fazendo): ${(total / 1000).toFixed(2)} kWh`);
  const dups = [...vistos.values()].filter((n) => n > 1).length;
  console.log(`Timestamps repetidos dentro do mesmo dispositivo: ${dups}`);
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
