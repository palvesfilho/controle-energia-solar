/**
 * SOMENTE LEITURA. Mostra o que o sync marcaria como "excluída no CRM" agora,
 * sem gravar nada. Mesma regra de `marcarExcluidasNoCrm` em lib/crm-sync.ts.
 *
 *   npx tsx scripts/simula-excluidas-no-crm.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  listarAdesoes,
  listarPropostasPorIds,
  listarVendasGanhas,
} from "../src/lib/crm-supabase";

async function main() {
  const [ganhas, adesoes] = await Promise.all([listarVendasGanhas(), listarAdesoes()]);
  const idsGanhas = new Set(ganhas.map((p) => p.id));
  const idsSemGanha = adesoes
    .map((a) => a.proposta_id)
    .filter((id): id is number => id != null && !idsGanhas.has(id));
  const semGanha = await listarPropostasPorIds(idsSemGanha);
  const propostasLidas = new Set([...ganhas, ...semGanha].map((p) => p.id));
  const adesoesExistentes = new Set(adesoes.map((a) => a.id));

  console.log(`CRM: ${ganhas.length} ganhas, ${adesoes.length} adesões, ${semGanha.length} propostas sem ganha.`);

  const ucs = await prisma.crmUcImportada.findMany({
    select: {
      adesaoIdCrm: true, propostaIdCrm: true, codigoUc: true, codigoUcBruto: true,
      clienteNome: true, situacao: true, consumerUnitId: true,
    },
  });
  // As UCs que o sync leria: pela adesão (existe) + proposta lida. A UC
  // retirada do termo exige re-extrair; aqui basta o nível adesão/proposta.
  const marcadas = ucs.filter(
    (u) => !adesoesExistentes.has(u.adesaoIdCrm) || !propostasLidas.has(u.propostaIdCrm),
  );
  console.log(`\nUCs aqui: ${ucs.length}. Seriam marcadas: ${marcadas.length}`);
  for (const u of marcadas) {
    const motivo = !adesoesExistentes.has(u.adesaoIdCrm) ? "ADESAO_EXCLUIDA" : "PROPOSTA_EXCLUIDA";
    console.log(
      `  ${motivo.padEnd(18)} adesão ${u.adesaoIdCrm} · proposta ${u.propostaIdCrm} · ${u.codigoUcBruto ?? u.codigoUc} · ${u.clienteNome} · situação ${u.situacao}${u.consumerUnitId ? " · JÁ CADASTRADA" : ""}`,
    );
  }

  const vendas = await prisma.crmVendaImportada.findMany({
    where: { propostaIdCrm: { notIn: [...propostasLidas] } },
    select: { propostaIdCrm: true, clienteNome: true, situacao: true, obraId: true, nomeProduto: true },
  });
  const existem = new Set((await listarPropostasPorIds(vendas.map((v) => v.propostaIdCrm))).map((p) => p.id));
  const comAdesao = new Set(adesoes.map((a) => a.proposta_id));
  console.log(`\nVendas não lidas nesta rodada: ${vendas.length}`);
  for (const v of vendas) {
    const motivo = !existem.has(v.propostaIdCrm)
      ? "PROPOSTA_EXCLUIDA"
      : v.situacao === "ASSINADA_SEM_VENDA" && !comAdesao.has(v.propostaIdCrm)
        ? "ADESAO_EXCLUIDA"
        : "(não marca: proposta existe, só deixou de ser ganha)";
    console.log(`  ${motivo} · proposta ${v.propostaIdCrm} · ${v.clienteNome} · ${v.nomeProduto} · ${v.situacao}${v.obraId ? " · TEM OBRA" : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
