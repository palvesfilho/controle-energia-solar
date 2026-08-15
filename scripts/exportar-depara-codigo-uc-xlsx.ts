/**
 * Exporta em XLSX o de-para dos códigos de instalação da RGE:
 * código ANTIGO (antes da migração de jul/2026) → código NOVO.
 *
 * Lê os 4 cadastros que guardam `codigoUcAntigo`:
 *   ConsumerUnit             → UCs do fluxo investidor / Brasil Solar
 *   BrasilSolarClient        → clientes BS (usina própria)
 *   BrasilSolarProprietario  → proprietários BS (Anexo F)
 *   BrasilSolarBeneficiaria  → beneficiárias BS do rateio
 *
 * Gera 2 abas:
 *   "De-para"        → só quem TEM código antigo gravado (a migração feita)
 *   "Sem código antigo" → cadastros sem de-para, pra saber o que ainda falta
 *
 * Somente leitura — não grava nada no banco.
 *
 * Uso:
 *   npx tsx scripts/exportar-depara-codigo-uc-xlsx.ts
 *   npx tsx scripts/exportar-depara-codigo-uc-xlsx.ts --out "D:/caminho/depara.xlsx"
 */
import "dotenv/config";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma";

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
};

const OUT_PATH = arg("--out") ?? "depara-codigo-uc-rge.xlsx";

/**
 * Formata o código de instalação como a RGE exibe.
 * 12 dígitos (novo): 285431900114 → 2.854.319.001-14
 * 10 dígitos (antigo): 3095752769 → 3095752769 (a RGE não pontua o antigo)
 */
function formatar(codigo: string | null | undefined): string {
  const d = String(codigo ?? "").replace(/\D/g, "");
  if (d.length === 12) {
    return `${d.slice(0, 1)}.${d.slice(1, 4)}.${d.slice(4, 7)}.${d.slice(7, 10)}-${d.slice(10)}`;
  }
  return d;
}

interface Linha {
  cadastro: string;
  cliente: string;
  cpfCnpj: string;
  antigo: string;
  novo: string;
  concessionaria: string;
  observacao: string;
}

async function main() {
  const [ucs, clientes, proprietarios, beneficiarias] = await Promise.all([
    prisma.consumerUnit.findMany({
      select: {
        nome: true,
        cpfCnpj: true,
        codigoUc: true,
        codigoUcAntigo: true,
        distribuidora: true,
        origem: true,
        active: true,
      },
      orderBy: { nome: "asc" },
    }),
    prisma.brasilSolarClient.findMany({
      select: {
        nome: true,
        cpfCnpj: true,
        codigoUc: true,
        codigoUcAntigo: true,
        concessionaria: true,
      },
      orderBy: { nome: "asc" },
    }),
    prisma.brasilSolarProprietario.findMany({
      select: {
        nome: true,
        cpfCnpj: true,
        codigoUc: true,
        codigoUcAntigo: true,
        concessionaria: true,
      },
      orderBy: { nome: "asc" },
    }),
    prisma.brasilSolarBeneficiaria.findMany({
      select: {
        nome: true,
        codigoUc: true,
        codigoUcAntigo: true,
        proprietario: { select: { nome: true, concessionaria: true } },
      },
      orderBy: { codigoUc: "asc" },
    }),
  ]);

  const todas: Linha[] = [
    ...ucs.map((u) => ({
      cadastro: "Unidade Consumidora",
      cliente: u.nome,
      cpfCnpj: u.cpfCnpj ?? "",
      antigo: u.codigoUcAntigo ?? "",
      novo: u.codigoUc ?? "",
      concessionaria: u.distribuidora ?? "",
      observacao: [
        u.origem !== "PADRAO" ? u.origem : "",
        u.active ? "" : "INATIVA",
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    ...clientes.map((c) => ({
      cadastro: "Cliente Brasil Solar",
      cliente: c.nome,
      cpfCnpj: c.cpfCnpj ?? "",
      antigo: c.codigoUcAntigo ?? "",
      novo: c.codigoUc ?? "",
      concessionaria: c.concessionaria ?? "",
      observacao: "",
    })),
    ...proprietarios.map((p) => ({
      cadastro: "Proprietário Brasil Solar",
      cliente: p.nome,
      cpfCnpj: p.cpfCnpj ?? "",
      antigo: p.codigoUcAntigo ?? "",
      novo: p.codigoUc ?? "",
      concessionaria: p.concessionaria ?? "",
      observacao: "",
    })),
    ...beneficiarias.map((b) => ({
      cadastro: "Beneficiária Brasil Solar",
      cliente: b.nome || b.proprietario.nome,
      cpfCnpj: "",
      antigo: b.codigoUcAntigo ?? "",
      novo: b.codigoUc ?? "",
      concessionaria: b.proprietario.concessionaria ?? "",
      observacao: `titular: ${b.proprietario.nome}`,
    })),
  ];

  // O código novo da RGE tem 12 dígitos e o antigo 10. Quando vem ao contrário
  // o cadastro está com os campos trocados — sinaliza na planilha, não corrige
  // calado.
  const invertido = (l: Linha) =>
    l.antigo.replace(/\D/g, "").length === 12 && l.novo.replace(/\D/g, "").length === 10;
  for (const l of todas) {
    if (invertido(l)) {
      l.observacao = [l.observacao, "⚠️ ANTIGO/NOVO trocados no cadastro"]
        .filter(Boolean)
        .join(" · ");
    }
  }

  const comDePara = todas
    .filter((l) => l.antigo && l.novo && l.antigo !== l.novo)
    .sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
  // Só entra na aba de pendências quem TEM código atual — cadastro sem nenhum
  // código não é "de-para faltando", é cadastro sem UC.
  const semDePara = todas
    .filter((l) => l.novo && !(l.antigo && l.antigo !== l.novo))
    .sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
  const semCodigoAlgum = todas.filter((l) => !l.novo).length;

  // ── Monta a planilha ──────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestor de Créditos";

  const COLUNAS = [
    { header: "Cliente", key: "cliente", width: 42 },
    { header: "CPF/CNPJ", key: "cpfCnpj", width: 20 },
    { header: "Código ANTIGO", key: "antigo", width: 18 },
    { header: "Código NOVO", key: "novo", width: 18 },
    { header: "Código NOVO (formatado)", key: "novoFmt", width: 22 },
    { header: "Concessionária", key: "concessionaria", width: 16 },
    { header: "Cadastro", key: "cadastro", width: 26 },
    { header: "Observação", key: "observacao", width: 34 },
  ];

  const montaAba = (nome: string, linhas: Linha[]) => {
    const ws = wb.addWorksheet(nome);
    ws.columns = COLUNAS;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EEF7" },
    };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    linhas.forEach((l) =>
      ws.addRow({
        cliente: l.cliente,
        cpfCnpj: l.cpfCnpj,
        // texto: código com zero à esquerda não pode virar número no Excel
        antigo: l.antigo,
        novo: l.novo,
        novoFmt: formatar(l.novo),
        concessionaria: l.concessionaria,
        cadastro: l.cadastro,
        observacao: l.observacao,
      }),
    );
    ws.autoFilter = { from: "A1", to: { row: 1, column: COLUNAS.length } };
    return ws;
  };

  montaAba("De-para", comDePara);
  montaAba("Sem código antigo", semDePara);

  const outFull = resolve(OUT_PATH);
  await wb.xlsx.writeFile(outFull);

  console.log("=".repeat(60));
  console.log("DE-PARA CÓDIGO DE INSTALAÇÃO RGE (antigo → novo)");
  console.log("=".repeat(60));
  console.log(`  Com de-para (aba "De-para")            : ${comDePara.length}`);
  console.log(`  Sem código antigo (aba "Sem código...") : ${semDePara.length}`);
  console.log(`  Fora da planilha (cadastro sem código)  : ${semCodigoAlgum}`);
  for (const cad of [...new Set(todas.map((l) => l.cadastro))]) {
    const c = comDePara.filter((l) => l.cadastro === cad).length;
    const s = semDePara.filter((l) => l.cadastro === cad).length;
    console.log(`     ${cad.padEnd(28)} ${String(c).padStart(4)} com / ${String(s).padStart(4)} sem`);
  }
  const trocados = todas.filter(invertido);
  if (trocados.length) {
    console.log(`\n⚠️  ${trocados.length} cadastro(s) com ANTIGO/NOVO trocados (marcados na planilha):`);
    trocados.forEach((l) =>
      console.log(`   ${l.cadastro} — ${l.cliente}: antigo=${l.antigo} novo=${l.novo}`),
    );
  }

  console.log(`\n✅ Planilha gerada: ${outFull}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
