/**
 * Importa a economia mensal do Lumi para `EconomiaHistoricaLumi`.
 *
 * Entrada: planilhas "Listagem de faturamentos" exportadas do Lumi que tenham
 * as colunas "Mês de referência", "Número da UC" e "Economia do Consumidor (R$)".
 * Planilhas sem a coluna de economia são ignoradas (avisando).
 *
 * Regras (19/11/2026, Paulo):
 *  - só entram meses ANTES de dez/2026 (`CORTE_LUMI`); daí em diante vale o sistema;
 *  - não toca em `ConsumerUnitBilling` — as cobranças existentes ficam como estão;
 *  - idempotente: chave UC+ano+mês. Reexportar e rodar de novo ATUALIZA o mês
 *    (é o caso de nov/2026, que estava pela metade na 1ª carga);
 *  - o mesmo mês em dois arquivos com valores diferentes → aborta (não escolhe sozinho);
 *  - UC não encontrada no cadastro → listada e pulada.
 *
 * uso:
 *   npx tsx scripts/importar-economia-lumi.ts <arquivo.xlsx> [mais.xlsx ...]          # só mostra
 *   npx tsx scripts/importar-economia-lumi.ts <arquivo.xlsx> [mais.xlsx ...] --aplicar
 */
import "dotenv/config";
import path from "path";
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma";
import { whereCodigoUc } from "../src/lib/uc-codigo";
import { CORTE_LUMI } from "../src/lib/acumulados";

type Linha = {
  codigo: string;
  nome: string | null;
  ano: number;
  mes: number;
  economia: number;
  devido: number | null;
  arquivo: string;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function valorCelula(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && "result" in v) return (v as { result: unknown }).result;
  return v;
}

async function lerArquivo(arquivo: string): Promise<Linha[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arquivo);
  const ws = wb.worksheets[0];
  let hdrRow = -1;
  let col: Record<string, number> = {};
  ws.eachRow((row, n) => {
    if (hdrRow > 0) return;
    const cab: Record<string, number> = {};
    row.eachCell((c, i) => {
      const t = typeof c.value === "string" ? semAcento(c.value) : "";
      if (t.startsWith("mes de referencia")) cab.mes = i;
      else if (t === "numero da uc") cab.codigo = i;
      else if (t === "nome da uc") cab.nome = i;
      else if (t.startsWith("economia do consumidor")) cab.economia = i;
      else if (t.startsWith("valor devido")) cab.devido = i;
    });
    if (cab.mes && cab.codigo) { hdrRow = n; col = cab; }
  });
  const nomeArq = path.basename(arquivo);
  if (hdrRow < 0 || !col.economia) {
    console.log(`⚠️  ${nomeArq}: sem as colunas "Mês de referência"/"Número da UC"/"Economia do Consumidor" — ignorado`);
    return [];
  }
  const out: Linha[] = [];
  ws.eachRow((row, n) => {
    if (n <= hdrRow) return;
    const mesV = valorCelula(row.getCell(col.mes).value);
    const codV = valorCelula(row.getCell(col.codigo).value);
    if (!(mesV instanceof Date) || codV == null || String(codV).trim() === "") return;
    const eco = Number(valorCelula(row.getCell(col.economia).value) ?? 0);
    const dev = col.devido ? Number(valorCelula(row.getCell(col.devido).value) ?? NaN) : NaN;
    out.push({
      codigo: String(codV).trim(),
      nome: col.nome ? String(valorCelula(row.getCell(col.nome).value) ?? "").replace(/\s+/g, " ").trim() || null : null,
      ano: mesV.getUTCFullYear(),
      mes: mesV.getUTCMonth() + 1,
      economia: Number.isFinite(eco) ? Math.round(eco * 100) / 100 : 0,
      devido: Number.isFinite(dev) ? Math.round(dev * 100) / 100 : null,
      arquivo: nomeArq,
    });
  });
  console.log(`📄 ${nomeArq}: ${out.length} linhas`);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes("--aplicar");
  const arquivos = args.filter((a) => a !== "--aplicar");
  if (!arquivos.length) throw new Error("informe ao menos uma planilha do Lumi");

  const todas = (await Promise.all(arquivos.map(lerArquivo))).flat();
  const corte = CORTE_LUMI.ano * 100 + CORTE_LUMI.mes;
  const depoisDoCorte = todas.filter((l) => l.ano * 100 + l.mes >= corte);
  if (depoisDoCorte.length) console.log(`⏭️  ${depoisDoCorte.length} linhas de dez/2026 em diante ignoradas (vale o sistema)`);

  // Dedup por código+mês; conflito de valor aborta.
  const porChave = new Map<string, Linha>();
  const conflitos: string[] = [];
  for (const l of todas.filter((l) => l.ano * 100 + l.mes < corte)) {
    const k = `${l.codigo}|${l.ano}|${l.mes}`;
    const ja = porChave.get(k);
    if (ja && Math.abs(ja.economia - l.economia) > 0.01) {
      conflitos.push(`${l.codigo} ${l.mes}/${l.ano}: ${ja.arquivo}=${ja.economia} × ${l.arquivo}=${l.economia}`);
    }
    porChave.set(k, l);
  }
  if (conflitos.length) {
    console.log(`⛔ ${conflitos.length} meses com valores diferentes entre arquivos — nada gravado:`);
    conflitos.slice(0, 20).forEach((c) => console.log("   " + c));
    process.exit(1);
  }

  // Casar códigos com UCs (regra única código→UC)
  const codigos = [...new Set([...porChave.values()].map((l) => l.codigo))];
  const ucDe = new Map<string, { id: string; nome: string }>();
  const naoAchadas: string[] = [];
  for (const c of codigos) {
    const uc = await prisma.consumerUnit.findFirst({ where: whereCodigoUc(c), select: { id: true, nome: true } });
    if (uc) ucDe.set(c, uc);
    else naoAchadas.push(c);
  }

  // Duas grafias de código → mesma UC no mesmo mês (ex.: antigo + novo)
  const porUcMes = new Map<string, Linha[]>();
  for (const l of porChave.values()) {
    const uc = ucDe.get(l.codigo);
    if (!uc) continue;
    const k = `${uc.id}|${l.ano}|${l.mes}`;
    porUcMes.set(k, [...(porUcMes.get(k) ?? []), l]);
  }
  const dupUc = [...porUcMes.entries()].filter(([, ls]) => ls.length > 1);
  if (dupUc.length) {
    console.log(`⛔ ${dupUc.length} meses com a mesma UC sob dois códigos no Lumi — nada gravado:`);
    dupUc.slice(0, 20).forEach(([k, ls]) => console.log(`   ${k}: ${ls.map((l) => `${l.codigo}=${l.economia}`).join(" × ")}`));
    process.exit(1);
  }

  // Na simulação, antes da migration, a tabela ainda não existe: conta tudo como novo.
  const existentes = await prisma.economiaHistoricaLumi
    .findMany({
      where: { consumerUnitId: { in: [...new Set([...ucDe.values()].map((u) => u.id))] } },
      select: { consumerUnitId: true, ano: true, mes: true, valorEconomia: true },
    })
    .catch((e) => {
      if (aplicar) throw e;
      console.log("ℹ️  tabela economia_historica_lumi ainda não existe (migration pendente) — tudo conta como novo");
      return [];
    });
  const exMap = new Map(existentes.map((e) => [`${e.consumerUnitId}|${e.ano}|${e.mes}`, e.valorEconomia]));

  let novos = 0, alterados = 0, iguais = 0, total = 0;
  for (const [k, [l]] of porUcMes) {
    total += l.economia;
    const ex = exMap.get(k);
    if (ex == null) novos++;
    else if (Math.abs(ex - l.economia) > 0.005) alterados++;
    else iguais++;
  }

  console.log(`\nUCs casadas: ${new Set([...ucDe.values()].map((u) => u.id)).size} | códigos não encontrados: ${naoAchadas.length}`);
  for (const c of naoAchadas) {
    const ls = [...porChave.values()].filter((l) => l.codigo === c);
    console.log(`   ❓ ${c} ${ls[0]?.nome ?? ""} — ${ls.length} meses, economia R$ ${ls.reduce((s, l) => s + l.economia, 0).toFixed(2)}`);
  }
  console.log(`Meses: ${porUcMes.size} (novos ${novos} · alterados ${alterados} · iguais ${iguais}) · economia R$ ${total.toFixed(2)}`);

  if (!aplicar) {
    console.log("\n(simulação — nada gravado. Rode com --aplicar para gravar.)");
    await prisma.$disconnect();
    return;
  }

  let gravados = 0;
  for (const [k, [l]] of porUcMes) {
    const [consumerUnitId] = k.split("|");
    const data = {
      valorEconomia: l.economia,
      valorDevido: l.devido,
      codigoUcLumi: l.codigo,
      nomeUcLumi: l.nome,
      arquivoOrigem: l.arquivo,
    };
    await prisma.economiaHistoricaLumi.upsert({
      where: { consumerUnitId_ano_mes: { consumerUnitId, ano: l.ano, mes: l.mes } },
      create: { consumerUnitId, ano: l.ano, mes: l.mes, ...data },
      update: data,
    });
    gravados++;
  }
  console.log(`\n✅ gravados ${gravados} meses`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
