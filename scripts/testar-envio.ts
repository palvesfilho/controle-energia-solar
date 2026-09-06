/**
 * Testa os CANAIS de envio — email (SMTP do Google) e WhatsApp (Uazapi) —
 * mandando uma mensagem de verdade para um destino que VOCÊ digita.
 *
 * 🔑 **Por que existe separado do teste de cobrança.** São duas perguntas
 * diferentes, e misturá-las custa caro:
 *
 *   1. "A credencial funciona e a mensagem chega?"  ← este script
 *   2. "O pipeline de cobrança dispara certo?"      ← emitir uma cobrança
 *
 * Responder a (1) primeiro custa 10 segundos e não cria dado nenhum. Descobrir
 * que a senha de app estava errada DEPOIS de já ter criado cliente de teste,
 * UC de teste e boleto real no Asaas é o caminho caro para a mesma informação.
 *
 * ⚠️ **ISTO ENVIA DE VERDADE.** Não respeita `NOTIFICACAO_COBRANCA_MODO`, de
 * propósito: é um gesto manual, com destino digitado à mão. Por isso não há
 * valor padrão para `--email` nem `--fone` — sem destino explícito, não roda.
 *
 * Uso:
 *   npx tsx scripts/testar-envio.ts --email voce@dominio.com --fone "(55)99999-9999"
 *   npx tsx scripts/testar-envio.ts --fone "5599999-9999"        (só WhatsApp)
 *   npx tsx scripts/testar-envio.ts --email voce@dominio.com     (só email)
 */
import "dotenv/config";
import { enviarEmail, emailConfigurado, verificarConexaoEmail, remetentePadrao } from "../src/lib/email-transport";
import { enviarTextoWhatsapp, uazapiConfigurado, statusInstancia } from "../src/lib/whatsapp-uazapi";
import { normalizarTelefoneBR, formatarTelefone } from "../src/lib/uc-trava-contato";
import { nomeRemetente } from "../src/lib/cobranca-mensagens";

function arg(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const QUANDO = new Date().toLocaleString("pt-BR");

async function testarEmail(destino: string) {
  console.log(`\n=== EMAIL → ${destino} ===`);
  const cfg = emailConfigurado();
  if (!cfg.ok) {
    console.log(`  NÃO CONFIGURADO — ${cfg.motivo}`);
    return;
  }
  console.log(`  Provedor : ${cfg.provedor}`);
  console.log(`  Remetente: ${remetentePadrao()}`);

  // `verify()` faz handshake e LOGIN. Pega senha de app errada aqui, com uma
  // mensagem que diz o que fazer, em vez de um erro cru no meio do envio.
  const conexao = await verificarConexaoEmail();
  console.log(`  Login    : ${conexao.ok ? "OK" : "FALHOU"} — ${conexao.detalhe}`);
  if (!conexao.ok) return;

  try {
    const r = await enviarEmail({
      to: destino,
      subject: `Teste de envio — ${nomeRemetente()}`,
      html: `<p>Este é um <strong>teste de configuração</strong> do envio de email do sistema de cobrança.</p>
             <p>Se você está lendo isto, o SMTP do Google está funcionando.</p>
             <p style="color:#6b7280;font-size:12px">Disparado manualmente em ${QUANDO} por scripts/testar-envio.ts</p>`,
      text: `Teste de configuração do envio de email do sistema de cobrança.\nSe você está lendo isto, o SMTP do Google está funcionando.\n\nDisparado manualmente em ${QUANDO}.`,
    });
    console.log(`  ENVIADO  ✓  id=${r.id}`);
    console.log("  Confira a caixa de entrada (e o spam — primeiro envio de um remetente novo costuma cair lá).");
  } catch (err) {
    console.log(`  FALHOU   ✗  ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testarWhatsapp(destinoBruto: string) {
  console.log(`\n=== WHATSAPP → ${destinoBruto} ===`);
  const cfg = uazapiConfigurado();
  if (!cfg.ok) {
    console.log(`  NÃO CONFIGURADO — ${cfg.motivo}`);
    return;
  }

  // Passa pela MESMA normalização da cobrança. Se o número que você digitou for
  // recusado aqui, ele seria recusado lá também — e é melhor descobrir agora.
  const n = normalizarTelefoneBR(destinoBruto);
  if (!n.e164) {
    console.log(`  NÚMERO RECUSADO — ${n.motivo}`);
    console.log("  (a mesma régua da cobrança: DDD válido, celular, nono dígito)");
    return;
  }
  console.log(`  Normalizado: ${destinoBruto} → ${n.e164}  (${formatarTelefone(n.e164)})`);

  // ⚠️ Instância despareada devolve 200 e não entrega. Perguntar antes evita
  // concluir "a mensagem sumiu" quando o problema é o celular desconectado.
  try {
    const st = await statusInstancia();
    console.log(`  Instância  : "${st.statusBruto}" ${st.conectado ? "(conectada)" : "(NÃO conectada — a mensagem não vai sair)"}`);
    if (st.numero) console.log(`  Remetente  : ${st.numero}`);
  } catch (err) {
    console.log(`  Instância  : não deu para consultar — ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const r = await enviarTextoWhatsapp(
      n.e164,
      `Teste de configuração do WhatsApp do sistema de cobrança.\n\n` +
        `Se você recebeu esta mensagem, a integração com a Uazapi está funcionando.\n\n` +
        `Disparado manualmente em ${QUANDO}.\n\n${nomeRemetente()}`,
    );
    console.log(`  ENVIADO  ✓  id=${r.id || "(a API não devolveu id)"}`);
  } catch (err) {
    console.log(`  FALHOU   ✗  ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  const email = arg("email");
  const fone = arg("fone");

  if (!email && !fone) {
    console.log(
      "Informe ao menos um destino:\n" +
        '  npx tsx scripts/testar-envio.ts --email voce@dominio.com --fone "(55)99999-9999"\n\n' +
        "Sem destino explícito o script não roda — ele ENVIA DE VERDADE.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("⚠️  ISTO ENVIA MENSAGEM DE VERDADE (não respeita o modo de simulação).");
  if (email) await testarEmail(email);
  if (fone) await testarWhatsapp(fone);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
