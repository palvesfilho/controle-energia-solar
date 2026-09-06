/**
 * Gera a planilha das pendências de cadastro para o Paulo preencher.
 *
 * O par deste script é `importa-pendencias-cadastro.ts`, que lê o arquivo de
 * volta. Os dois conversam pela coluna `consumerId` — casar por NOME seria
 * frágil: os dois cadastros homônimos de CARLOS ANGELO BURGHAUSEN CAMILLO
 * provam por quê.
 *
 * 📏 **A planilha nunca traz titularidade de fatura.** Regra do Paulo em
 * 06/09/2026: o nome na conta da RGE/CPFL serve só à solicitação regulatória
 * de envio de créditos e não diz nada sobre quem é cobrado. Ver
 * [[feedback_titular_da_fatura_nao_e_o_cliente]].
 *
 * Uso: npx tsx scripts/exporta-pendencias-cadastro.ts [caminho.xlsx]
 * Somente leitura do banco.
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { SEM_UC_BRASIL_SOLAR } from "../src/lib/uc-origem";
import { FATURA_COMPENSADA } from "../src/lib/uc-implantacao";
import { emailsDoConsumer, normalizarTelefoneBR } from "../src/lib/uc-trava-contato";

const prisma = new PrismaClient();
const SAIDA = process.argv[2] || "D:/PROJETOS_CLAUDE/GESTOR_CREDITOS/pendencias-cadastro.xlsx";
const soDig = (s?: string | null) => (s ?? "").replace(/\D/g, "");
const GESTORA = /palves|solvesm|redebrasilsolar|abrasilsolar/i;

/** Cabeçalho escuro, congelado e com filtro — as abas têm linhas demais. */
function estiliza(ws: ExcelJS.Worksheet, larguras: number[]) {
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  cab.alignment = { vertical: "middle", wrapText: true };
  cab.height = 30;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  larguras.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: larguras.length } };
}

/**
 * Pinta de amarelo a coluna que o Paulo preenche.
 *
 * Não é enfeite: a planilha tem 6 colunas e só uma é para digitar. Sem a
 * marca, a chance de alguém "corrigir" a coluna de leitura — inclusive o
 * `consumerId`, que é a chave da volta — é real.
 */
function marcaPreenchimento(ws: ExcelJS.Worksheet, colunas: number[], linhas: number) {
  for (let r = 2; r <= linhas + 1; r++) {
    for (const c of colunas) {
      const cel = ws.getCell(r, c);
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      cel.border = { bottom: { style: "hair" }, right: { style: "hair" } };
    }
  }
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestor de Créditos";
  wb.created = new Date();

  // 🚨 SEM_UC_BRASIL_SOLAR: a planilha é do mundo da ASSOCIAÇÃO. UC do módulo
  // Brasil Solar não é cobrada por aqui e não gera pendência de contato.
  const ucs = await prisma.consumerUnit.findMany({
    where: { active: true, ...SEM_UC_BRASIL_SOLAR },
    select: {
      id: true,
      codigoUc: true,
      cpfCnpj: true,
      docsAdesaoIdCrm: true,
      consumer: {
        select: {
          id: true,
          name: true,
          cpfCnpj: true,
          document: true,
          email: true,
          emailsRecebimento: true,
          phone: true,
        },
      },
    },
    orderBy: { nome: "asc" },
  });
  const comp = await prisma.consumerBill.findMany({
    where: { ...FATURA_COMPENSADA },
    select: { consumerUnitId: true },
    distinct: ["consumerUnitId"],
  });
  const faturavel = new Set(comp.map((c) => c.consumerUnitId).filter(Boolean) as string[]);

  interface Grupo {
    consumer: NonNullable<(typeof ucs)[number]["consumer"]>;
    codigos: string[];
    faturaveis: number;
    docDaAdesao: string | null;
  }
  const grupos = new Map<string, Grupo>();
  for (const u of ucs) {
    if (!u.consumer) continue;
    const g =
      grupos.get(u.consumer.id) ??
      { consumer: u.consumer, codigos: [], faturaveis: 0, docDaAdesao: null };
    g.codigos.push(u.codigoUc);
    if (faturavel.has(u.id)) g.faturaveis++;
    // Só vira sugestão o documento que veio da ADESÃO: na UC legada o campo
    // guarda o titular da distribuidora, que não é quem se cobra.
    if (!g.docDaAdesao && u.docsAdesaoIdCrm != null && u.cpfCnpj) g.docDaAdesao = u.cpfCnpj;
    grupos.set(u.consumer.id, g);
  }

  // ── LEIA-ME ───────────────────────────────────────────────────────────────
  const inst = wb.addWorksheet("LEIA-ME");
  inst.getColumn(1).width = 108;
  const texto = [
    "PENDÊNCIAS DE CADASTRO — preencha as células AMARELAS e me devolva o arquivo.",
    "",
    "REGRAS:",
    "- NÃO apague nem altere a coluna 'consumerId'. É por ela que eu encontro o cadastro.",
    "- NÃO renomeie as abas nem mude a ordem das colunas.",
    "- Célula em branco significa 'não mexer'. Nada é apagado por estar vazio.",
    "- Pode preencher só uma parte e me devolver; o resto fica para depois.",
    "",
    "ABAS:",
    "- TELEFONES: clientes sem telefone. É o que trava as UCs faturáveis hoje — toda",
    "  cobrança emitida manda email e WhatsApp, e sem telefone ela é recusada.",
    "  Formatos aceitos: (55) 99999-9999, 55999999999 ou 5599999999.",
    "  Telefone FIXO não serve: não recebe WhatsApp e será recusado na importação.",
    "- EMAILS: clientes cujo destinatário hoje é o email do gestor. Eles nunca recebem",
    "  a própria fatura, e o envio não acusa erro nenhum.",
    "- DOCUMENTOS: clientes sem CPF/CNPJ no cadastro. A coluna 'Sugestão' já traz o",
    "  documento da adesão assinada — para aceitar, copie para a coluna amarela.",
    "- DECISOES: não se preenche dado, responde-se a pergunta na coluna amarela.",
    "",
    "O QUE ESTA PLANILHA NÃO TRATA:",
    "- Titularidade da fatura na RGE/CPFL. Pela sua regra de 06/09/2026, o nome na",
    "  conta de luz serve só à solicitação regulatória de envio dos créditos e não diz",
    "  nada sobre quem é cobrado. Nenhuma linha aqui é sobre isso.",
    "",
    `Gerado em ${new Date().toLocaleString("pt-BR")}.`,
  ];
  texto.forEach((linha, i) => {
    const cel = inst.getCell(i + 1, 1);
    cel.value = linha;
    if (i === 0) cel.font = { bold: true, size: 13 };
    else if (linha.endsWith(":") && linha === linha.toUpperCase()) cel.font = { bold: true };
  });

  // ── TELEFONES ─────────────────────────────────────────────────────────────
  const semTelefone = [...grupos.values()]
    .filter((g) => !normalizarTelefoneBR(g.consumer.phone).e164)
    .filter((g) => !/^ZZ TESTE/i.test(g.consumer.name))
    .sort(
      (a, b) =>
        b.faturaveis - a.faturaveis ||
        a.consumer.name.localeCompare(b.consumer.name, "pt-BR"),
    );

  const wsTel = wb.addWorksheet("TELEFONES");
  wsTel.addRow([
    "consumerId",
    "Cliente",
    "UCs faturáveis",
    "Códigos de UC",
    "Email atual",
    "TELEFONE (preencher)",
  ]);
  for (const g of semTelefone) {
    wsTel.addRow([
      g.consumer.id,
      g.consumer.name,
      g.faturaveis,
      g.codigos.join(", "),
      emailsDoConsumer(g.consumer).join(" ; "),
      "",
    ]);
  }
  // O telefone é TEXTO: "55999763348" lido como número perde o zero à esquerda
  // de DDDs futuros e vira notação científica em código longo. Mesmo cuidado do
  // export das tabelas, que já mordeu com código de UC.
  wsTel.getColumn(6).numFmt = "@";
  estiliza(wsTel, [26, 44, 13, 40, 40, 24]);
  marcaPreenchimento(wsTel, [6], semTelefone.length);

  // ── EMAILS ────────────────────────────────────────────────────────────────
  const emailGestora = [...grupos.values()].filter((g) => {
    const es = emailsDoConsumer(g.consumer);
    return es.length > 0 && GESTORA.test(es[0]) && !/^ZZ TESTE/i.test(g.consumer.name);
  });

  const wsMail = wb.addWorksheet("EMAILS");
  wsMail.addRow([
    "consumerId",
    "Cliente",
    "Destinatário HOJE",
    "Também em cópia",
    "EMAIL CORRETO (preencher)",
  ]);
  for (const g of emailGestora) {
    const es = emailsDoConsumer(g.consumer);
    wsMail.addRow([g.consumer.id, g.consumer.name, es[0], es.slice(1).join(" ; "), ""]);
  }
  estiliza(wsMail, [26, 44, 34, 34, 34]);
  marcaPreenchimento(wsMail, [5], emailGestora.length);

  // ── DOCUMENTOS ────────────────────────────────────────────────────────────
  const semDocumento = [...grupos.values()]
    .filter((g) => !soDig(g.consumer.cpfCnpj) && !soDig(g.consumer.document))
    .sort((a, b) => a.consumer.name.localeCompare(b.consumer.name, "pt-BR"));

  const wsDoc = wb.addWorksheet("DOCUMENTOS");
  wsDoc.addRow([
    "consumerId",
    "Cliente",
    "Códigos de UC",
    "Sugestão (da adesão assinada)",
    "CPF/CNPJ (preencher)",
  ]);
  for (const g of semDocumento) {
    wsDoc.addRow([g.consumer.id, g.consumer.name, g.codigos.join(", "), g.docDaAdesao ?? "", ""]);
  }
  wsDoc.getColumn(4).numFmt = "@";
  wsDoc.getColumn(5).numFmt = "@";
  estiliza(wsDoc, [26, 44, 30, 30, 26]);
  marcaPreenchimento(wsDoc, [5], semDocumento.length);

  // ── DECISOES ──────────────────────────────────────────────────────────────
  const todos = await prisma.consumer.findMany({
    select: {
      id: true,
      name: true,
      cpfCnpj: true,
      document: true,
      _count: { select: { consumerUnits: true } },
    },
    orderBy: { name: "asc" },
  });

  const wsDec = wb.addWorksheet("DECISOES");
  wsDec.addRow(["consumerId", "Assunto", "O que existe hoje", "Pergunta", "RESPOSTA (preencher)"]);

  const duplicado = todos.find(
    (c) => c.name.toUpperCase().includes("CARLOS ANGELO") && c._count.consumerUnits === 0,
  );
  if (duplicado) {
    wsDec.addRow([
      duplicado.id,
      "Cadastro duplicado",
      "Existem DOIS clientes CARLOS ANGELO BURGHAUSEN CAMILLO. Este está sem UC, sem email e sem telefone; o outro tem a UC 160378300170 e o contato preenchido.",
      "Apago este cadastro vazio? (SIM / NAO)",
      "",
    ]);
  }
  for (const c of todos.filter((x) => x._count.consumerUnits === 0 && x.id !== duplicado?.id)) {
    wsDec.addRow([
      c.id,
      "Cliente sem nenhuma UC",
      `${c.name} — documento ${c.cpfCnpj ?? c.document ?? "(vazio)"}`,
      "Este cadastro ainda serve para alguma coisa? (MANTER / APAGAR)",
      "",
    ]);
  }
  const produza = todos.find((c) => c.name.toUpperCase().includes("PRODUZA"));
  if (produza) {
    wsDec.addRow([
      produza.id,
      "Documento de outro cliente",
      "PRODUZA INSUMOS carrega 57.485.803/0001-09 no campo legado 'document' — o CNPJ da Dommo Soluções. A UC dela é do módulo Brasil Solar, então não afeta cobrança da Associação.",
      "Qual é o CNPJ correto da PRODUZA? (ou escreva LIMPAR)",
      "",
    ]);
  }
  estiliza(wsDec, [26, 24, 64, 44, 26]);
  marcaPreenchimento(wsDec, [5], wsDec.rowCount - 1);

  await wb.xlsx.writeFile(SAIDA);
  console.log(`Planilha: ${SAIDA}`);
  console.log(
    `  TELEFONES : ${semTelefone.length} linhas (${semTelefone.reduce((a, g) => a + g.faturaveis, 0)} UCs faturáveis travadas)`,
  );
  console.log(`  EMAILS    : ${emailGestora.length}`);
  console.log(`  DOCUMENTOS: ${semDocumento.length}`);
  console.log(`  DECISOES  : ${wsDec.rowCount - 1}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
