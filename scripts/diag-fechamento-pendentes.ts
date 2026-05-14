import { prisma } from "../src/lib/prisma";

function fmt(d: Date | null | undefined): string {
  if (!d) return "-";
  return d.toLocaleString("pt-BR");
}

async function main() {
  const anoArg = process.argv[2];
  const mesArg = process.argv[3];
  const now = new Date();
  const ano = anoArg ? Number(anoArg) : now.getFullYear();
  const mes = mesArg ? Number(mesArg) : now.getMonth() + 1;

  console.log(`\n=== Diagnóstico Fechamento Mensal — ${String(mes).padStart(2, "0")}/${ano} ===\n`);

  const ucs = await prisma.consumerUnit.findMany({
    where: { active: true },
    include: {
      consumer: { select: { name: true } },
      plant: { select: { name: true } },
      cpflCredential: {
        select: {
          id: true,
          active: true,
          statusSync: true,
          erroSync: true,
          ultimaSync: true,
          instalacao: true,
          distribuidora: true,
        },
      },
    },
    orderBy: [{ nome: "asc" }],
  });

  const bills = await prisma.consumerBill.findMany({
    where: { anoReferencia: ano, mesReferencia: mes },
    select: { consumerUnitId: true },
  });
  const billSet = new Set(bills.map((b) => b.consumerUnitId));

  const pendentes = ucs.filter((uc) => !billSet.has(uc.id));

  if (pendentes.length === 0) {
    console.log("Nenhuma UC pendente para o mês escolhido.\n");
    return;
  }

  console.log(`UCs pendentes: ${pendentes.length}/${ucs.length}\n`);
  console.log(
    "Código UC     | Nome                          | Credencial | Status sync | Último sync           | Motivo"
  );
  console.log("-".repeat(140));

  for (const uc of pendentes) {
    const cred = uc.cpflCredential;
    const nome = (uc.nome ?? "").padEnd(30).slice(0, 30);
    const codigo = (uc.codigoUc ?? "-").padEnd(13).slice(0, 13);

    let credStatus: string;
    let syncStatus: string;
    let ultimo: string;
    let motivo: string;

    if (!cred) {
      credStatus = "Não";
      syncStatus = "-";
      ultimo = "-";
      motivo = "Sem credencial cadastrada — cobrar concessionária manualmente";
    } else if (!cred.active) {
      credStatus = "Inativa";
      syncStatus = cred.statusSync ?? "-";
      ultimo = fmt(cred.ultimaSync);
      motivo = "Credencial desativada";
    } else {
      credStatus = "Ativa";
      syncStatus = cred.statusSync ?? "Nunca sincronizou";
      ultimo = fmt(cred.ultimaSync);
      if (cred.erroSync) motivo = cred.erroSync;
      else if (!cred.ultimaSync) motivo = "Nunca foi sincronizada";
      else if (cred.statusSync === "SUCCESS")
        motivo = `Sync OK (${fmt(cred.ultimaSync)}) mas sem fatura para ${String(mes).padStart(2, "0")}/${ano} — provavelmente não emitida ou em mês diferente`;
      else motivo = "(sem detalhe)";
    }

    console.log(
      `${codigo} | ${nome} | ${credStatus.padEnd(10)} | ${syncStatus.padEnd(11)} | ${ultimo.padEnd(21)} | ${motivo}`
    );
  }

  console.log("\nResumo por motivo:");
  const motivos = new Map<string, number>();
  for (const uc of pendentes) {
    const cred = uc.cpflCredential;
    let key: string;
    if (!cred) key = "Sem credencial cadastrada";
    else if (!cred.active) key = "Credencial desativada";
    else if (cred.erroSync) key = `Erro sync: ${cred.erroSync}`;
    else if (!cred.ultimaSync) key = "Nunca sincronizou";
    else if (cred.statusSync === "SUCCESS")
      key = `Sync OK mas sem fatura para ${String(mes).padStart(2, "0")}/${ano}`;
    else key = "Outro";
    motivos.set(key, (motivos.get(key) ?? 0) + 1);
  }
  const ordenados = [...motivos.entries()].sort((a, b) => b[1] - a[1]);
  for (const [motivo, qtd] of ordenados) {
    console.log(`  ${qtd.toString().padStart(3)} × ${motivo}`);
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
