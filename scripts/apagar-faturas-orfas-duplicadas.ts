/**
 * Apaga linhas ÓRFÃS de ConsumerBill que são DUPLICATA de uma fatura já
 * vinculada — mesma UC, mesma competência, mesma instalação, mesmo valor.
 *
 * Nasceram de importações anteriores ao acerto do código da UC: o PDF entrou
 * como pendente e, quando o cadastro foi corrigido e o arquivo re-subiu, virou
 * uma segunda linha. Vincular a velha é impossível (a bill é única por
 * UC+ano+mês), então o caminho é apagar a cópia obsoleta.
 *
 * ⛔ Nunca apaga sozinho o que tiver qualquer dependente. Cada trava abaixo é um
 * jeito conhecido de perder dado em silêncio.
 *
 * Simula por padrão. Grava com --aplicar.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { whereCodigoUc } from "../src/lib/uc-codigo";
import { readFromStorage, deleteUploadedFile } from "../src/lib/file-storage";

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const orfas = await prisma.consumerBill.findMany({
    where: { consumerUnitId: null, instalacao: { not: null } },
  });

  const apagar: any[] = [];
  const barradas: string[] = [];

  for (const o of orfas) {
    const uc = await prisma.consumerUnit.findFirst({
      where: whereCodigoUc(o.instalacao!), select: { id: true, nome: true },
    });
    if (!uc) continue;

    const gemea = await prisma.consumerBill.findUnique({
      where: {
        consumerUnitId_anoReferencia_mesReferencia: {
          consumerUnitId: uc.id, anoReferencia: o.anoReferencia, mesReferencia: o.mesReferencia,
        },
      },
      select: { id: true, instalacao: true, valorTotal: true, consumoKwh: true, pdfUrl: true, plantId: true },
    });
    if (!gemea) continue; // essa dá pra vincular, não é caso deste script

    const ref = `${uc.nome} ${o.anoReferencia}-${String(o.mesReferencia).padStart(2, "0")}`;

    // TRAVA 1 — a fatura da USINA mora com consumerUnitId null de propósito.
    // Não é órfã: `plantId` preenchido significa conta de energia da usina.
    if (o.plantId) { barradas.push(`${ref}: órfã tem plantId (fatura de usina, não é órfã de verdade)`); continue; }

    // TRAVA 2 — pagável de investidor apontando pra ela. Apagar deixaria a
    // origem do dinheiro em NULL, calada (a FK é opcional → SetNull).
    const pays = await prisma.investorPayable.count({
      where: { OR: [{ consumerBillId: o.id }, { originatedByPlantBillId: o.id }] },
    });
    if (pays > 0) { barradas.push(`${ref}: ${pays} InvestorPayable apontando pra ela`); continue; }

    // TRAVA 3 — só apaga se for MESMO cópia: mesma instalação, valor e consumo.
    if (o.instalacao !== gemea.instalacao || o.valorTotal !== gemea.valorTotal || o.consumoKwh !== gemea.consumoKwh) {
      barradas.push(`${ref}: não é cópia idêntica (inst ${o.instalacao}×${gemea.instalacao}, total ${o.valorTotal}×${gemea.valorTotal}, kwh ${o.consumoKwh}×${gemea.consumoKwh})`);
      continue;
    }

    // TRAVA 4 — a que fica precisa ter PDF legível, senão apagar perde o arquivo.
    const arq = gemea.pdfUrl ? await readFromStorage(gemea.pdfUrl) : null;
    if (!arq || arq.size === 0) { barradas.push(`${ref}: a fatura que FICA está sem PDF legível (${gemea.pdfUrl})`); continue; }

    apagar.push({ orfa: o, gemeaId: gemea.id, gemeaPdfUrl: gemea.pdfUrl, ref });
  }

  console.log(`órfãs com gêmea vinculada: ${apagar.length + barradas.length}`);
  console.log(`  A APAGAR: ${apagar.length}`);
  console.log(`  BARRADAS pelas travas: ${barradas.length}`);
  if (barradas.length) { console.log("\n── barradas ──"); barradas.forEach((b) => console.log("  ⛔ " + b)); }

  const porUc = new Map<string, number>();
  apagar.forEach((a) => { const k = a.ref.replace(/ \d{4}-\d{2}$/, ""); porUc.set(k, (porUc.get(k) ?? 0) + 1); });
  console.log("\n── a apagar ──");
  porUc.forEach((n, k) => console.log(`  ${k}: ${n}`));

  if (!APLICAR) { console.log("\n(simulação — rode com --aplicar)"); return; }

  const arqBackup = `backups/backup-orfas-duplicadas-2026-08-19.json`;
  writeFileSync(arqBackup, JSON.stringify(apagar.map((a) => a.orfa), null, 2));
  console.log(`\nbackup das linhas: ${arqBackup}`);

  let ok = 0;
  const avisos: string[] = [];
  for (const a of apagar) {
    try {
      await prisma.consumerBill.delete({ where: { id: a.orfa.id } });
      // O PDF em _pending só sai se a gêmea aponta pra OUTRO arquivo.
      if (a.orfa.pdfUrl && a.orfa.pdfUrl !== a.gemeaPdfUrl) await deleteUploadedFile(a.orfa.pdfUrl);
      ok++;
    } catch (e) {
      avisos.push(`${a.ref}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n✅ apagadas: ${ok} de ${apagar.length}`);
  if (avisos.length) { console.log("⚠️ falhas:"); avisos.forEach((v) => console.log("  " + v)); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
