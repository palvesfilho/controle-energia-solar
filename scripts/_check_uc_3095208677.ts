import { prisma } from "../src/lib/prisma";

async function main() {
  const uc = await prisma.consumerUnit.findFirst({
    where: { codigoUc: "3095208677" },
  });
  if (!uc) {
    console.log("UC não encontrada");
    return;
  }
  console.log("UC:", uc.codigoUc, "-", uc.nome, "id:", uc.id);

  const bills = await prisma.consumerBill.findMany({
    where: { consumerUnitId: uc.id },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
    select: {
      anoReferencia: true,
      mesReferencia: true,
      consumoKwh: true,
      energiaCompensada: true,
      valorTotal: true,
      contaPaga: true,
      vencimento: true,
      dataLeituraAnterior: true,
      dataLeituraAtual: true,
      proximaLeitura: true,
      saldoInstalacaoKwh: true,
    },
  });

  console.log("\nFATURAS DA UC:");
  for (const b of bills) {
    console.log(
      `${b.anoReferencia}-${String(b.mesReferencia).padStart(2, "0")} ` +
      `consumo=${b.consumoKwh} compensada=${b.energiaCompensada} ` +
      `R$ ${b.valorTotal} ${b.contaPaga ? "PAGA" : "nao_paga"} ` +
      `venc=${b.vencimento?.toISOString().slice(0, 10) ?? "—"} ` +
      `leitura=${b.dataLeituraAnterior?.toISOString().slice(0, 10) ?? "—"}→${b.dataLeituraAtual?.toISOString().slice(0, 10) ?? "—"}`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
