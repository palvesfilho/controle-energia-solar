/**
 * Exporta as UCs da RGE (código antigo + credencial de login) para o robô
 * Python de conversão de código de instalação.
 *
 * Contexto: a RGE trocou o código de instalação de todas as UCs (vale a partir
 * de jul/2026). O robô Selenium loga no portal por cliente, busca o código
 * ANTIGO e devolve o NOVO. Este script gera o CSV de entrada desse robô a partir
 * do banco — cada linha traz email/senha (descriptografada) + o codigoUc atual.
 *
 * A volta (resultados do robô → banco) é feita por importar-codigo-uc-rge.ts.
 *
 * Uso:
 *   npx tsx scripts/exportar-codigos-uc-rge.ts                       # gera codigos_antigos_rge.csv
 *   npx tsx scripts/exportar-codigos-uc-rge.ts --out entrada.csv     # caminho custom
 *   npx tsx scripts/exportar-codigos-uc-rge.ts --limit 2             # só 2 UCs (teste)
 *
 * Saída (separador ; ; campos com caractere especial vêm entre aspas):
 *   email;senha;codigoUc;nome;consumerUnitId
 *
 * ⚠️ O CSV contém SENHAS EM TEXTO PURO. Trate como segredo: não versione, não
 *    suba pro Git, apague depois de rodar o robô.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";

const outIdx = process.argv.indexOf("--out");
const OUT_PATH = outIdx >= 0 ? process.argv[outIdx + 1] : "codigos_antigos_rge.csv";
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : null;

/** Escapa um campo pro CSV: aspas se contiver ; , " ou quebra de linha. */
function csvField(value: string): string {
  if (/[;,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function main() {
  const creds = await prisma.cpflCredential.findMany({
    where: {
      distribuidora: "RGE",
      active: true,
      consumerUnitId: { not: null },
    },
    include: {
      consumerUnit: {
        select: { id: true, nome: true, codigoUc: true },
      },
    },
    orderBy: { emailCpfl: "asc" },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  console.log(`Credenciais RGE ativas com UC: ${creds.length}`);

  const rows: string[] = ["email;senha;codigoUc;nome;consumerUnitId"];
  let exportadas = 0;
  const pulos: string[] = [];
  const divergencias: string[] = [];

  for (const c of creds) {
    const uc = c.consumerUnit;
    if (!uc) continue;

    const codigo = (uc.codigoUc ?? "").trim();
    if (!codigo) {
      pulos.push(`${uc.nome}: sem codigoUc`);
      continue;
    }

    // Sinaliza (não bloqueia) quando o codigoUc da UC diverge da instalacao da
    // credencial — os dois deveriam andar juntos. O robô converte pelo codigoUc.
    const instalacao = (c.instalacao ?? "").trim();
    if (instalacao && instalacao !== codigo) {
      divergencias.push(`${uc.nome}: codigoUc=${codigo} vs instalacao=${instalacao}`);
    }

    let senha: string;
    try {
      senha = decrypt(c.senhaCpfl);
    } catch {
      pulos.push(`${uc.nome} (${codigo}): falha ao descriptografar senha`);
      continue;
    }

    rows.push(
      [
        csvField(c.emailCpfl),
        csvField(senha),
        csvField(codigo),
        csvField(uc.nome),
        csvField(uc.id),
      ].join(";"),
    );
    exportadas++;
  }

  const outFull = resolve(OUT_PATH);
  writeFileSync(outFull, rows.join("\n") + "\n", { encoding: "utf-8" });

  console.log(`\n✅ ${exportadas} UC(s) exportada(s) para: ${outFull}`);

  const logins = new Set(
    rows.slice(1).map((r) => r.split(";")[0]),
  );
  console.log(`   Logins distintos (o robô agrupa por login): ${logins.size}`);

  if (divergencias.length) {
    console.log(`\n⚠️  ${divergencias.length} divergência(s) codigoUc × instalacao (exportadas pelo codigoUc):`);
    divergencias.forEach((d) => console.log(`   - ${d}`));
  }

  if (pulos.length) {
    console.log(`\n⏭️  ${pulos.length} pulada(s):`);
    pulos.forEach((p) => console.log(`   - ${p}`));
  }

  console.log(
    `\n⚠️  ${OUT_PATH} contém senhas em texto puro — não versione e apague após usar.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
