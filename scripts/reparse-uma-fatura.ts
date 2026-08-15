/**
 * Roda o reparse do PDF numa fatura, mostrando ANTES → DEPOIS.
 *
 *   npx tsx scripts/reparse-uma-fatura.ts <billId>            (dry-run)
 *   npx tsx scripts/reparse-uma-fatura.ts <billId> --apply    (escreve)
 *
 * Mesma lógica do botão "Re-extrair do PDF", inclusive a guarda de tarifa
 * preenchida à mão (tarifasManuaisEm): escolha explícita não é sobrescrita.
 */
import { prisma } from "../src/lib/prisma";
import { parseFaturaPdf } from "../src/lib/fatura-pdf-parser";
import { readFromStorage } from "../src/lib/file-storage";
import { populateBillingFromBill } from "../src/lib/billing-populate";
import { syncInvestorPayablesFromBill } from "../src/lib/investor-payables";
import { precoKwhSolar } from "../src/lib/preco-kwh";

const billId = process.argv[2];
const APPLY = process.argv.includes("--apply");

/** Campos que interessam nesta investigação. */
const OLHAR = [
  "consumoKwh",
  "valorTotal",
  "tarifaTE",
  "tarifaTUSD",
  "tarifaTeComTributos",
  "tarifaTusdComTributos",
  "consumoTeValor",
  "consumoTusdValor",
  "energiaCompensada",
  "injetadaOucTeValor",
  "injetadaOucTusdValor",
] as const;

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toString();
  return String(v);
}

async function main() {
  if (!billId) {
    console.error("uso: npx tsx scripts/reparse-uma-fatura.ts <billId> [--apply]");
    process.exit(1);
  }

  const antes = await prisma.consumerBill.findUnique({
    where: { id: billId },
    select: {
      id: true,
      pdfUrl: true,
      anoReferencia: true,
      mesReferencia: true,
      tarifasManuaisEm: true,
      consumerUnit: { select: { nome: true } },
      ...Object.fromEntries(OLHAR.map((c) => [c, true])),
    } as never,
  });
  if (!antes) throw new Error("fatura não encontrada");
  const a = antes as unknown as Record<string, unknown>;

  console.log(
    `Fatura: ${(a.consumerUnit as { nome: string })?.nome} — ${a.mesReferencia}/${a.anoReferencia}`,
  );
  console.log(`PDF: ${a.pdfUrl}`);
  console.log(`tarifas preenchidas à mão: ${a.tarifasManuaisEm ? "SIM (protegidas)" : "não"}\n`);

  const file = await readFromStorage(a.pdfUrl as string);
  if (!file) throw new Error("PDF não está no storage");
  const parsed = await parseFaturaPdf(new Uint8Array(file.data));
  const novo = parsed.bill as unknown as Record<string, unknown>;

  console.log("campo                      ANTES (banco)        DEPOIS (do PDF)");
  console.log("-".repeat(72));
  for (const c of OLHAR) {
    const antesV = fmt(a[c]);
    const depoisV = fmt(novo[c]);
    const mudou = antesV !== depoisV;
    console.log(
      `${c.padEnd(26)} ${antesV.padEnd(20)} ${depoisV}${mudou ? "   <-- muda" : ""}`,
    );
  }

  const precoAntes = precoKwhSolar(a as never);
  const precoDepois = precoKwhSolar(novo as never);
  console.log(
    `\npreço do kWh ANTES : ${precoAntes.precoKwh ?? "null"}${precoAntes.implausivel ? " (BARRADO — implausível)" : ""}`,
  );
  console.log(
    `preço do kWh DEPOIS: ${precoDepois.precoKwh?.toFixed(6) ?? "null"}${precoDepois.implausivel ? " (BARRADO)" : ""}`,
  );

  if (!APPLY) {
    console.log("\nDRY-RUN — nada foi escrito. Use --apply para gravar.");
    return;
  }

  const { pdfUrl: _p, fonteConsulta: _f, ...billData } = novo;
  void _p;
  void _f;
  if (a.tarifasManuaisEm) {
    delete billData.tarifaTeComTributos;
    delete billData.tarifaTusdComTributos;
  }
  await prisma.consumerBill.update({
    where: { id: billId },
    data: { ...billData, syncedAt: new Date() } as never,
  });
  await populateBillingFromBill(billId).catch(() => {});
  await syncInvestorPayablesFromBill(billId).catch(() => {});

  const depois = (await prisma.consumerBill.findUnique({
    where: { id: billId },
    select: Object.fromEntries(OLHAR.map((c) => [c, true])) as never,
  })) as unknown as Record<string, unknown>;
  console.log("\n✅ GRAVADO. Releitura do banco:");
  for (const c of OLHAR) console.log(`  ${c.padEnd(26)} ${fmt(depois[c])}`);
  const precoFinal = precoKwhSolar(depois as never);
  console.log(
    `\npreço do kWh agora: ${precoFinal.precoKwh?.toFixed(6) ?? "null"}${precoFinal.implausivel ? " (ainda BARRADO)" : " ✅ dentro da faixa"}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
