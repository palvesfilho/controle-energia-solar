/**
 * Pra cada bill com energiaInjetada>0 e pdfUrl, verificar:
 * - mundo (Plant/venda de energia ou só BSC/Brasil Solar)
 * - tamanho do PDF em disco
 * - status do energiaInjetadaMedidorKwh
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";

async function checkPdfSize(pdfUrl: string): Promise<number> {
  const localRel = pdfUrl.replace(/^\/api\/files\//, "");
  const uploadRoot = resolve(process.cwd(), "uploads");
  const localPath = resolve(uploadRoot, localRel);
  if (!localPath.startsWith(uploadRoot)) return -1;
  try {
    const st = await fs.stat(localPath);
    return st.size;
  } catch {
    return -2; // não existe
  }
}

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: {
      energiaInjetada: { gt: 0 },
      pdfUrl: { not: null },
    },
    select: {
      id: true,
      anoReferencia: true,
      mesReferencia: true,
      pdfUrl: true,
      energiaInjetadaMedidorKwh: true,
      fonteConsulta: true,
      consumerUnit: {
        select: {
          codigoUc: true,
          plant: { select: { id: true, name: true } },
        },
      },
      plant: { select: { id: true, name: true } }, // bill linkada direto a Plant (UC da própria usina)
    },
  });

  let bsTotal = 0, bsEmpty = 0, bsOk = 0, bsMissing = 0, bsFilled = 0;
  let veTotal = 0, veEmpty = 0, veOk = 0, veMissing = 0, veFilled = 0;
  const veSpiazzi: { ano: number; mes: number; size: number; injMed: number | null; fonte: string | null }[] = [];

  for (const b of bills) {
    const isVendaEnergia = b.consumerUnit?.plant != null || b.plant != null;
    const plantName = b.consumerUnit?.plant?.name ?? b.plant?.name ?? null;
    const size = b.pdfUrl ? await checkPdfSize(b.pdfUrl) : -3;

    if (isVendaEnergia) {
      veTotal++;
      if (b.energiaInjetadaMedidorKwh != null) veFilled++;
      if (size === 0) veEmpty++;
      else if (size < 0) veMissing++;
      else if (size > 0) veOk++;
      if (plantName?.includes("SPIAZZI") || plantName?.includes("Spiazzi") || plantName?.includes("ANTUNES")) {
        veSpiazzi.push({
          ano: b.anoReferencia,
          mes: b.mesReferencia,
          size,
          injMed: b.energiaInjetadaMedidorKwh,
          fonte: b.fonteConsulta,
        });
      }
    } else {
      bsTotal++;
      if (b.energiaInjetadaMedidorKwh != null) bsFilled++;
      if (size === 0) bsEmpty++;
      else if (size < 0) bsMissing++;
      else if (size > 0) bsOk++;
    }
  }

  console.log("=== Bills com energiaInjetada > 0 e pdfUrl setado ===\n");
  console.log("MUNDO BRASIL SOLAR (sem Plant):");
  console.log(`  Total: ${bsTotal}`);
  console.log(`  injMedidor preenchido: ${bsFilled}`);
  console.log(`  PDF em disco com tamanho > 0: ${bsOk}`);
  console.log(`  PDF vazio (0 bytes): ${bsEmpty}`);
  console.log(`  PDF não existe: ${bsMissing}`);

  console.log("\nMUNDO VENDA DE ENERGIA (com Plant):");
  console.log(`  Total: ${veTotal}`);
  console.log(`  injMedidor preenchido: ${veFilled}`);
  console.log(`  PDF em disco com tamanho > 0: ${veOk}`);
  console.log(`  PDF vazio (0 bytes): ${veEmpty}`);
  console.log(`  PDF não existe: ${veMissing}`);

  if (veSpiazzi.length > 0) {
    console.log(`\n=== Bills Spiazzi/Antunes (venda de energia) ===`);
    for (const r of veSpiazzi.sort((a, b) => `${a.ano}-${a.mes}`.localeCompare(`${b.ano}-${b.mes}`))) {
      const sizeLabel = r.size === 0 ? "VAZIO" : r.size < 0 ? "AUSENTE" : `${(r.size/1024).toFixed(0)}KB`;
      console.log(`  ${r.ano}-${String(r.mes).padStart(2,"0")} fonte=${r.fonte ?? "-"} pdf=${sizeLabel} injMedidor=${r.injMed ?? "null"}`);
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
