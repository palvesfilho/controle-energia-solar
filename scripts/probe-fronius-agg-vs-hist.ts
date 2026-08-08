/**
 * Para o mesmo dia e a mesma usina: o que diz o agregado diário oficial da
 * Fronius (`aggdata`) × a soma da curva de 5 min (`histdata`) × o que está
 * gravado no nosso `MonitoringLog`.
 *
 * Serve pra decidir quem está errado quando os três discordam.
 * Só lê. Uso: npx tsx scripts/probe-fronius-agg-vs-hist.ts --dia=2026-08-05
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
  const [y, m, d] = dia.split("-").map(Number);
  const headers = {
    AccessKeyId: process.env.FRONIUS_ACCESS_KEY_ID ?? "",
    AccessKeyValue: process.env.FRONIUS_ACCESS_KEY_VALUE ?? "",
    Accept: "application/json",
  };

  const nomes = ["MIO3K", "BEVILAQUA", "CANTINA POZZOBON", "ALTEMIR FELTRIN", "JOCELAINE"];
  const usinas = await prisma.brasilSolarClient.findMany({
    where: {
      active: true,
      plataformaMonitoramento: "FRONIUS",
      OR: nomes.map((n) => ({ nome: { contains: n, mode: "insensitive" as const } })),
    },
    select: { id: true, nome: true, monitoramentoPlantId: true, potenciaInstalada: true },
  });

  const logs = await prisma.monitoringLog.findMany({
    where: {
      clientId: { in: usinas.map((u) => u.id) },
      data: new Date(Date.UTC(y, m - 1, d, 12, 0, 0)),
    },
    select: { clientId: true, geracaoDiaria: true, origem: true, createdAt: true },
  });
  const porCliente = new Map(logs.map((l) => [l.clientId, l]));

  console.log(`Dia ${dia}\n`);
  console.log(
    `${"USINA".padEnd(28)} ${"kWp".padStart(6)} ${"AGGDATA".padStart(9)} ${"HISTDATA".padStart(9)} ${"NOSSO LOG".padStart(10)}  GRAVADO EM`,
  );

  for (const u of usinas) {
    if (!u.monitoramentoPlantId) continue;

    // Agregado diário oficial — é a fonte que o sync atual usa.
    let agg = "—";
    try {
      const res = await fetch(
        `${BASE}/pvsystems/${u.monitoramentoPlantId}/aggdata/years/${y}/months/${String(m).padStart(2, "0")}/days`,
        { headers, cache: "no-store" },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          data?: { channels?: Array<{ channelName: string; values?: Record<string, number> }> };
        };
        const canal =
          body.data?.channels?.find((c) => c.channelName === "EnergyProductionTotal") ??
          body.data?.channels?.find((c) => c.channelName === "EnergyOutput");
        const chave = Object.keys(canal?.values ?? {}).find((k) => k.startsWith(dia));
        const wh = chave ? canal?.values?.[chave] : undefined;
        if (wh != null) agg = (wh / 1000).toFixed(2);
      } else {
        agg = `HTTP ${res.status}`;
      }
    } catch (e) {
      agg = e instanceof Error ? e.message.slice(0, 12) : "erro";
    }

    // Soma da curva de 5 min.
    let hist = "—";
    try {
      const res = await fetch(
        `${BASE}/pvsystems/${u.monitoramentoPlantId}/histdata` +
          `?from=${dia}T00:00:00Z&to=${dia}T23:59:59Z&channel=EnergyProductionTotal&timezone=zulu&limit=500`,
        { headers, cache: "no-store" },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          data?: Array<{ channels?: Array<{ channelName: string; value: number | null }> }>;
        };
        const wh = (body.data ?? []).reduce(
          (s, r) => s + (r.channels?.find((c) => c.channelName === "EnergyProductionTotal")?.value ?? 0),
          0,
        );
        hist = (wh / 1000).toFixed(2);
      }
    } catch {
      hist = "erro";
    }

    const log = porCliente.get(u.id);
    console.log(
      `${u.nome.slice(0, 27).padEnd(28)} ${String(u.potenciaInstalada ?? "?").padStart(6)} ${agg.padStart(9)} ${hist.padStart(9)} ` +
        `${(log ? log.geracaoDiaria.toFixed(2) : "—").padStart(10)}  ${log ? log.createdAt.toISOString().slice(0, 16).replace("T", " ") : ""}`,
    );
  }
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
