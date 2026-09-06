/**
 * Traz email e telefone da adesão assinada no CRM para o cadastro de CLIENTE.
 *
 * 🔑 **Por que existe.** O contato do cliente nasce no gerador de propostas e
 * chega até aqui: o sync grava `CrmUcImportada.clienteEmail/clienteTelefone` e
 * a fila até mostra os dois na tela. O que nunca existiu foi a escrita no
 * `Consumer` — o formulário de UC só ESCOLHE um cliente já cadastrado, e a
 * rota `vincular` copiava apenas documentos. Resultado medido em 06/09/2026:
 * 16 clientes sem email nem telefone, todos com os dois no CRM.
 *
 * A partir de 06/09/2026 a rota `vincular` preenche sozinha (mesma função,
 * `lib/crm-contato.ts`). Este script é o retroativo — quem já foi cadastrado
 * antes disso.
 *
 * 📏 **Só preenche o que está VAZIO.** Email já cadastrado nunca é
 * sobrescrito: a TONETO tem `financeiro@tonetoempreendimentos.com` no cadastro
 * e `vendas@...` na adesão — o primeiro é o certo para cobrança, e o segundo
 * apagaria a curadoria de quem preencheu.
 *
 * 🚨 **Guarda de documento.** Só grava quando o CPF/CNPJ da adesão bate com o
 * do cliente ou com o da UC. Foi isso que pegou a UC 199346300111: ela é da
 * MAINARDI E CARGNELUTTI e estava vinculada ao cliente RODRIGO TREVISAN
 * SBEGHEN — sem a guarda, o telefone da Mainardi seria gravado no Rodrigo.
 *
 * Uso:
 *   npx tsx scripts/backfill-contatos-crm.ts              # simulação
 *   npx tsx scripts/backfill-contatos-crm.ts --aplicar    # grava
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { SEM_UC_BRASIL_SOLAR } from "../src/lib/uc-origem";
import { emailsDoConsumer, normalizarTelefoneBR } from "../src/lib/uc-trava-contato";
import { apenasDigitos } from "../src/lib/crm-contato";
import { contatoUtilizavelDaAdesao } from "../src/lib/crm-contato-cadastro";
import { listarAdesoes, extrairCodigosUc } from "../src/lib/crm-supabase";

const prisma = new PrismaClient();
/**
 * Exceções à guarda de documento — decisões tomadas OLHANDO o caso, uma a uma.
 *
 * A guarda existe para o vínculo errado não virar contato errado, e ela já
 * pagou o próprio custo (pegou a UC 199346300111, da MAINARDI, pendurada no
 * cliente RODRIGO TREVISAN SBEGHEN). Mas documento que não bate nem sempre é
 * vínculo errado: às vezes é família, e aí quem decide é o Paulo, não o script.
 * A exceção fica escrita aqui, com o porquê, em vez de o script ser rodado com
 * a guarda desligada.
 */
const EXCECOES_DOCUMENTO: Record<string, string> = {
  // 06/09/2026 — "sim, pode gravar" do Paulo.
  // Três documentos diferentes no mesmo caso: a adesão diz CPF 342.211.900-00
  // para o CARLOS ANGELO, a UC 160378300170 está com 323.380.400-82 (que é o
  // CPF da MARIA DO CARMO DI FANTE CAMILLO, cadastrada aqui sem UC nenhuma), e
  // os dois cadastros de CARLOS ANGELO estão sem documento. O email da adesão
  // (`carmodifante@yahoo.com.br`) é coerente com a Maria do Carmo: é família,
  // não vínculo trocado. O contato da adesão é o que o cliente assinou.
  "CARLOS ANGELO BURGHAUSEN CAMILLO": "família Camillo — decisão do Paulo em 06/09/2026",
};

const APLICAR = process.argv.includes("--aplicar");

interface Pendencia {
  consumerId: string;
  nome: string;
  ucs: string;
  emailAtual: string;
  emailNovo: string | null;
  telefoneAtual: string;
  telefoneNovo: string | null;
  via: string;
  titularNoCrm: string;
}

async function main() {
  const adesoes = await listarAdesoes();
  const porCodigo = new Map<string, (typeof adesoes)[number]>();
  const porDocumento = new Map<string, (typeof adesoes)[number]>();
  for (const a of adesoes) {
    for (const c of extrairCodigosUc(a.unidades_consumidoras)) porCodigo.set(apenasDigitos(c), a);
    const d = apenasDigitos(a.cliente_documento);
    if (d) porDocumento.set(d, a);
  }
  console.log(`Adesões lidas do CRM: ${adesoes.length}`);

  // 🚨 SEM_UC_BRASIL_SOLAR: o gerador de propostas alimenta a ASSOCIAÇÃO. UC do
  // módulo Brasil Solar não é cobrada por aqui e não entra neste backfill.
  const ucs = await prisma.consumerUnit.findMany({
    where: { active: true, ...SEM_UC_BRASIL_SOLAR },
    select: {
      codigoUc: true,
      codigoUcAntigo: true,
      cpfCnpj: true,
      consumer: {
        select: { id: true, name: true, email: true, emailsRecebimento: true, phone: true, cpfCnpj: true, document: true },
      },
    },
  });

  const grupos = new Map<string, { consumer: NonNullable<(typeof ucs)[number]["consumer"]>; ucs: typeof ucs }>();
  for (const u of ucs) {
    if (!u.consumer) continue;
    const g = grupos.get(u.consumer.id) ?? { consumer: u.consumer, ucs: [] };
    g.ucs.push(u);
    grupos.set(u.consumer.id, g);
  }

  const aGravar: Pendencia[] = [];
  const recusados: string[] = [];
  const liberados: string[] = [];

  for (const [, g] of grupos) {
    const c = g.consumer;
    const emails = emailsDoConsumer(c);
    const telOk = !!normalizarTelefoneBR(c.phone).e164;
    if (emails.length > 0 && telOk) continue;

    let adesao: (typeof adesoes)[number] | undefined;
    let via = "";
    for (const u of g.ucs) {
      adesao = porCodigo.get(apenasDigitos(u.codigoUc)) ?? porCodigo.get(apenasDigitos(u.codigoUcAntigo));
      if (adesao) { via = "código da UC"; break; }
    }
    if (!adesao) {
      const d = apenasDigitos(c.cpfCnpj) || apenasDigitos(c.document);
      if (d && porDocumento.get(d)) { adesao = porDocumento.get(d); via = "CPF/CNPJ"; }
    }
    if (!adesao) continue;

    // Guarda de documento — o CPF/CNPJ da adesão tem que bater com o cliente
    // ou com alguma UC dele. Vínculo errado não vira contato errado.
    const docAdesao = apenasDigitos(adesao.cliente_documento);
    const docsDaqui = new Set(
      [c.cpfCnpj, c.document, ...g.ucs.map((u) => u.cpfCnpj)].map(apenasDigitos).filter(Boolean),
    );
    if (docAdesao && docsDaqui.size > 0 && !docsDaqui.has(docAdesao)) {
      const excecao = EXCECOES_DOCUMENTO[c.name.trim()];
      if (!excecao) {
        recusados.push(
          `  ✗ ${c.name.slice(0, 36).padEnd(37)} adesão é de "${adesao.cliente_nome}" (${docAdesao}) — documento não bate`,
        );
        continue;
      }
      liberados.push(`  ⚠ ${c.name.slice(0, 36).padEnd(37)} liberado por exceção: ${excecao}`);
    }

    const contato = contatoUtilizavelDaAdesao(adesao.cliente_email, adesao.cliente_telefone);
    const emailNovo = emails.length === 0 ? contato.email : null;
    const telefoneNovo = !telOk ? contato.telefone : null;
    if (!emailNovo && !telefoneNovo) continue;

    aGravar.push({
      consumerId: c.id,
      nome: c.name,
      ucs: g.ucs.map((u) => u.codigoUc).join(" "),
      emailAtual: emails.join(" ") || "",
      emailNovo,
      telefoneAtual: (c.phone ?? "").trim(),
      telefoneNovo,
      via,
      titularNoCrm: adesao.cliente_nome ?? "",
    });
  }

  aGravar.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  console.log(`\n${"─".repeat(110)}`);
  console.log(`${"CLIENTE".padEnd(38)} ${"EMAIL A GRAVAR".padEnd(34)} ${"TEL".padEnd(12)} CASOU POR`);
  console.log("─".repeat(110));
  for (const p of aGravar) {
    console.log(
      `${p.nome.slice(0, 37).padEnd(38)} ${(p.emailNovo ?? "(mantém o atual)").slice(0, 33).padEnd(34)} ${(p.telefoneNovo ?? "—").padEnd(12)} ${p.via}`,
    );
  }
  console.log("─".repeat(110));
  console.log(`Clientes a atualizar: ${aGravar.length}`);
  console.log(`  emails a gravar   : ${aGravar.filter((p) => p.emailNovo).length}`);
  console.log(`  telefones a gravar: ${aGravar.filter((p) => p.telefoneNovo).length}`);
  if (liberados.length) {
    console.log(`
Liberados por exceção documentada (${liberados.length}):`);
    for (const l of liberados) console.log(l);
  }
  if (recusados.length) {
    console.log(`\nRecusados pela guarda de documento (${recusados.length}):`);
    for (const r of recusados) console.log(r);
  }

  if (!APLICAR) {
    console.log("\nSIMULAÇÃO — nada foi gravado. Rode com --aplicar para valer.");
    return;
  }

  // 🧯 Backup ANTES de escrever: o que o campo tinha, para poder desfazer.
  const backup = ["consumerId;nome;email_antes;telefone_antes;email_depois;telefone_depois"];
  for (const p of aGravar) {
    backup.push([p.consumerId, p.nome, p.emailAtual, p.telefoneAtual, p.emailNovo ?? p.emailAtual, p.telefoneNovo ?? p.telefoneAtual].join(";"));
  }
  const arquivo = `backup-contatos-antes-crm-${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(arquivo, "\uFEFF" + backup.join("\n"), "utf8");
  console.log(`\nBackup: ${arquivo}`);

  let n = 0;
  for (const p of aGravar) {
    const data: { email?: string; phone?: string } = {};
    if (p.emailNovo) data.email = p.emailNovo;
    if (p.telefoneNovo) data.phone = p.telefoneNovo;
    await prisma.consumer.update({ where: { id: p.consumerId }, data });
    n++;
  }
  console.log(`${n} cliente(s) atualizados.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
