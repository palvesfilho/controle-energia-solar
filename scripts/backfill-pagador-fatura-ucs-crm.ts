/**
 * Backfill único (02/09/2026): as UCs de desconto que vieram do gerador de
 * propostas ANTES de o padrão existir ficaram sem regra de remuneração e, por
 * consequência, sem resposta para "quem paga a fatura de energia".
 *
 * Decisão do Paulo em 02/09/2026: contrato assinado no gerador de propostas,
 * cliente que não é proprietário de usina → o CLIENTE paga a distribuidora e a
 * gestora cobra só o percentual sobre o compensado.
 *
 * O alvo é fechado de propósito, e cada condição existe por um motivo:
 *   - origem PADRAO + ativa ................. fluxo da Gestora, não Brasil Solar
 *   - percentCompensado > 0 ................. é UC de desconto
 *   - plantId e consumerId preenchidos ...... é cliente compensado, não a usina
 *   - regraRemuneracao NULL ................. só as que ninguém preencheu; as
 *     legadas (DESC_COMPENSADA_BANDEIRAS, FATURA_UNICA_DOMMO) NÃO entram — elas
 *     têm histórico de pagamento nosso e o pagador GESTORA delas está correto
 *   - docsAdesaoIdCrm preenchido ............ prova que veio do gerador
 *   - zero faturas .......................... nada retroativo para desarrumar
 *
 * Grava backup antes. Sem --apply, só mostra o que faria.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { formatCodigoUc } from "../src/lib/uc-codigo";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const REGRA_NOVA = "PERCENTUAL_SOBRE_COMPENSADO";
const PAGADOR_NOVO = "CLIENTE";

async function main() {
  const alvo = await prisma.consumerUnit.findMany({
    where: {
      origem: "PADRAO",
      active: true,
      percentCompensado: { gt: 0 },
      plantId: { not: null },
      consumerId: { not: null },
      regraRemuneracao: null,
      docsAdesaoIdCrm: { not: null },
      bills: { none: {} },
    },
    select: {
      id: true, nome: true, codigoUc: true, createdAt: true, docsAdesaoIdCrm: true,
      regraRemuneracao: true, pagadorFaturaEnergia: true, percentCompensado: true,
    },
    orderBy: [{ createdAt: "asc" }, { nome: "asc" }],
  });

  console.log(`Alvo: ${alvo.length} UCs\n`);
  for (const u of alvo) {
    console.log(
      `  ${(formatCodigoUc(u.codigoUc) ?? u.codigoUc).padEnd(18)}` +
      `adesao ${String(u.docsAdesaoIdCrm).padEnd(4)}` +
      `${u.createdAt.toISOString().slice(0, 10)}  ` +
      `${u.regraRemuneracao ?? "(sem regra)"}/${u.pagadorFaturaEnergia}` +
      ` → ${REGRA_NOVA}/${PAGADOR_NOVO}  ${u.nome}`
    );
  }

  if (!APPLY) {
    console.log("\nDRY-RUN. Rode com --apply para gravar.");
    return;
  }

  // Backup fora do repositório de código, junto dos outros backups do projeto.
  const backup = path.join("..", "backup-pagador-fatura-antes-backfill.csv");
  const linhas = ["id;codigo_uc;nome;regra_antes;pagador_antes"];
  for (const u of alvo) {
    linhas.push([u.id, formatCodigoUc(u.codigoUc) ?? u.codigoUc, u.nome ?? "",
      u.regraRemuneracao ?? "", u.pagadorFaturaEnergia].join(";"));
  }
  fs.writeFileSync(backup, "\uFEFF" + linhas.join("\r\n"), "utf8");
  console.log(`\nBackup: ${backup}`);

  const r = await prisma.consumerUnit.updateMany({
    where: { id: { in: alvo.map((u) => u.id) } },
    data: { regraRemuneracao: REGRA_NOVA, pagadorFaturaEnergia: PAGADOR_NOVO },
  });
  console.log(`Atualizadas: ${r.count}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
