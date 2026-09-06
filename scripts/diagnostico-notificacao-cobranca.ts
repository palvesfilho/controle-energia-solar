/**
 * Diagnóstico da comunicação de cobrança: email (Google) + WhatsApp (Uazapi).
 *
 * Responde, sem enviar nada:
 *   1. Em que MODO o disparo está (simulacao / real / off)?
 *   2. O SMTP do Google aceita o login? (faz handshake de verdade)
 *   3. A instância da Uazapi está pareada? (instância desconectada aceita a
 *      chamada e não entrega — por isso a pergunta é feita antes)
 *   4. Quantas UCs faturáveis estão BLOQUEADAS pela trava de contato, e quais.
 *
 * ⚠️ Rodar com `npx tsx scripts/diagnostico-notificacao-cobranca.ts`. O
 * `dotenv/config` no topo não é enfeite: sem ele o script lê um ambiente vazio
 * e responde "credencial não configurada" para credenciais que existem.
 *
 * Somente leitura. Não envia email, não manda WhatsApp, não escreve no banco.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { FATURA_COMPENSADA } from "../src/lib/uc-implantacao";
import { SEM_UC_BRASIL_SOLAR } from "../src/lib/uc-origem";
import { emailsDoConsumer, montarContato, travaContatoAtiva } from "../src/lib/uc-trava-contato";
import { verificarConexaoEmail, provedorEmail, remetentePadrao } from "../src/lib/email-transport";
import { statusInstancia, uazapiConfigurado } from "../src/lib/whatsapp-uazapi";
import { modoNotificacao } from "../src/lib/notificar-cobranca";

const prisma = new PrismaClient();

function titulo(t: string) {
  console.log(`\n${"─".repeat(72)}\n${t}\n${"─".repeat(72)}`);
}

async function main() {
  titulo("1. MODO DE DISPARO");
  const modo = modoNotificacao();
  console.log(`  NOTIFICACAO_COBRANCA_MODO = ${modo}`);
  if (modo === "simulacao") {
    console.log("  → Nada sai para o cliente. Monta a mensagem e registra no log.");
  } else if (modo === "real") {
    console.log("  → ENVIA DE VERDADE a cada cobrança emitida.");
  } else {
    console.log("  → Desligado: nenhum aviso é montado nem enviado.");
  }
  console.log(`  TRAVA_CONTATO_COBRANCA = ${travaContatoAtiva() ? "on (bloqueia)" : "off (só avisa)"}`);

  titulo("2. EMAIL");
  console.log(`  Provedor: ${provedorEmail()}`);
  console.log(`  Remetente: ${remetentePadrao() || "(não configurado)"}`);
  const email = await verificarConexaoEmail();
  console.log(`  ${email.ok ? "OK" : "FALHOU"} — ${email.detalhe}`);

  titulo("3. WHATSAPP (Uazapi)");
  const cfgZap = uazapiConfigurado();
  if (!cfgZap.ok) {
    console.log(`  FALHOU — ${cfgZap.motivo}`);
  } else {
    try {
      const st = await statusInstancia();
      console.log(`  Status bruto da API: "${st.statusBruto}"`);
      console.log(`  ${st.conectado ? "OK — instância pareada" : "ATENÇÃO — instância NÃO parece conectada"}`);
      if (st.numero) console.log(`  Número da instância: ${st.numero}`);
    } catch (err) {
      console.log(`  FALHOU — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  titulo("4. TRAVA DE CONTATO NAS UCs FATURÁVEIS");
  const compensaram = await prisma.consumerBill.findMany({
    where: { ...FATURA_COMPENSADA },
    select: { consumerUnitId: true },
    distinct: ["consumerUnitId"],
  });
  const ids = compensaram
    .map((r) => r.consumerUnitId)
    .filter((id): id is string => !!id);

  // 🚨 SEM_UC_BRASIL_SOLAR NÃO É OPCIONAL AQUI.
  // Faturamento é o mundo da ASSOCIAÇÃO. UC do módulo Brasil Solar (ANDRÉ
  // LEIVAS, FUNDAÇÃO MENEGHETTI, GRÁFICA JACUÍ) existe só para baixar fatura e
  // alimentar o relatório do cliente BS — ela NUNCA é cobrada por aqui, então
  // "falta telefone" nela não é pendência nenhuma. Sem este filtro o
  // diagnóstico inventa um problema que não existe e manda o operador
  // cadastrar contato de quem ele nem cobra. Ver lib/uc-origem.ts.
  const ucs = await prisma.consumerUnit.findMany({
    where: { id: { in: ids }, active: true, ...SEM_UC_BRASIL_SOLAR },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      consumer: {
        select: { id: true, name: true, email: true, emailsRecebimento: true, phone: true },
      },
    },
    orderBy: { nome: "asc" },
  });

  const avaliadas = ucs.map((u) => ({ uc: u, contato: montarContato(u.id, u.consumer) }));
  const bloqueadas = avaliadas.filter((a) => a.contato.pendencia);
  const liberadas = avaliadas.length - bloqueadas.length;

  console.log(`  UCs que já compensaram (faturáveis) : ${avaliadas.length}`);
  console.log(`  Passam na trava                     : ${liberadas}`);
  console.log(`  BLOQUEADAS                          : ${bloqueadas.length}`);
  console.log(`    sem cliente vinculado : ${avaliadas.filter((a) => !a.contato.consumerId).length}`);
  console.log(`    sem email             : ${avaliadas.filter((a) => !a.contato.temEmail).length}`);
  console.log(`    sem telefone válido   : ${avaliadas.filter((a) => !a.contato.temTelefone).length}`);

  if (bloqueadas.length > 0) {
    console.log("\n  Quem precisa de cadastro:");
    for (const b of bloqueadas) {
      console.log(
        `    ${b.uc.codigoUc.padEnd(13)} ${String(b.uc.consumer?.name ?? b.uc.nome).slice(0, 34).padEnd(34)} ${b.contato.pendencia}`,
      );
    }
  }

  await destinatarios(avaliadas);
  console.log("");
}

/**
 * Para onde a fatura de cada UC faturável IRIA.
 *
 * 🚨 **Por que isto substituiu a checagem de "endereço repetido".** A primeira
 * versão só apontava endereços usados por dois ou mais clientes. Isso não
 * enxerga o caso que importa: em 05/09/2026, a GEDEZ PROFESSORES ASSOCIADOS
 * (cliente da Associação, 19 faturas) tem como ÚNICO email
 * `palvesfillho@gmail.com` — o endereço do gestor, ainda por cima com um "l" a
 * mais. Usado por UM cliente só, o detector de repetição não via nada. A
 * DIMARZARI tem `palvesfilho@gmail.com` como email PRINCIPAL, com o do cliente
 * só em cópia.
 *
 * Um endereço errado não gera erro: o envio dá certo, e o cliente é que não
 * recebe. A única defesa é alguém OLHAR a lista de destinatários antes de virar
 * o modo para `real`.
 */
const PADRAO_GESTORA = /palves|solvesm|redebrasilsolar/i;

async function destinatarios(
  avaliadas: { uc: { codigoUc: string; nome: string; consumer: { name: string } | null }; contato: { emails: string[]; telefone: string | null } }[],
) {
  titulo("5. PARA QUEM CADA FATURA IRIA");
  console.log("  O PRIMEIRO endereço é o destinatário; os demais vão em cópia.\n");

  const suspeitas: string[] = [];
  for (const a of avaliadas) {
    const nome = String(a.uc.consumer?.name ?? a.uc.nome).slice(0, 32).padEnd(32);
    const linha = `  ${a.uc.codigoUc.padEnd(13)} ${nome} ${a.contato.emails.join(" ; ") || "(nenhum)"}`;
    console.log(linha);
    if (a.contato.emails.some((e) => PADRAO_GESTORA.test(e))) suspeitas.push(linha);
  }

  if (suspeitas.length > 0) {
    titulo(`⚠ ${suspeitas.length} CLIENTE(S) COM ENDEREÇO QUE PARECE SER DA GESTORA`);
    console.log("  A fatura destes NÃO chega ao cliente — e o envio não acusa erro.\n");
    for (const l of suspeitas) console.log(l);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
