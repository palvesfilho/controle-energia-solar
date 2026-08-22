/**
 * Agendador do sync do CRM — roda sozinho às 13h e às 19h de Brasília.
 *
 * Por que dentro do app e não num serviço de cron do Railway: o
 * `railway.cron-crm-sync.json` existe no repositório desde 02/08/2026 e NUNCA
 * rodou, porque arquivo de configuração não cria serviço — e ninguém criou o
 * `cron-crm-sync` no painel. O mesmo aconteceu com o `backfill-monitoring-gaps`,
 * e o `cron-fechamento-poda` foi criado sem `DATABASE_URL`. Aqui o agendador
 * sobe junto com o deploy, sem depender de painel.
 *
 * O botão "Sincronizar" da fila (`POST /api/crm/sync`) continua valendo e é o
 * caminho de quem não quer esperar o próximo horário.
 *
 * Três decisões que valem explicação:
 *
 * 1. **O horário devido é calculado, não contado.** A cada tique o agendador
 *    pergunta "qual foi o último horário que já passou?" e compara com o que
 *    está gravado. Se o app passou o dia fora e voltou às 15h, o horário das
 *    13h ainda está devido e roda na hora — sem esperar as 19h. Cron não faz
 *    isso: rodada perdida é rodada perdida.
 *
 * 2. **Horário perdido não se acumula.** `sincronizarCrm()` relê o CRM inteiro
 *    a cada rodada (não é incremental), então uma execução já cobre todos os
 *    horários que se perderam. Rodar 4 vezes seguidas não traria nada a mais.
 *
 * 3. **A marca fica no banco, não na memória.** Reinício de contêiner (deploy,
 *    restart) não pode fazer o mesmo horário rodar de novo, e duas instâncias
 *    não podem rodar juntas. A reserva é uma escrita condicional em
 *    `AppSetting` — quem escreve, roda.
 */
import { prisma } from "@/lib/prisma";
import { crmConfigurado } from "@/lib/crm-supabase";
import { sincronizarCrm, type ResultadoSync } from "@/lib/crm-sync";

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Horários de Brasília em que o sync roda, todos os dias. */
export const HORARIOS_BRT = [13, 19] as const;

/** Último horário concluído com sucesso, ex.: "2026-08-22T19". */
const KEY_SLOT = "crm.sync.ultimoSlot";
/** Instante ISO da última tentativa — é a trava contra execução simultânea. */
const KEY_TENTATIVA = "crm.sync.tentativaEm";

/** Falhou (CRM fora do ar, rede)? Só tenta de novo depois disto. */
const RETENTATIVA_MS = 30 * 60 * 1000;
/** De quanto em quanto tempo o agendador olha o relógio. */
const INTERVALO_TICK_MS = 5 * 60 * 1000;
/** Deixa o server estabilizar antes do primeiro olhar. */
const ATRASO_INICIAL_MS = 60 * 1000;

function ymd(ano: number, mes0: number, dia: number): string {
  const d = new Date(Date.UTC(ano, mes0, dia));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * O último horário agendado que JÁ PASSOU, em Brasília.
 *
 * Antes das 13h ainda não passou nenhum hoje, então o devido é o das 19h de
 * ontem — é isso que faz o app recuperar sozinho a rodada perdida durante a
 * noite. Exportado para o script de conferência.
 */
export function slotDevido(agora: number = Date.now()): string {
  const b = new Date(agora - BRT_OFFSET_MS);
  const ano = b.getUTCFullYear();
  const mes0 = b.getUTCMonth();
  const dia = b.getUTCDate();
  const hora = b.getUTCHours();

  const passados = HORARIOS_BRT.filter((h) => h <= hora);
  if (passados.length > 0) {
    return `${ymd(ano, mes0, dia)}T${String(Math.max(...passados)).padStart(2, "0")}`;
  }
  const ultimo = HORARIOS_BRT[HORARIOS_BRT.length - 1];
  return `${ymd(ano, mes0, dia - 1)}T${String(ultimo).padStart(2, "0")}`;
}

/** Hora legível em BRT — nada de UTC em log que humano lê. */
function agoraBrt(agora: number = Date.now()): string {
  return new Date(agora).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function marcar(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Reserva o direito de rodar. Escrita condicional: só ganha quem consegue
 * mover a marca de tentativa, e só é possível movê-la se a última for antiga.
 * Duas instâncias no mesmo segundo → uma ganha, a outra desiste.
 */
async function reservar(agora: number): Promise<boolean> {
  const agoraIso = new Date(agora).toISOString();
  const limiteIso = new Date(agora - RETENTATIVA_MS).toISOString();

  // ISO em UTC compara igual como texto e como instante — daí o `lt` de string.
  const movida = await prisma.appSetting.updateMany({
    where: { key: KEY_TENTATIVA, value: { lt: limiteIso } },
    data: { value: agoraIso },
  });
  if (movida.count > 0) return true;

  // Primeira vez na vida: a linha ainda não existe. Se outra instância criar
  // no meio do caminho, o unique de `key` derruba esta e ela desiste.
  try {
    await prisma.appSetting.create({ data: { key: KEY_TENTATIVA, value: agoraIso } });
    return true;
  } catch {
    return false;
  }
}

export interface ResultadoTick {
  slot: string;
  rodou: boolean;
  /** Por que não rodou. Ausente quando rodou. */
  motivo?: string;
  resultado?: ResultadoSync;
}

/**
 * Um olhar no relógio: roda o sync se o horário devido ainda não foi feito.
 * Não lança — o agendador não pode morrer por causa de um tique ruim.
 */
export async function tickCrmSync(agora: number = Date.now()): Promise<ResultadoTick> {
  const slot = slotDevido(agora);

  try {
    const marca = await prisma.appSetting.findUnique({ where: { key: KEY_SLOT } });
    if (marca?.value === slot) return { slot, rodou: false, motivo: "horário já sincronizado" };

    if (!crmConfigurado()) {
      return { slot, rodou: false, motivo: "CRM_SUPABASE_URL/SERVICE_KEY ausentes" };
    }

    if (!(await reservar(agora))) {
      return { slot, rodou: false, motivo: "outra execução pegou este horário (ou falha recente)" };
    }

    const resultado = await sincronizarCrm();

    // O vigia da 1ª adesão com Autorização de Acesso: calcula o veredito no
    // horário do sync, e não no page-load de quem abrir a fila (ele baixa três
    // PDFs e lê a primeira página de dois). Loga sozinho quando ela chega.
    // Nunca derruba o sync — o aviso é acessório, a fila é o trabalho.
    try {
      const { estadoPrimeiraAutorizacao } = await import("@/lib/crm-primeira-autorizacao");
      await estadoPrimeiraAutorizacao();
    } catch (err) {
      console.error("[crm-sync-scheduler] vigia da autorizacao falhou:", err);
    }

    // Marca só o que deu certo: se o CRM estava fora, o horário continua
    // devido e a próxima tentativa acontece depois da janela de retentativa.
    if (resultado.rodou && resultado.erros.length === 0) await marcar(KEY_SLOT, slot);

    return { slot, rodou: true, resultado };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { slot, rodou: false, motivo: `erro: ${msg}` };
  }
}

const FLAG = Symbol.for("gestor-creditos.crm-sync-scheduler");
type GlobalComFlag = typeof globalThis & { [FLAG]?: { handle: NodeJS.Timeout } };

/**
 * Liga o agendador. Chamado uma vez no boot, por `instrumentation.ts`.
 *
 * ⚠️ Só em produção por padrão: o `.env` local aponta para o banco de produção,
 * então `next dev` ligado sincronizaria o CRM de verdade sem ninguém pedir.
 * Para testar na mão: `CRM_SYNC_SCHEDULER=1 npm run dev`.
 */
export function registrarCrmSyncScheduler(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_CRM_SYNC_SCHEDULER === "1") return;
  if (process.env.NODE_ENV !== "production" && process.env.CRM_SYNC_SCHEDULER !== "1") return;

  const g = globalThis as GlobalComFlag;
  if (g[FLAG]) return;

  const tick = async () => {
    const r = await tickCrmSync();
    if (!r.rodou) {
      // Silencioso no caso normal ("já sincronizado"): seriam 288 linhas por
      // dia dizendo que não havia nada a fazer.
      if (r.motivo && !r.motivo.startsWith("horário já")) {
        console.log(`[crm-sync-scheduler] ${r.slot}: ${r.motivo}`);
      }
      return;
    }
    const s = r.resultado;
    console.log(
      `[crm-sync-scheduler] ${r.slot} rodou em ${agoraBrt()} (BRT) — ` +
        `vendas ganhas: ${s?.vendasGanhas ?? 0} | linhas novas: ${s?.linhasNovas ?? 0} | ` +
        `UCs: ${(s?.ucsNovas ?? 0) + (s?.ucsAtualizadas ?? 0)} | obras: ${s?.obrasCriadas ?? 0}`,
    );
    for (const erro of s?.erros ?? []) console.error(`[crm-sync-scheduler] erro: ${erro}`);
    if ((s?.naoClassificados.length ?? 0) > 0) {
      console.log(
        `[crm-sync-scheduler] ${s?.naoClassificados.length} produto(s) sem de-para — nada descartado.`,
      );
    }
  };

  setTimeout(() => {
    void tick();
    const handle = setInterval(() => void tick(), INTERVALO_TICK_MS);
    g[FLAG] = { handle };
  }, ATRASO_INICIAL_MS);

  console.log(
    `[crm-sync-scheduler] registrado — ${HORARIOS_BRT.join("h e ")}h (BRT), confere a cada ${
      INTERVALO_TICK_MS / 60000
    } min`,
  );
}
