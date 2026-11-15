/**
 * DUPLA CONFERÊNCIA retroativa — roda Infosimples × PDF nas faturas de UC de
 * cliente que já estão no banco (lib/fatura-conferencia.ts).
 *
 * Sem --apply: SÓ LÊ e lista o que travaria.
 * Com --apply: grava o resultado (conferenciaStatus etc.) — a partir daí as
 * divergentes ficam TRAVADAS na tela de faturamento até o operador resolver.
 * Não mexe em valor nenhum da fatura nem da cobrança.
 *
 *   npx tsx scripts/conferencia-retroativa.ts [--desde=2026-01] [--apply]
 */
import { prisma } from "../src/lib/prisma";
import { conferirFatura, conferirEGravar } from "../src/lib/fatura-conferencia";

const APPLY = process.argv.includes("--apply");
const desdeArg = process.argv.find((a) => a.startsWith("--desde="))?.split("=")[1] ?? "2026-01";
const [anoDesde, mesDesde] = desdeArg.split("-").map(Number);

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: {
      fonteConsulta: "INFOSIMPLES",
      consumerUnitId: { not: null },
      OR: [
        { anoReferencia: { gt: anoDesde } },
        { anoReferencia: anoDesde, mesReferencia: { gte: mesDesde } },
      ],
    },
    select: {
      id: true, consumerUnitId: true, anoReferencia: true, mesReferencia: true,
      consumerUnit: { select: { nome: true } },
    },
    orderBy: [{ anoReferencia: "asc" }, { mesReferencia: "asc" }],
  });
  console.log(`${bills.length} faturas Infosimples de cliente desde ${desdeArg} — ${APPLY ? "GRAVANDO" : "simulação"}`);
  const cont: Record<string, number> = {};
  for (const b of bills) {
    const r = APPLY ? await conferirEGravar(b.id) : await conferirFatura(b.id);
    cont[r.status] = (cont[r.status] ?? 0) + 1;
    if (r.status === "CONFERIDA") continue;
    const bil = await prisma.consumerUnitBilling.findFirst({
      where: { consumerUnitId: b.consumerUnitId!, ano: b.anoReferencia, mes: b.mesReferencia },
      select: { asaasChargeId: true, status: true },
    });
    const ref = `${String(b.mesReferencia).padStart(2, "0")}/${b.anoReferencia}`;
    const det = r.erro ?? r.divergencias.map((d) => `${d.rotulo}: info=${d.infosimples ?? "—"} pdf=${d.pdf ?? "—"}`).join(" · ");
    console.log(`${r.status.padEnd(10)} ${ref} ${b.consumerUnit?.nome} [${bil?.asaasChargeId ? "JÁ EMITIDA" : bil?.status ?? "sem cobrança"}] ${det}`);
  }
  console.log(cont);
}
main().finally(() => prisma.$disconnect());
