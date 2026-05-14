import { prisma } from "../src/lib/prisma";
import { getProprietarioRelatorio } from "../src/lib/brasil-solar-relatorio";

const PROPRIETARIO_ID = "cmnxknpp4013erxnrinjw9r6d";
const UCS = [
  { id: "c131f3ad-e2c9-4e61-b0d3-28f5cd2b9d2b", label: "CATTO AP 01 (3090579398)" },
  { id: "2ca9c471-b65a-4555-b47e-58aa82c3cd79", label: "CATTO AP 02 (3090579397)" },
  { id: "cmoaxxavp000ii22b61jr60r3", label: "PRODUZA - UC (3095464357)" },
];

async function main() {
  const proprietario = await prisma.brasilSolarProprietario.findUnique({
    where: { id: PROPRIETARIO_ID },
    select: { id: true, nome: true, codigoUc: true },
  });
  console.log(`Proprietario: ${proprietario?.nome} | codigoUc no proprietario=${proprietario?.codigoUc ?? "—"}\n`);

  for (const uc of UCS) {
    console.log(`\n======== ${uc.label} ========`);
    const r = await getProprietarioRelatorio(PROPRIETARIO_ID, uc.id);
    if ("error" in r) {
      console.log(`ERRO ${r.status}: ${r.error}`);
      continue;
    }
    console.log(`Investimento total: R$ ${r.investimentoTotal.toLocaleString("pt-BR")}`);
    console.log(`Potencia total: ${r.potenciaTotalKwp} kWp`);
    console.log(`Geracao esperada mensal/anual: ${r.geracaoEsperadaMensalKwh}/${r.geracaoEsperadaAnualKwh} kWh`);
    console.log(`Economia media mensal: R$ ${r.economiaMediaMensalRs.toFixed(2)}`);
    console.log(`Retorno total: ${r.retornoTotalPct.toFixed(2)}%`);
    console.log(`Payback: ${r.paybackQuitado ? "QUITADO" : `${r.paybackRestanteMeses} meses restantes`}`);
    console.log(`Usinas monitoradas: ${r.usinasMonitoradas.length}`);
    for (const u of r.usinasMonitoradas) {
      console.log(`  - ${u.nome} | ${u.potenciaInstalada}kWp | R$${u.investimento} | ${u.plataforma}`);
    }
    console.log(`\nMeses (${r.meses.length}):`);
    console.log("Ano-Mes | GerKWh   | InjKWh   | ConRede  | ConInst  | ConTot   | CompKWh  | EconMes  | EconAcm  | Faturado | Anomalia");
    for (const m of r.meses) {
      const fmt = (v: number | null) => (v == null ? "    —    " : v.toFixed(2).padStart(9));
      console.log(
        `${m.ano}-${String(m.mes).padStart(2,"0")}  |${fmt(m.geracaoInversorKwh)}|${fmt(m.injetadaMedidorKwh)}|${fmt(m.consumoRedeKwh)}|${fmt(m.consumoInstantaneoKwh)}|${fmt(m.consumoTotalKwh)}|${fmt(m.energiaCompensadaKwh)}|${fmt(m.economiaMensalRs)}|${fmt(m.economiaAcumuladaRs)}|${fmt(m.faturadoRs)}| ${m.anomalia ? "⚠" : ""}`,
      );
      if (m.inversoresErros.length > 0) {
        for (const e of m.inversoresErros) console.log(`         ↳ INV ERR: ${e}`);
      }
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
