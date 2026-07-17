/**
 * Importa contratos Dommo (gestão/intermediação de usina) pro banco.
 *
 * Cria/atualiza, por contrato:
 *   - User (placeholder de email — Paulo edita depois)
 *   - Investor (chave de dedup: CPF ou CNPJ)
 *   - Plant (1 por investidor; usinaDeInvestidor=false)
 *   - InvestorPlant (link com valorKwhContrato + gestaoFixaContrato)
 *   - InvestorContract (PDF no R2 + cláusulas extraídas)
 *
 * Modos:
 *   --dry-run (default) → roda parser, monta payloads, imprime, NÃO grava
 *   --apply             → grava de verdade no DB + R2
 *
 * Uso:
 *   npx tsx scripts/import-contratos-dommo.ts            # dry-run nos 9 mapeados
 *   npx tsx scripts/import-contratos-dommo.ts --apply    # grava nos 9
 *
 * Os 9 PDFs são localizados em C:\Users\thoma\Downloads via wildcard (acentos
 * no nome do arquivo quebram path literal no Windows).
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { parseContratoDommo } from "../src/lib/contrato-dommo-parser";
import { saveBufferToStorage } from "../src/lib/file-storage";

const prisma = new PrismaClient();

interface ContractSource {
  /** ID curto pra log */
  id: string;
  /** Pattern de match no nome do arquivo (case-insensitive, lowercase) */
  match: (lowername: string) => boolean;
  /** Pasta dentro de Downloads onde procurar; vazio = Downloads raiz */
  subdir?: string;
}

const DOWNLOADS = join(homedir(), "Downloads");

// Lista de contratos a importar nesta rodada. A função `match` é um
// predicado sobre o nome do arquivo (lowercase) que identifica unicamente
// o contrato. Quando há ambiguidade (Andreia vs Fernando Escobar; Dommo
// Investidor X vs simplesmente X), o match desambigua.
//
// Os 9 da Fase 1 (2026-06-28) estão comentados — já estão em prod. Pra
// re-importar (não faça isso sem antes deletar os anteriores!), descomente.
const SOURCES: ContractSource[] = [
  // --- Fase 1 (2026-06-28, já importados) ---
  // { id: "01_andreia",      match: (n) => n.includes("contrato_dommo_") && n.includes("escobar") && !n.includes("fernando") },
  // { id: "02_fernando",     match: (n) => n.includes("contrato_dommo_fernando_escobar") },
  // { id: "03_maria_pitol",  match: (n) => n.includes("contrato_dommo_maria_eduarda_pitol") },
  // { id: "04_odair",        match: (n) => n.includes("contrato_dommo_odair_vendrame") },
  // { id: "05_dinara",       match: (n) => n.includes("contrato_dommo_investidor_dinara") && n.includes("clicksign") },
  // { id: "06_becker_brum",  match: (n) => n.includes("contrato_dommo_investidor_becker_brum") && n.includes("clicksign") },
  // { id: "07_vitor_bolzan", match: (n) => n.includes("contrato_dommo_vitor_bolzan") && n.includes("clicksign") },
  // { id: "08_lucio",        match: (n) => n.includes("contrato_dommo_") && n.includes("antunes") },
  // { id: "09_giacomeli",    match: (n) => n.includes("contrato_dommo_giacomeli_1") && n.includes("clicksign") },

  // --- Fase 2 ---
  // 10_b5 PULADO — B5 PARTICIPACOES é LOCATÁRIO num "CONTRATO DE LOCAÇÃO DE
  // USINA FOTOVOLTAICA" (template diferente — Dommo é LOCADOR, dona da
  // usina); não é contrato de investidor.
  // { id: "10_b5",        match: (n) => n.includes("contrato dommo") && n.includes("b5 participa") },
  { id: "11_claudiomar", match: (n) => n.includes("contrato_dommo_claudiomar") && n.includes("clicksign") },
  { id: "12_alexandre",  match: (n) => n.includes("contrato_dommo_investidor_alexandre") },
  { id: "13_renan",      match: (n) => n.includes("contrato_dommo_renan_vendrame") },
  { id: "14_william",    match: (n) => n.includes("contrato_dommo_william") },
];

/** Slug ASCII-only, lowercase, sem espaços. Usado pra placeholder de email. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function findSourceFile(src: ContractSource): Promise<string | null> {
  const entries = await readdir(DOWNLOADS, { withFileTypes: true, recursive: true });
  const candidates: Array<{ path: string; mtime: number }> = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const lower = e.name.toLowerCase();
    if (!lower.endsWith(".pdf")) continue;
    if (!src.match(lower)) continue;
    // Reconstruir path completo. e.parentPath é a feature nova do Node 20+.
    const parent = (e as unknown as { parentPath?: string }).parentPath ?? DOWNLOADS;
    const full = join(parent, e.name);
    const stat = await import("node:fs/promises").then((m) => m.stat(full));
    candidates.push({ path: full, mtime: stat.mtimeMs });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime); // mais recente primeiro
  return candidates[0].path;
}

interface ResolvedPayload {
  sourceId: string;
  sourcePath: string;
  cleanFileName: string;
  // O que vai no DB
  user: { email: string; name: string };
  investor: {
    cpf: string | null;
    cnpj: string | null;
    nomeEmpresa: string | null;
    endereco: string | null;
    numero: string | null;
    cidade: string | null;
    cep: string | null;
  };
  plant: { name: string };
  investorPlant: {
    valorKwhContrato: number | null;
    gestaoFixaContrato: number | null;
  };
  contract: {
    dataAssinatura: Date | null;
    prazoMeses: number | null;
    marcoInicioPrazo: string | null;
    antecedenciaRescisaoDias: number | null;
    foro: string | null;
    observacoes: string | null;
  };
  warnings: string[];
}

async function resolvePayload(src: ContractSource): Promise<ResolvedPayload | { error: string; sourceId: string }> {
  const path = await findSourceFile(src);
  if (!path) return { error: "arquivo não localizado no Downloads", sourceId: src.id };

  const buf = await readFile(path);
  const u8 = new Uint8Array(buf.byteLength);
  u8.set(buf);
  const ext = await parseContratoDommo(u8);
  const c = ext.contratante;

  const isPJ = c.tipo === "PJ";
  const nomeInvestidor = isPJ ? (c.nome ?? "—") : (c.nome ?? "—");
  const emailSlug = slugify(nomeInvestidor);

  // Split endereço em rua/número. Remove prefixos "número/NÚMERO/N°/nº" do
  // número porque o contrato escreve "rua X, número Y" mas no DB queremos
  // só o "Y". Variações como "S/N" e "INTERIOR" passam intactas.
  let rua: string | null = null;
  let numero: string | null = null;
  if (c.endereco) {
    const parts = c.endereco.split(",").map((s) => s.trim());
    rua = parts[0] ?? null;
    const numeroRaw = parts.slice(1).join(", ") || null;
    numero = numeroRaw
      ? numeroRaw.replace(/^(?:n[uú]mero|n[°ºo.]?)\s+/i, "").trim() || null
      : null;
  }

  // Observação textual com o que ficou de fora
  const obsParts: string[] = [];
  if (c.socioRepresentante) obsParts.push(`Sócio representante: ${c.socioRepresentante}`);
  if (ext.potenciaInstaladaKwp != null) obsParts.push(`Potência instalada: ${ext.potenciaInstaladaKwp} kWp`);
  if (ext.geracaoMediaMensalKwh != null) obsParts.push(`Geração média esperada: ${ext.geracaoMediaMensalKwh} kWh/mês`);
  const observacoes = obsParts.length ? obsParts.join(" | ") : null;

  // Nome de arquivo limpo pro R2
  const cleanFileName = `${src.id}_${emailSlug}.pdf`;

  return {
    sourceId: src.id,
    sourcePath: path,
    cleanFileName,
    user: {
      email: `${emailSlug}@sem-email.dommo.local`,
      name: nomeInvestidor,
    },
    investor: {
      cpf: c.cpf,
      cnpj: c.cnpj,
      nomeEmpresa: isPJ ? c.nome : null,
      endereco: rua,
      numero,
      cidade: c.cidade,
      cep: c.cep,
    },
    plant: { name: nomeInvestidor },
    investorPlant: {
      valorKwhContrato: ext.valorKwh,
      gestaoFixaContrato: ext.gestaoFixaMensal,
    },
    contract: {
      dataAssinatura: ext.dataAssinatura,
      prazoMeses: ext.prazoMeses,
      marcoInicioPrazo: ext.marcoInicioPrazo,
      antecedenciaRescisaoDias: ext.antecedenciaRescisaoDias,
      foro: ext.foro,
      observacoes,
    },
    warnings: ext.warnings,
  };
}

async function applyOne(p: ResolvedPayload): Promise<void> {
  // 1) Dedup por CPF/CNPJ — se já existe Investor, reaproveita.
  let existingInvestor = null as null | { id: string; userId: string };
  if (p.investor.cpf) {
    existingInvestor = await prisma.investor.findFirst({
      where: { cpf: p.investor.cpf },
      select: { id: true, userId: true },
    });
  }
  if (!existingInvestor && p.investor.cnpj) {
    existingInvestor = await prisma.investor.findFirst({
      where: { cnpj: p.investor.cnpj },
      select: { id: true, userId: true },
    });
  }

  let userId: string;
  let investorId: string;

  if (existingInvestor) {
    userId = existingInvestor.userId;
    investorId = existingInvestor.id;
    console.log(`[${p.sourceId}] reutilizando Investor existente (${investorId})`);
  } else {
    const user = await prisma.user.create({
      data: {
        email: p.user.email,
        name: p.user.name,
        passwordHash: "", // placeholder; Clerk gerencia auth
        role: "INVESTOR",
        active: false, // ativa quando Paulo completar email + Clerk
      },
    });
    userId = user.id;
    const investor = await prisma.investor.create({
      data: {
        userId,
        cpf: p.investor.cpf,
        cnpj: p.investor.cnpj,
        nomeEmpresa: p.investor.nomeEmpresa,
        endereco: p.investor.endereco,
        numero: p.investor.numero,
        cidade: p.investor.cidade,
        cep: p.investor.cep,
      },
    });
    investorId = investor.id;
    console.log(`[${p.sourceId}] criou User+Investor (${investorId})`);
  }

  // 2) Plant — sempre cria uma nova (não há chave natural de dedup pra usina
  // não-ativada). Se o investidor já tinha Plant, esta é uma 2ª usina.
  const plant = await prisma.plant.create({
    data: {
      name: p.plant.name,
      usinaDeInvestidor: false,
    },
  });

  // 3) InvestorPlant (link)
  const ip = await prisma.investorPlant.create({
    data: {
      investorId,
      plantId: plant.id,
      valorKwhContrato: p.investorPlant.valorKwhContrato,
      gestaoFixaContrato: p.investorPlant.gestaoFixaContrato,
    },
  });

  // 4) Upload PDF pro R2
  const pdfBuffer = await readFile(p.sourcePath);
  const saved = await saveBufferToStorage(
    pdfBuffer,
    `documents/investor-contracts/${investorId}`,
    p.cleanFileName,
  );

  // 5) InvestorContract
  await prisma.investorContract.create({
    data: {
      investorPlantId: ip.id,
      url: saved.relativePath,
      fileName: p.cleanFileName,
      size: pdfBuffer.length,
      dataAssinatura: p.contract.dataAssinatura,
      prazoMeses: p.contract.prazoMeses,
      marcoInicioPrazo: p.contract.marcoInicioPrazo,
      antecedenciaRescisaoDias: p.contract.antecedenciaRescisaoDias,
      foro: p.contract.foro,
      observacoes: p.contract.observacoes,
    },
  });

  console.log(`[${p.sourceId}] OK — Plant=${plant.id}, PDF=${saved.relativePath}`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply) {
    console.log("⚠️  MODO APPLY — gravando em DB de produção + R2\n");
  } else {
    console.log("ℹ️  MODO DRY-RUN — nada será gravado\n");
  }

  const payloads: ResolvedPayload[] = [];
  const errors: Array<{ sourceId: string; error: string }> = [];

  for (const src of SOURCES) {
    const r = await resolvePayload(src);
    if ("error" in r) {
      errors.push(r);
      console.error(`[${r.sourceId}] ERRO: ${r.error}`);
    } else {
      payloads.push(r);
    }
  }

  console.log(`\nResolvidos: ${payloads.length}/${SOURCES.length}\n`);

  for (const p of payloads) {
    console.log(`=== ${p.sourceId} :: ${p.sourcePath.split(/[\\/]/).pop()} ===`);
    console.log(JSON.stringify(
      {
        user: p.user,
        investor: p.investor,
        plant: p.plant,
        investorPlant: p.investorPlant,
        contract: {
          ...p.contract,
          dataAssinatura: p.contract.dataAssinatura?.toISOString().slice(0, 10) ?? null,
        },
        targetR2Path: `documents/investor-contracts/<investorId>/${p.cleanFileName}`,
      },
      null,
      2,
    ));
    if (p.warnings.length) {
      console.log("⚠️  warnings:", p.warnings.join("; "));
    }
    console.log("");
  }

  if (errors.length) {
    console.error(`\n❌ ${errors.length} arquivos não localizados — abortando antes do apply.`);
    process.exit(1);
  }

  if (apply) {
    console.log("\n--- Aplicando ---\n");
    for (const p of payloads) {
      try {
        await applyOne(p);
      } catch (e) {
        console.error(`[${p.sourceId}] FALHOU:`, e instanceof Error ? e.message : e);
        throw e;
      }
    }
    console.log("\n✅ Importação concluída");
  } else {
    console.log("\nPra aplicar de verdade, rode com --apply");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
