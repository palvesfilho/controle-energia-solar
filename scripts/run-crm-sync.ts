/**
 * Job de leitura do CRM comercial (GERADOR_PROPOSTA).
 *
 * Puxa as vendas ganhas e as adesões do Supabase do CRM e enfileira o que
 * precisa virar obra, UC ou usina aqui. Nada é escrito no CRM.
 *
 * Quando rodar (via cron): de hora em hora. A latência não importa — o que
 * importa é nunca perder uma venda ganha.
 *
 * Uso:
 *   npx tsx scripts/run-crm-sync.ts            # sincroniza
 *   npx tsx scripts/run-crm-sync.ts --dry-run  # só relata o que faria
 *
 * Idempotente: a trava é `proposta_id_crm`, então re-execução não duplica
 * obra nem linha de fila. A primeira execução faz o backfill do que está
 * parado (53 obras e 12 adesões, na medição de 02/08/2026).
 *
 * Variáveis de ambiente necessárias no Railway:
 *   CRM_SUPABASE_URL          https://xxxx.supabase.co
 *   CRM_SUPABASE_SERVICE_KEY  chave service_role do Supabase do CRM
 */
// Precisa ser o PRIMEIRO import: carrega o .env antes de qualquer módulo que
// leia process.env. O cron do Railway injeta as variáveis direto, mas rodando
// na mão sem isto o script acha que a integração não está configurada.
import "dotenv/config";
import { crmConfigurado, listarAdesoes, listarProdutos, listarVendasGanhas } from "../src/lib/crm-supabase";
import { sincronizarCrm, garantirDeParaPadrao, DE_PARA_PADRAO } from "../src/lib/crm-sync";

function hasFlag(nome: string): boolean {
  return process.argv.includes(`--${nome}`);
}

async function dryRun() {
  const [produtos, ganhas, adesoes] = await Promise.all([
    listarProdutos(),
    listarVendasGanhas(),
    listarAdesoes(),
  ]);

  const codigoPorId = new Map(produtos.map((p) => [p.id, p.codigo]));
  const conhecidos = new Set(DE_PARA_PADRAO.map((l) => l.codigoProduto));

  const porProduto = new Map<string, number>();
  for (const p of ganhas) {
    const codigo = p.produto_id != null ? codigoPorId.get(p.produto_id) ?? "?" : "?";
    porProduto.set(codigo, (porProduto.get(codigo) ?? 0) + 1);
  }

  console.log(`[crm-sync] DRY RUN — nada foi gravado`);
  console.log(`  vendas ganhas: ${ganhas.length}`);
  console.log(`  adesões:       ${adesoes.length}`);
  for (const [codigo, n] of [...porProduto].sort((a, b) => b[1] - a[1])) {
    const aviso = conhecidos.has(codigo) ? "" : "  << SEM DE-PARA";
    console.log(`    ${codigo.padEnd(28)} ${n}${aviso}`);
  }
}

async function main() {
  const inicio = Date.now();

  if (!crmConfigurado()) {
    console.error(
      "[crm-sync] CRM_SUPABASE_URL e/ou CRM_SUPABASE_SERVICE_KEY não configuradas. Nada a fazer.",
    );
    process.exit(1);
  }

  if (hasFlag("dry-run")) {
    await dryRun();
    return;
  }

  const criadas = await garantirDeParaPadrao();
  if (criadas > 0) console.log(`[crm-sync] de-para: ${criadas} produto(s) semeado(s)`);

  const r = await sincronizarCrm();

  if (!r.rodou) {
    console.error(`[crm-sync] não executou: ${r.motivo}`);
    process.exit(1);
  }

  console.log(
    `[crm-sync] vendas ganhas lidas: ${r.vendasGanhas} | linhas novas: ${r.linhasNovas} | atualizadas: ${r.linhasAtualizadas} | obras criadas: ${r.obrasCriadas}`,
  );

  if (r.assinadasSemVenda > 0) {
    console.log(
      `[crm-sync] ATENÇÃO: ${r.assinadasSemVenda} adesão(ões) assinada(s) sem venda marcada como ganha — veja a caixa própria na fila.`,
    );
  }

  if (r.naoClassificados.length > 0) {
    console.log(
      `[crm-sync] ATENÇÃO: ${r.naoClassificados.length} produto(s) sem de-para — nada foi descartado, estão na caixa de não classificados:`,
    );
    for (const p of r.naoClassificados) console.log(`   - ${p}`);
  }

  for (const erro of r.erros) console.error(`[crm-sync] erro: ${erro}`);

  console.log(`[crm-sync] fim em ${((Date.now() - inicio) / 1000).toFixed(1)}s`);

  // Erro em item isolado não derruba o job (o próximo ciclo tenta de novo),
  // mas precisa sair diferente de zero pro Railway marcar a execução.
  if (r.erros.length > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[crm-sync] falhou:", err);
    process.exit(1);
  });
