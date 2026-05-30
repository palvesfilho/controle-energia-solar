/**
 * Job mensal de snapshot da Análise de Créditos.
 *
 * Quando rodar (via cron):
 *   - todo dia útil de manhã: detecta "primeiro dia que o mês fechou" e
 *     grava snapshot + envia email
 *   - ou no dia 5 de cada mês: garante snapshot do mês anterior
 *
 * Lógica:
 *   - Para cada mês alvo (default: anterior + atual):
 *     - chama computeAnaliseCreditos(FULL escopo)
 *     - se completo=true E ainda não há snapshot completo desse mês,
 *       grava snapshot + envia email
 *     - se completo=false: ignora (mês ainda aberto)
 *
 * Uso:
 *   npx tsx scripts/run-analise-mensal.ts                      # mês anterior + corrente
 *   npx tsx scripts/run-analise-mensal.ts --ano=2026 --mes=4   # mês específico
 *   npx tsx scripts/run-analise-mensal.ts --force              # snapshot mesmo se incompleto
 *
 * Idempotente: re-execução só faz nada se o mês já tem snapshot completo.
 */
import { computeAnaliseCreditos } from "../src/lib/analise-creditos";
import {
  upsertSnapshot,
  marcarEmailEnviado,
  listarSnapshots,
} from "../src/lib/analise-snapshot";
import { enviarEmailResumo } from "../src/lib/analise-mensal-email";

function parseArg(name: string): string | undefined {
  const flag = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(flag));
  return arg ? arg.slice(flag.length) : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function mesAnteriorDe(mes: number, ano: number): { mes: number; ano: number } {
  return mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano };
}

async function processarMes(mes: number, ano: number, force: boolean) {
  console.log(`[analise-mensal] processando ${String(mes).padStart(2, "0")}/${ano}`);
  const payload = await computeAnaliseCreditos({ mes, ano });
  const completo = payload.completude.completo;
  const ucsFaltantes = payload.completude.ucsFaltantes.length;

  if (!completo && !force) {
    console.log(
      `  → mês incompleto (${ucsFaltantes} fatura(s) faltando). Pulando snapshot.`,
    );
    return;
  }

  // Existe snapshot completo desse mês?
  const existentes = await listarSnapshots({
    escopoTipo: "FULL",
    escopoId: null,
  });
  const existente = existentes.find(
    (s) => s.mesReferencia === mes && s.anoReferencia === ano,
  );
  const jaTinhaCompleto = existente?.completo ?? false;

  const id = await upsertSnapshot({
    mes,
    ano,
    escopoTipo: "FULL",
    escopoId: null,
    completo,
    payload,
    geradoPorUserId: null,
  });
  console.log(
    `  → snapshot ${existente ? "atualizado" : "criado"} (id=${id}, completo=${completo})`,
  );

  // Envia email só quando virar completo PELA PRIMEIRA VEZ
  if (completo && !jaTinhaCompleto) {
    const destinatarios = (process.env.ANALISE_EMAIL_DESTINATARIOS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (destinatarios.length === 0) {
      console.log("  → email: ANALISE_EMAIL_DESTINATARIOS não setado, pulando");
    } else {
      const r = await enviarEmailResumo({ payload, destinatarios });
      if (r.enviado) {
        await marcarEmailEnviado({ snapshotId: id, destinatarios });
        console.log(`  → email enviado pra ${destinatarios.length} destinatário(s)`);
      } else {
        console.log(`  → email NÃO enviado: ${r.motivo}`);
      }
    }
  }
}

async function main() {
  const force = hasFlag("force");
  const argMes = parseArg("mes");
  const argAno = parseArg("ano");

  const meses: { mes: number; ano: number }[] = [];
  if (argMes && argAno) {
    meses.push({ mes: Number(argMes), ano: Number(argAno) });
  } else {
    const hoje = new Date();
    const atual = { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };
    const ant = mesAnteriorDe(atual.mes, atual.ano);
    meses.push(ant, atual);
  }

  console.log(
    `[analise-mensal] início — ${meses.length} mês(es) | force=${force}`,
  );
  const start = Date.now();
  for (const m of meses) {
    try {
      await processarMes(m.mes, m.ano, force);
    } catch (err) {
      console.error(`  ✗ erro processando ${m.mes}/${m.ano}:`, err);
    }
  }
  console.log(
    `[analise-mensal] fim em ${((Date.now() - start) / 1000).toFixed(1)}s`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
