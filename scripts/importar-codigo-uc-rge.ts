/**
 * Importa os códigos NOVOS de UC (retorno do robô Python de conversão RGE) e
 * atualiza o banco, preservando o código antigo.
 *
 * Fluxo completo:
 *   1. exportar-codigos-uc-rge.ts  → gera o CSV de entrada do robô
 *   2. robô Python                 → gera resultados_ucs_novas.csv (antigo → novo)
 *   3. ESTE script                 → grava o novo codigoUc no banco
 *
 * Para cada linha com status "Encontrado":
 *   - normaliza o número novo pra dígitos (2.854.319.001-14 → 285431900114);
 *   - acha a ConsumerUnit cujo codigoUc == antigo;
 *   - em --apply: copia codigoUc atual → codigoUcAntigo e grava o novo;
 *     atualiza também CpflCredential.instalacao da mesma UC.
 *
 * Uso:
 *   npx tsx scripts/importar-codigo-uc-rge.ts --csv resultados_ucs_novas.csv           # dry-run (não grava)
 *   npx tsx scripts/importar-codigo-uc-rge.ts --csv resultados_ucs_novas.csv --apply   # grava
 *   npx tsx scripts/importar-codigo-uc-rge.ts --csv resultados_ucs_novas.csv --apply --force  # sobrescreve UCs já migradas
 *
 * Formato do CSV (separador , ou ; ; aceita BOM/utf-8-sig; colunas em qualquer ordem):
 *   antigo,novo,status[,cliente]
 *   3095752769,2.854.319.001-14,Encontrado,Victor
 *
 * ⚠️ DECISÃO DE FORMATO: o codigoUc novo é gravado só com DÍGITOS (sem pontos/traço),
 *    pra manter o padrão atual do campo e o casamento de faturas por codigoInstalacao.
 *    Confirme com 1 fatura de julho antes de rodar --force em massa.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const csvIdx = process.argv.indexOf("--csv");
const CSV_PATH = csvIdx >= 0 ? process.argv[csvIdx + 1] : null;

/** Só dígitos: "2.854.319.001-14" → "285431900114". */
function soDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Parser CSV simples com suporte a aspas, BOM e delimitador , ou ;. */
function parseCsv(raw: string): Record<string, string>[] {
  const text = raw.replace(/^﻿/, ""); // remove BOM
  const linhas = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length === 0) return [];

  // Detecta delimitador pela linha de cabeçalho
  const header = linhas[0];
  const delim = (header.match(/;/g)?.length ?? 0) >= (header.match(/,/g)?.length ?? 0) ? ";" : ",";

  const splitLinha = (linha: string): string[] => {
    const campos: string[] = [];
    let atual = "";
    let dentroAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"') {
        if (dentroAspas && linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentroAspas = !dentroAspas;
        }
      } else if (ch === delim && !dentroAspas) {
        campos.push(atual);
        atual = "";
      } else {
        atual += ch;
      }
    }
    campos.push(atual);
    return campos.map((c) => c.trim());
  };

  const colunas = splitLinha(header).map((c) => c.toLowerCase());
  return linhas.slice(1).map((linha) => {
    const valores = splitLinha(linha);
    const obj: Record<string, string> = {};
    colunas.forEach((col, i) => {
      obj[col] = valores[i] ?? "";
    });
    return obj;
  });
}

interface Plano {
  antigo: string;
  novoRaw: string;
  novoDigitos: string;
  status: string;
  ucId: string;
  ucNome: string;
}

async function main() {
  if (!CSV_PATH) {
    console.error("Erro: informe o CSV com --csv <arquivo>");
    process.exit(1);
  }

  const raw = readFileSync(resolve(CSV_PATH), "utf-8");
  const registros = parseCsv(raw);
  console.log(`Linhas no CSV: ${registros.length}`);

  const aAplicar: Plano[] = [];
  const naoCasadas: { antigo: string; novo: string }[] = [];
  const conflitos: { antigo: string; novoDigitos: string; donoAtual: string }[] = [];
  const jaAtualizadas: { antigo: string; ucNome: string }[] = [];
  const pendentes: { antigo: string; status: string }[] = []; // status != Encontrado / sem novo
  const jaMigradasSemForce: { antigo: string; ucNome: string }[] = [];

  for (const reg of registros) {
    const antigo = soDigitos(reg["antigo"] ?? "");
    const novoRaw = (reg["novo"] ?? "").trim();
    const novoDigitos = soDigitos(novoRaw);
    const status = (reg["status"] ?? "").trim();

    if (!antigo) continue;

    // Sem número novo válido → pendente (não encontrado / inválido / erro / timeout)
    if (!novoDigitos) {
      pendentes.push({ antigo, status: status || "sem número novo" });
      continue;
    }

    const uc = await prisma.consumerUnit.findUnique({
      where: { codigoUc: antigo },
      select: { id: true, nome: true, codigoUc: true, codigoUcAntigo: true },
    });

    // codigoUc == antigo não achou? Talvez já foi migrada (codigoUc == novo).
    if (!uc) {
      const jaNovo = await prisma.consumerUnit.findUnique({
        where: { codigoUc: novoDigitos },
        select: { nome: true },
      });
      if (jaNovo) {
        jaAtualizadas.push({ antigo, ucNome: jaNovo.nome });
      } else {
        naoCasadas.push({ antigo, novo: novoRaw });
      }
      continue;
    }

    // A UC ainda está no código antigo. Confere se o novo já pertence a outra UC.
    const conflito = await prisma.consumerUnit.findUnique({
      where: { codigoUc: novoDigitos },
      select: { id: true, nome: true },
    });
    if (conflito && conflito.id !== uc.id) {
      conflitos.push({ antigo, novoDigitos, donoAtual: conflito.nome });
      continue;
    }

    // Já tem codigoUcAntigo preenchido = já foi migrada antes; sem --force, protege.
    if (uc.codigoUcAntigo && !FORCE) {
      jaMigradasSemForce.push({ antigo, ucNome: uc.nome });
      continue;
    }

    aAplicar.push({
      antigo,
      novoRaw,
      novoDigitos,
      status,
      ucId: uc.id,
      ucNome: uc.nome,
    });
  }

  // ─── Relatório ────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESUMO ${APPLY ? "(APLICANDO)" : "(DRY-RUN — nada gravado)"}`);
  console.log("=".repeat(60));
  console.log(`  A atualizar:            ${aAplicar.length}`);
  console.log(`  Já atualizadas (skip):  ${jaAtualizadas.length}`);
  console.log(`  Já migradas (sem force):${jaMigradasSemForce.length}`);
  console.log(`  Não casadas:            ${naoCasadas.length}`);
  console.log(`  Conflito unicidade:     ${conflitos.length}`);
  console.log(`  Pendentes (sem novo):   ${pendentes.length}`);

  if (aAplicar.length) {
    console.log(`\n── A atualizar ──`);
    aAplicar.forEach((p) =>
      console.log(`   ${p.antigo} → ${p.novoDigitos}  (${p.novoRaw})  [${p.ucNome}]`),
    );
  }
  if (conflitos.length) {
    console.log(`\n── ⚠️ Conflito de unicidade (novo já usado por outra UC) ──`);
    conflitos.forEach((c) =>
      console.log(`   ${c.antigo} → ${c.novoDigitos} já pertence a "${c.donoAtual}"`),
    );
  }
  if (naoCasadas.length) {
    console.log(`\n── ⚠️ Não casadas (nenhuma UC com esse codigoUc antigo) ──`);
    naoCasadas.forEach((n) => console.log(`   ${n.antigo} (novo seria ${n.novo})`));
  }
  if (jaMigradasSemForce.length) {
    console.log(`\n── ⏭️ Já migradas antes — use --force pra sobrescrever ──`);
    jaMigradasSemForce.forEach((j) => console.log(`   ${j.antigo} [${j.ucNome}]`));
  }
  if (pendentes.length) {
    console.log(`\n── ⏭️ Pendentes (robô não achou o novo) ──`);
    pendentes.forEach((p) => console.log(`   ${p.antigo}: ${p.status}`));
  }

  if (!APPLY) {
    console.log(`\nDry-run. Rode com --apply pra gravar as ${aAplicar.length} atualização(ões).`);
    return;
  }

  // ─── Aplicação ────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}\nAplicando ${aAplicar.length} atualização(ões)...\n${"=".repeat(60)}`);
  let ok = 0;
  const falhas: { antigo: string; erro: string }[] = [];

  for (const p of aAplicar) {
    try {
      await prisma.$transaction([
        prisma.consumerUnit.update({
          where: { id: p.ucId },
          data: { codigoUcAntigo: p.antigo, codigoUc: p.novoDigitos },
        }),
        // Mantém a credencial em sincronia (instalacao == codigoUc).
        prisma.cpflCredential.updateMany({
          where: { consumerUnitId: p.ucId, distribuidora: "RGE" },
          data: { instalacao: p.novoDigitos },
        }),
      ]);
      ok++;
      console.log(`   ✅ ${p.antigo} → ${p.novoDigitos} [${p.ucNome}]`);
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      falhas.push({ antigo: p.antigo, erro });
      console.log(`   ❌ ${p.antigo} [${p.ucNome}]: ${erro}`);
    }
  }

  console.log(`\n✅ ${ok} atualizada(s). ${falhas.length ? `❌ ${falhas.length} falha(s).` : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
