/**
 * Teste end-to-end do relatório Brasil Solar do Othavio.
 * Roda a função real getProprietarioRelatorio e mostra os números mês a mês.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getProprietarioRelatorio } from "../src/lib/brasil-solar-relatorio";

const PROP_ID = "cmomq01bf1bsestgh127sgakj";
const UC_ID = "cmomq0ih61bshstgh3aj4u4in";

async function main() {
  console.log("Rodando getProprietarioRelatorio...");
  const t0 = Date.now();
  const r = await getProprietarioRelatorio(PROP_ID, UC_ID);
  console.log(`tempo: ${((Date.now() - t0)/1000).toFixed(1)}s\n`);

  if ("error" in r) { console.error("ERRO:", r); process.exit(1); }

  console.log(`=== ${r.proprietario.nome} (${r.proprietario.cidade}/${r.proprietario.uf}) ===`);
  console.log(`UC: ${r.uc.codigoUc} ${r.uc.nome ?? ""} (${r.uc.distribuidora})`);
  console.log(`Usinas: ${r.usinasMonitoradas.length}`);
  for (const u of r.usinasMonitoradas) console.log(`  - ${u.nome} ${u.potenciaInstalada}kWp invest=R$${u.investimento ?? "?"} (${u.plataforma})`);
  console.log(`Investimento total: R$ ${r.investimentoTotal.toFixed(2)}`);
  console.log(`Potência total: ${r.potenciaTotalKwp} kWp`);
  console.log(`Economia média mensal: R$ ${r.economiaMediaMensalRs.toFixed(2)}`);
  console.log(`Retorno total: ${r.retornoTotalPct.toFixed(1)}%`);
  console.log(`Payback restante: ${r.paybackRestanteMeses} meses (${r.paybackQuitado ? "QUITADO" : "em curso"})`);
  console.log(`Quitação prevista: ${r.paybackQuitacaoPrevista ? `${String(r.paybackQuitacaoPrevista.mes).padStart(2,"0")}/${r.paybackQuitacaoPrevista.ano}` : "não converge em 50 anos"}`);

  console.log(`\n=== Meses (${r.meses.length}) ===`);
  for (const m of r.meses) {
    const ger = m.geracaoInversorKwh != null ? m.geracaoInversorKwh.toFixed(0).padStart(4) : "  - ";
    const inj = m.injetadaMedidorKwh != null ? m.injetadaMedidorKwh.toFixed(0).padStart(4) : "  - ";
    const cons = m.consumoRedeKwh != null ? m.consumoRedeKwh.toFixed(0).padStart(4) : "  - ";
    const inst = m.consumoInstantaneoKwh != null ? m.consumoInstantaneoKwh.toFixed(0).padStart(4) : "  - ";
    const ecMes = m.economiaMensalRs != null ? m.economiaMensalRs.toFixed(2).padStart(8) : "    - ";
    const desemp = m.desempenhoPct != null ? `${m.desempenhoPct.toFixed(0)}%`.padStart(5) : "   - ";
    console.log(`  ${m.ano}-${String(m.mes).padStart(2,"0")} jan=[${m.janela.inicio}→${m.janela.fim} ${m.janela.fonte}] ger=${ger} inj=${inj} consRede=${cons} consInst=${inst} ecRs=${ecMes} desemp=${desemp} ${m.anomalia ? `⚠ ${m.anomalia}` : ""}`);
  }

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
