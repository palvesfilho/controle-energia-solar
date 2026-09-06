/**
 * Lê a planilha preenchida por `exporta-pendencias-cadastro.ts` e grava.
 *
 * 🧯 **Simulação por padrão.** Sem `--aplicar` nada é escrito: a saída mostra
 * linha a linha o que entraria, o que seria recusado e por quê. Com
 * `--aplicar`, um CSV de backup é gravado ANTES de qualquer update.
 *
 * 📏 **Célula vazia significa "não mexer".** Nada é apagado por estar em
 * branco — devolver a planilha pela metade é um caminho previsto, não um
 * acidente. E nada é sobrescrito em silêncio: quando o cadastro já tem valor
 * diferente do digitado, a troca aparece como "TROCA" na saída.
 *
 * 🚫 **Telefone é validado antes de gravar.** Fixo, DDD inexistente ou dígito
 * a menos são recusados aqui — gravar um número que a Uazapi vai rejeitar
 * troca "sem telefone" (que a trava mostra na tela) por "telefone que não
 * funciona" (que ninguém vê até a cobrança sair muda).
 *
 * Uso:
 *   npx tsx scripts/importa-pendencias-cadastro.ts [arquivo.xlsx]
 *   npx tsx scripts/importa-pendencias-cadastro.ts [arquivo.xlsx] --aplicar
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { normalizarTelefoneBR } from "../src/lib/uc-trava-contato";
import { apenasDigitos, formatCpfCnpj } from "../src/lib/documento";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
const ARQUIVO =
  process.argv.slice(2).find((a) => a.toLowerCase().endsWith(".xlsx")) ||
  "D:/PROJETOS_CLAUDE/GESTOR_CREDITOS/pendencias-cadastro.xlsx";

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

interface Alteracao {
  consumerId: string;
  nome: string;
  campo: "phone" | "email" | "cpfCnpj";
  de: string;
  para: string;
}

const alteracoes: Alteracao[] = [];
const recusas: string[] = [];
const decisoes: string[] = [];

/** ExcelJS devolve número, string, ou objeto de fórmula/rich text. */
function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("").trim();
    if (typeof o.text === "string") return o.text.trim();
    if (o.result !== undefined) return String(o.result).trim();
    return "";
  }
  return String(v).trim();
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ARQUIVO);
  console.log(`Lendo ${ARQUIVO}`);
  console.log(`Abas: ${wb.worksheets.map((w) => w.name).join(", ")}\n`);

  const ids = new Set<string>();
  for (const aba of ["TELEFONES", "EMAILS", "DOCUMENTOS"]) {
    const ws = wb.getWorksheet(aba);
    if (!ws) continue;
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const id = texto(row.getCell(1).value);
      if (id) ids.add(id);
    });
  }
  const clientes = await prisma.consumer.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, email: true, phone: true, cpfCnpj: true, document: true },
  });
  const porId = new Map(clientes.map((c) => [c.id, c]));

  // ── TELEFONES ─────────────────────────────────────────────────────────────
  const wsTel = wb.getWorksheet("TELEFONES");
  if (wsTel) {
    wsTel.eachRow((row, n) => {
      if (n === 1) return;
      const id = texto(row.getCell(1).value);
      const nome = texto(row.getCell(2).value);
      const bruto = texto(row.getCell(6).value);
      if (!id || !bruto) return;
      const c = porId.get(id);
      if (!c) { recusas.push(`  TELEFONES linha ${n}: consumerId "${id}" não existe (${nome})`); return; }
      const tel = normalizarTelefoneBR(bruto);
      if (!tel.e164) {
        recusas.push(`  TELEFONES linha ${n}: "${bruto}" recusado (${tel.motivo}) — ${c.name}`);
        return;
      }
      // Guardado em dígitos crus, como os ~60 cadastros que já existem, e não
      // em E.164 — duas convenções na mesma coluna não ajudam ninguém.
      const novo = apenasDigitos(bruto);
      if (apenasDigitos(c.phone) === novo) return;
      alteracoes.push({ consumerId: id, nome: c.name, campo: "phone", de: c.phone ?? "", para: novo });
    });
  }

  // ── EMAILS ────────────────────────────────────────────────────────────────
  const wsMail = wb.getWorksheet("EMAILS");
  if (wsMail) {
    wsMail.eachRow((row, n) => {
      if (n === 1) return;
      const id = texto(row.getCell(1).value);
      const bruto = texto(row.getCell(5).value).toLowerCase();
      if (!id || !bruto) return;
      const c = porId.get(id);
      if (!c) { recusas.push(`  EMAILS linha ${n}: consumerId "${id}" não existe`); return; }
      if (!EMAIL_RE.test(bruto)) { recusas.push(`  EMAILS linha ${n}: "${bruto}" não parece email — ${c.name}`); return; }
      if ((c.email ?? "").trim().toLowerCase() === bruto) return;
      alteracoes.push({ consumerId: id, nome: c.name, campo: "email", de: c.email ?? "", para: bruto });
    });
  }

  // ── DOCUMENTOS ────────────────────────────────────────────────────────────
  const wsDoc = wb.getWorksheet("DOCUMENTOS");
  if (wsDoc) {
    wsDoc.eachRow((row, n) => {
      if (n === 1) return;
      const id = texto(row.getCell(1).value);
      const bruto = texto(row.getCell(5).value);
      if (!id || !bruto) return;
      const c = porId.get(id);
      if (!c) { recusas.push(`  DOCUMENTOS linha ${n}: consumerId "${id}" não existe`); return; }
      const d = apenasDigitos(bruto);
      // 11 ou 14 dígitos, nada no meio. Documento com dígito faltando produz um
      // número plausível e errado, que é pior que o campo vazio.
      if (d.length !== 11 && d.length !== 14) {
        recusas.push(`  DOCUMENTOS linha ${n}: "${bruto}" tem ${d.length} dígitos (esperado 11 ou 14) — ${c.name}`);
        return;
      }
      const novo = formatCpfCnpj(d);
      if (apenasDigitos(c.cpfCnpj) === d) return;
      alteracoes.push({ consumerId: id, nome: c.name, campo: "cpfCnpj", de: c.cpfCnpj ?? "", para: novo });
    });
  }

  // ── DECISOES ──────────────────────────────────────────────────────────────
  // Aqui o script NÃO age: apagar cadastro e mexer em documento de outro
  // módulo são coisas que eu leio e trago para conversa, não que um import
  // executa a partir de uma célula de texto.
  const wsDec = wb.getWorksheet("DECISOES");
  if (wsDec) {
    wsDec.eachRow((row, n) => {
      if (n === 1) return;
      const resposta = texto(row.getCell(5).value);
      if (!resposta) return;
      decisoes.push(`  ${texto(row.getCell(2).value)} | ${texto(row.getCell(3).value).slice(0, 60)}… → "${resposta}"`);
    });
  }

  // ── Saída ─────────────────────────────────────────────────────────────────
  console.log(`${"CLIENTE".padEnd(40)} ${"CAMPO".padEnd(9)} ${"DE".padEnd(26)} PARA`);
  console.log("─".repeat(108));
  for (const a of alteracoes) {
    const de = a.de || "(vazio)";
    console.log(
      `${a.nome.slice(0, 39).padEnd(40)} ${a.campo.padEnd(9)} ${de.slice(0, 25).padEnd(26)} ${a.para}${a.de ? "   ← TROCA" : ""}`,
    );
  }
  console.log("─".repeat(108));
  console.log(`Alterações: ${alteracoes.length}`);
  for (const campo of ["phone", "email", "cpfCnpj"] as const) {
    console.log(`  ${campo.padEnd(8)}: ${alteracoes.filter((a) => a.campo === campo).length}`);
  }
  if (recusas.length) {
    console.log(`\nRECUSADAS (${recusas.length}):`);
    for (const r of recusas) console.log(r);
  }
  if (decisoes.length) {
    console.log(`\nRESPOSTAS NA ABA DECISOES (${decisoes.length}) — não são aplicadas por este script:`);
    for (const d of decisoes) console.log(d);
  }

  if (!APLICAR) {
    console.log("\nSIMULAÇÃO — nada foi gravado. Rode com --aplicar para valer.");
    return;
  }
  if (alteracoes.length === 0) {
    console.log("\nNada a gravar.");
    return;
  }

  const backup = ["consumerId;nome;campo;valor_antes;valor_depois"];
  for (const a of alteracoes) backup.push([a.consumerId, a.nome, a.campo, a.de, a.para].join(";"));
  const nomeBackup = `backup-pendencias-cadastro-${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(nomeBackup, "\uFEFF" + backup.join("\n"), "utf8");
  console.log(`\nBackup: ${nomeBackup}`);

  const porCliente = new Map<string, Record<string, string>>();
  for (const a of alteracoes) {
    const d = porCliente.get(a.consumerId) ?? {};
    d[a.campo] = a.para;
    porCliente.set(a.consumerId, d);
  }
  for (const [id, data] of porCliente) {
    await prisma.consumer.update({ where: { id }, data });
  }
  console.log(`${porCliente.size} cliente(s) atualizados, ${alteracoes.length} campo(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
