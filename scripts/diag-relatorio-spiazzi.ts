import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { getProprietarioRelatorio } from "../src/lib/brasil-solar-relatorio";

async function main() {
  const propId = "cmnxknpp4013erxnrinjw9r6d";
  const ucId = "cmoaxxavp000ii22b61jr60r3";
  const r = await getProprietarioRelatorio(propId, ucId);
  if ("error" in r) {
    console.log("ERRO:", r.error, "(status", r.status + ")");
    return;
  }
  console.log("Proprietário:", r.proprietario.nome);
  console.log("UC:", r.uc.nome, `(${r.uc.codigoUc})`);
  console.log(
    `Usinas monitoradas: ${r.usinasMonitoradas.length} | Potência total: ${r.potenciaTotalKwp} kWp | Investimento: R$ ${r.investimentoTotal}`,
  );
  console.log(
    `Economia média/mês: R$ ${r.economiaMediaMensalRs.toFixed(2)} | Payback restante: ${r.paybackRestanteMeses} meses (quitado=${r.paybackQuitado})`,
  );
  console.log("\nMeses (cronológico):");
  for (const m of r.meses) {
    const fonte = m.janela.fonte === "CICLO_LEITURA" ? "" : ` (${m.janela.fonte})`;
    console.log(
      `  ${m.mes}/${m.ano}${fonte}: gera=${m.geracaoInversorKwh ?? "-"} inj=${m.injetadaMedidorKwh ?? "-"} inst=${m.consumoInstantaneoKwh ?? "-"} consTot=${m.consumoTotalKwh ?? "-"} comp=${m.energiaCompensadaKwh ?? "-"} ecoComp=${m.economiaCompensadaRs?.toFixed(2) ?? "-"} ecoInst=${m.economiaInstantaneaRs?.toFixed(2) ?? "-"} eco=${m.economiaMensalRs?.toFixed(2) ?? "-"} acum=${m.economiaAcumuladaRs.toFixed(2)}${m.anomalia ? " ⚠ " + m.anomalia : ""}`,
    );
    if (m.inversoresErros.length > 0) {
      for (const e of m.inversoresErros) console.log(`     ⚠ ${e}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(0));
