/**
 * Gera lista de faturas que precisam ser reuploadadas.
 *
 * Critérios:
 * - PDF em disco vazio (0 bytes) OU ausente
 * - Tem pdfUrl setado no DB (caso contrário não é "PDF perdido", é "nunca teve")
 *
 * Prioridade:
 * - ALTA: energiaInjetada > 0 e energiaInjetadaMedidorKwh = null  → afeta relatório
 * - MÉDIA: energiaInjetada > 0 e energiaInjetadaMedidorKwh != null → relatório OK, mas PDF orfão
 * - BAIXA: outras (sem injeção, etc)
 *
 * Saída: stdout + CSV em D:/tmp/reupload-pendente.csv
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";

async function pdfSize(pdfUrl: string): Promise<number> {
  const localRel = pdfUrl.replace(/^\/api\/files\//, "");
  const uploadRoot = resolve(process.cwd(), "uploads");
  const localPath = resolve(uploadRoot, localRel);
  if (!localPath.startsWith(uploadRoot)) return -1;
  try {
    const st = await fs.stat(localPath);
    return st.size;
  } catch {
    return -2;
  }
}

async function main() {
  const all = await prisma.consumerBill.findMany({
    where: { pdfUrl: { not: null } },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      pdfUrl: true,
      energiaInjetada: true,
      energiaInjetadaMedidorKwh: true,
      fonteConsulta: true,
      consumerUnit: {
        select: {
          codigoUc: true,
          plant: { select: { id: true, name: true } },
          consumer: { select: { name: true } },
        },
      },
      plant: { select: { id: true, name: true } },
    },
  });

  type Row = {
    prio: "ALTA" | "MEDIA" | "BAIXA";
    plantNome: string;
    bsOuPlant: "PLANT" | "BS";
    codigoUc: string;
    ano: number;
    mes: number;
    fonte: string;
    energiaInjetada: number | null;
    injMedidor: number | null;
    pdfStatus: string;
  };
  const rows: Row[] = [];

  for (const b of all) {
    const size = b.pdfUrl ? await pdfSize(b.pdfUrl) : -3;
    if (size > 0) continue; // PDF OK, não precisa reupload

    const plantNome = b.consumerUnit?.plant?.name ?? b.plant?.name ?? b.consumerUnit?.consumer?.name ?? "(sem nome)";
    const isPlantWorld = !!(b.consumerUnit?.plant || b.plant);
    const codigoUc = b.consumerUnit?.codigoUc ?? "(plant)";

    let prio: Row["prio"] = "BAIXA";
    if ((b.energiaInjetada ?? 0) > 0) {
      prio = b.energiaInjetadaMedidorKwh == null ? "ALTA" : "MEDIA";
    }

    rows.push({
      prio,
      plantNome,
      bsOuPlant: isPlantWorld ? "PLANT" : "BS",
      codigoUc,
      ano: b.anoReferencia,
      mes: b.mesReferencia,
      fonte: b.fonteConsulta ?? "-",
      energiaInjetada: b.energiaInjetada,
      injMedidor: b.energiaInjetadaMedidorKwh,
      pdfStatus: size === 0 ? "VAZIO" : size === -2 ? "AUSENTE" : "INVÁLIDO",
    });
  }

  // Ordenar por prio + planta + ano-mes
  const PRIO_ORDER = { ALTA: 0, MEDIA: 1, BAIXA: 2 } as const;
  rows.sort((a, b) => {
    if (PRIO_ORDER[a.prio] !== PRIO_ORDER[b.prio]) return PRIO_ORDER[a.prio] - PRIO_ORDER[b.prio];
    if (a.plantNome !== b.plantNome) return a.plantNome.localeCompare(b.plantNome);
    return `${a.ano}-${a.mes}`.localeCompare(`${b.ano}-${b.mes}`);
  });

  const altas = rows.filter((r) => r.prio === "ALTA");
  const medias = rows.filter((r) => r.prio === "MEDIA");
  const baixas = rows.filter((r) => r.prio === "BAIXA");

  console.log(`=== TOTAL ${rows.length} faturas precisam reupload ===`);
  console.log(`  🚨 Prioridade ALTA (afeta relatório):  ${altas.length}`);
  console.log(`  ⚠️  Prioridade MÉDIA (PDF orfão):       ${medias.length}`);
  console.log(`  ℹ️  Prioridade BAIXA:                   ${baixas.length}\n`);

  // Top 30 ALTAS agrupadas
  console.log(`========== ALTAS (top 50) ==========`);
  const groupedAlta = new Map<string, Row[]>();
  for (const r of altas) {
    const key = `${r.bsOuPlant}: ${r.plantNome}`;
    (groupedAlta.get(key) ?? groupedAlta.set(key, []).get(key)!).push(r);
  }
  let printed = 0;
  for (const [grp, items] of groupedAlta) {
    if (printed > 50) { console.log(`  ... +${altas.length - printed} faturas`); break; }
    console.log(`\n${grp} (${items.length} faturas):`);
    for (const r of items.slice(0, 6)) {
      console.log(`  ${r.ano}-${String(r.mes).padStart(2,"0")} UC ${r.codigoUc} fonte=${r.fonte} eInj=${r.energiaInjetada} pdf=${r.pdfStatus}`);
      printed++;
    }
    if (items.length > 6) console.log(`  ... +${items.length - 6}`);
  }

  // CSV completo
  await fs.mkdir("D:/tmp", { recursive: true });
  const csvPath = "D:/tmp/reupload-pendente.csv";
  const csvLines = ["prioridade;mundo;cliente;codigoUc;ano;mes;fonte;energiaInjetada;injMedidor;pdfStatus"];
  for (const r of rows) {
    csvLines.push(
      [r.prio, r.bsOuPlant, r.plantNome.replace(/;/g, ","), r.codigoUc, r.ano, r.mes, r.fonte, r.energiaInjetada, r.injMedidor, r.pdfStatus].join(";"),
    );
  }
  await fs.writeFile(csvPath, csvLines.join("\n"), "utf8");
  console.log(`\n📄 CSV completo salvo em: ${csvPath}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
