import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const bills = await prisma.consumerBill.findMany({
    where: { anoReferencia: 2026, mesReferencia: 4, consumerUnitId: { not: null } },
    orderBy: { consumerUnit: { nome: "asc" } },
    select: {
      tarifaTE: true,
      tarifaTUSD: true,
      injetadaOucTeKwh: true,
      bandeiraTarifaria: true,
      bandeiraValor: true,
      valorTotal: true,
      fonteConsulta: true,
      consumerUnit: {
        select: {
          nome: true,
          codigoUc: true,
          regraRemuneracao: true,
          percentCompensado: true,
          percentBandeira: true,
        },
      },
    },
  });

  console.log(`Bills abr/2026: ${bills.length}\n`);
  for (const b of bills) {
    const u = b.consumerUnit;
    const te = b.tarifaTE;
    const tusd = b.tarifaTUSD;
    const soma = te != null && tusd != null ? te + tusd : null;
    const kwh = b.injetadaOucTeKwh;
    const bandeira = b.bandeiraValor;
    const pc = u?.percentCompensado;
    const pb = u?.percentBandeira;

    const parcelaEnergia =
      kwh != null && soma != null && pc != null ? kwh * soma * pc : null;
    const parcelaBandeira = bandeira != null && pb != null ? bandeira * pb : null;
    const valor =
      parcelaEnergia != null ? parcelaEnergia + (parcelaBandeira ?? 0) : null;

    console.log(`── ${u?.nome} (${u?.codigoUc}) [${b.fonteConsulta}]`);
    console.log(`   Tarifa TE:   ${te ?? "—"}`);
    console.log(`   Tarifa TUSD: ${tusd ?? "—"}`);
    console.log(`   TE + TUSD:   ${soma ?? "—"}`);
    console.log(`   kWh compensado (injetadaOucTeKwh): ${kwh ?? "—"}`);
    console.log(`   Bandeira: ${b.bandeiraTarifaria ?? "—"} / R$ ${bandeira ?? "—"}`);
    console.log(`   Regra: ${u?.regraRemuneracao ?? "—"}`);
    console.log(`   %compensado: ${pc ?? "—"}  •  %bandeira: ${pb ?? "—"}`);
    console.log(
      `   parcelaEnergia  = ${kwh ?? "?"} × ${soma ?? "?"} × ${pc ?? "?"} = ${parcelaEnergia?.toFixed(2) ?? "—"}`,
    );
    console.log(
      `   parcelaBandeira = ${bandeira ?? "?"} × ${pb ?? "?"} = ${parcelaBandeira?.toFixed(2) ?? "—"}`,
    );
    console.log(`   → valorCobrado = ${valor?.toFixed(2) ?? "—"}`);
    console.log(`   (valorTotal fatura: ${b.valorTotal ?? "—"})\n`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
