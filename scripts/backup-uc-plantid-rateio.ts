/**
 * Backup do vínculo UC → usina ANTES de invertê-lo.
 *
 * Contexto: hoje `ConsumerUnit.plantId` é ENTRADA (o operador escolhe a usina no
 * cadastro e só então a UC pode entrar no rateio daquela usina). A decisão é
 * torná-lo CONSEQUÊNCIA do rateio vigente. Este script congela o estado atual
 * para (a) mandar à engenharia, (b) poder restaurar se a inversão der errado.
 *
 * Gera em backups/:
 *   uc-plantid-rateio-<data>.json  — snapshot completo, restaurável
 *   uc-plantid-rateio-<data>.csv   — mesma coisa em planilha, para leitura
 *
 * Só LÊ o banco. Não altera nada.
 *
 * Uso: npx tsx scripts/backup-uc-plantid-rateio.ts
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeConcessionaria } from "../src/lib/concessionarias";

const prisma = new PrismaClient();

// A data entra por argumento pra o arquivo não depender do relógio da máquina
// e o mesmo comando gerar o mesmo nome numa reexecução.
const dataArg = process.argv[2] ?? new Date().toISOString().slice(0, 10);

function concessionariaDaPlant(p: { concessionaria: string | null; distribuidora: string | null }) {
  const bruto = p.concessionaria?.trim() || p.distribuidora?.trim() || null;
  if (!bruto) return null;
  return normalizeConcessionaria(bruto) ?? bruto;
}

async function main() {
  const [ucs, plants, versoes] = await Promise.all([
    prisma.consumerUnit.findMany({
      select: {
        id: true,
        nome: true,
        codigoUc: true,
        codigoUcAntigo: true,
        plantId: true,
        active: true,
        origem: true,
        statusContrato: true,
        distribuidora: true,
        consumerId: true,
        consumer: { select: { name: true } },
        plant: { select: { name: true } },
        _count: { select: { bills: true, billings: true, rateioItems: true, investorPayables: true } },
      },
      orderBy: { nome: "asc" },
    }),
    prisma.plant.findMany({
      select: {
        id: true,
        name: true,
        active: true,
        concessionaria: true,
        distribuidora: true,
        unidadeConsumidora: true,
        numeroUsina: true,
        codigoCliente: true,
        usinaDeInvestidor: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.rateioVersion.findMany({
      select: {
        id: true,
        plantId: true,
        status: true,
        vigenteAPartirDe: true,
        aceitoEm: true,
        enviadoEm: true,
        substituidoEm: true,
        criadoEm: true,
        observacao: true,
        items: { select: { id: true, consumerUnitId: true, percentual: true } },
      },
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  const plantById = new Map(plants.map((p) => [p.id, p]));

  // UC → usinas onde ela aparece em rateio VIGENTE (a verdade que vai passar a
  // mandar no campo).
  const vigentePorUc = new Map<string, Array<{ plantId: string; percentual: number }>>();
  for (const v of versoes.filter((v) => v.status === "VIGENTE")) {
    for (const it of v.items) {
      const lista = vigentePorUc.get(it.consumerUnitId) ?? [];
      lista.push({ plantId: v.plantId, percentual: it.percentual });
      vigentePorUc.set(it.consumerUnitId, lista);
    }
  }

  // Identificadores que marcam a UC GERADORA da usina — ela mantém o vínculo
  // mesmo fora do rateio, senão o teto de remuneração do investidor para de
  // disparar (ver resolvePlantIdParaCap em lib/investor-payables.ts).
  const codigosGeradoraPorPlant = new Map(
    plants.map((p) => [
      p.id,
      [p.numeroUsina, p.unidadeConsumidora, p.codigoCliente].filter(Boolean) as string[],
    ]),
  );

  const linhas = ucs.map((uc) => {
    const noRateio = vigentePorUc.get(uc.id) ?? [];
    const plantIdCadastro = uc.plantId;
    const plantIdsRateio = noRateio.map((r) => r.plantId);

    const eGeradoraDe = plantIdCadastro
      ? (codigosGeradoraPorPlant.get(plantIdCadastro) ?? []).includes(uc.codigoUc)
        ? plantIdCadastro
        : null
      : null;

    let situacao:
      | "BATE"
      | "SEM_RATEIO_COM_CADASTRO"
      | "EM_RATEIO_SEM_CADASTRO"
      | "DIVERGENTE"
      | "SEM_VINCULO"
      | "EM_MAIS_DE_UM_RATEIO";
    if (plantIdsRateio.length > 1) situacao = "EM_MAIS_DE_UM_RATEIO";
    else if (plantIdsRateio.length === 0 && plantIdCadastro) situacao = "SEM_RATEIO_COM_CADASTRO";
    else if (plantIdsRateio.length > 0 && !plantIdCadastro) situacao = "EM_RATEIO_SEM_CADASTRO";
    else if (plantIdsRateio.length > 0 && plantIdCadastro && !plantIdsRateio.includes(plantIdCadastro))
      situacao = "DIVERGENTE";
    else if (plantIdsRateio.length > 0) situacao = "BATE";
    else situacao = "SEM_VINCULO";

    // O que o campo passaria a valer sob a regra nova.
    const plantIdDepois = plantIdsRateio[0] ?? eGeradoraDe ?? null;

    return {
      consumerUnitId: uc.id,
      nome: uc.nome,
      codigoUc: uc.codigoUc,
      codigoUcAntigo: uc.codigoUcAntigo,
      consumidor: uc.consumer?.name ?? null,
      ativa: uc.active,
      origem: uc.origem,
      statusContrato: uc.statusContrato,
      distribuidoraUc: uc.distribuidora,
      distribuidoraUcNormalizada: normalizeConcessionaria(uc.distribuidora),
      // ANTES: o vínculo de cadastro que existe hoje
      plantIdCadastro,
      usinaCadastro: uc.plant?.name ?? null,
      // AGORA: o que o rateio vigente diz
      plantIdsRateioVigente: plantIdsRateio,
      usinasRateioVigente: plantIdsRateio.map((id) => plantById.get(id)?.name ?? id),
      percentuaisRateioVigente: noRateio.map((r) => r.percentual),
      // DEPOIS: o valor que a regra nova gravaria
      plantIdDepois,
      usinaDepois: plantIdDepois ? (plantById.get(plantIdDepois)?.name ?? plantIdDepois) : null,
      ehUcGeradora: !!eGeradoraDe,
      situacao,
      mudaComAInversao: plantIdCadastro !== plantIdDepois,
      historico: uc._count,
    };
  });

  const resumo = {
    geradoEm: dataArg,
    totalUcs: ucs.length,
    totalUsinas: plants.length,
    usinasComRateioVigente: versoes.filter((v) => v.status === "VIGENTE").length,
    ucsEmRateioVigente: vigentePorUc.size,
    porSituacao: linhas.reduce<Record<string, number>>((acc, l) => {
      acc[l.situacao] = (acc[l.situacao] ?? 0) + 1;
      return acc;
    }, {}),
    ucsQueMudamComAInversao: linhas.filter((l) => l.mudaComAInversao).length,
    ucsGeradorasPreservadas: linhas.filter((l) => l.ehUcGeradora).length,
    // Pontos cegos da regra nova de concessionária
    usinasSemConcessionaria: plants.filter((p) => !concessionariaDaPlant(p)).length,
    ucsSemDistribuidora: ucs.filter((u) => !u.distribuidora?.trim()).length,
  };

  const destino = join(process.cwd(), "backups");
  mkdirSync(destino, { recursive: true });

  const jsonPath = join(destino, `uc-plantid-rateio-${dataArg}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        resumo,
        // Tudo o que é preciso para restaurar o estado anterior:
        // UPDATE consumer_units SET plant_id = <plantIdCadastro> WHERE id = <consumerUnitId>
        unidadesConsumidoras: linhas,
        usinas: plants.map((p) => ({ ...p, concessionariaResolvida: concessionariaDaPlant(p) })),
        versoesDeRateio: versoes,
      },
      null,
      2,
    ),
    "utf8",
  );

  const cabecalho = [
    "nome",
    "codigo_uc",
    "consumidor",
    "ativa",
    "origem",
    "distribuidora_uc",
    "usina_cadastro_ANTES",
    "usina_rateio_vigente",
    "percentual",
    "usina_DEPOIS",
    "eh_uc_geradora",
    "situacao",
    "muda_com_a_inversao",
    "faturas",
    "faturamentos",
    "itens_rateio",
    "pagamentos_investidor",
    "consumer_unit_id",
    "plant_id_ANTES",
    "plant_id_DEPOIS",
  ];
  const csv = [
    cabecalho.join(";"),
    ...linhas.map((l) =>
      [
        l.nome,
        l.codigoUc,
        l.consumidor ?? "",
        l.ativa ? "sim" : "nao",
        l.origem,
        l.distribuidoraUc ?? "",
        l.usinaCadastro ?? "",
        l.usinasRateioVigente.join(" | "),
        l.percentuaisRateioVigente.join(" | "),
        l.usinaDepois ?? "",
        l.ehUcGeradora ? "sim" : "nao",
        l.situacao,
        l.mudaComAInversao ? "SIM" : "nao",
        l.historico.bills,
        l.historico.billings,
        l.historico.rateioItems,
        l.historico.investorPayables,
        l.consumerUnitId,
        l.plantIdCadastro ?? "",
        l.plantIdDepois ?? "",
      ]
        // `;` como separador porque nome de UC tem vírgula; aspas dobradas no texto.
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(";"),
    ),
  ].join("\r\n");

  const csvPath = join(destino, `uc-plantid-rateio-${dataArg}.csv`);
  // BOM para o Excel abrir os acentos certos.
  writeFileSync(csvPath, "﻿" + csv, "utf8");

  console.log(JSON.stringify(resumo, null, 2));
  console.log("\nArquivos:");
  console.log("  " + jsonPath);
  console.log("  " + csvPath);
}

main().finally(() => prisma.$disconnect());
