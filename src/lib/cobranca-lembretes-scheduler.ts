/**
 * Agendador dos lembretes de cobrança — uma vez por dia, às 9h de Brasília.
 *
 * Mesmo desenho de `crm-sync-scheduler.ts`, e pelas mesmas razões:
 *
 * 1. **Dentro do app, não num serviço de cron do Railway.** Os arquivos
 *    `railway.cron-*.json` existem no repositório e NUNCA rodaram — arquivo de
 *    configuração não cria serviço, e ninguém criou no painel. Aqui o agendador
 *    sobe junto com o deploy.
 *
 * 2. **O dia devido é calculado, não contado.** A cada tique ele pergunta "qual
 *    é o dia de hoje?" e compara com o gravado. Se o contêiner passou a manhã
 *    fora e voltou às 14h, o dia ainda está devido e roda na hora. Cron não faz
 *    isso: rodada perdida é rodada perdida — e aqui rodada perdida é cliente
 *    que não foi lembrado do vencimento.
 *
 * 3. **A marca fica no banco.** Deploy e restart não podem fazer o mesmo dia
 *    rodar de novo, e duas instâncias não podem rodar juntas.
 *
 * 🔑 A dupla proteção é de propósito: esta marca evita a RODADA repetida, e o
 * `@@unique` de `CobrancaLembrete` evita a MENSAGEM repetida. A primeira falha
 * silenciosamente numa corrida entre instâncias; a segunda é o banco dizendo
 * não. Em cobrança, duas travas independentes valem o custo.
 *
 * 9h de propósito: é quando alguém lê uma mensagem sobre conta a pagar. Às 3h
 * da manhã o aviso chega, mas incomoda e some na rolagem.
 */
import { prisma } from "@/lib/prisma";
import { dispararLembretesDoDia, type ResultadoLembretes } from "@/lib/cobranca-lembretes";

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Hora de Brasília em que os lembretes saem. */
export const HORA_BRT = 9;

const KEY_DIA = "cobranca.lembretes.ultimoDia";
const KEY_TENTATIVA = "cobranca.lembretes.ultimaTentativa";

/** Janela antes de outra instância poder tentar de novo após uma falha. */
const RETENTATIVA_MS = 10 * 60 * 1000;

const TICK_MS = 5 * 60 * 1000;

/**
 * O dia devido, no formato "2026-09-06". Antes das 9h BRT o dia devido ainda é
 * o ANTERIOR — assim um contêiner que sobe às 7h não consome o dia de hoje sem
 * ter chegado a hora.
 */
export function diaDevido(agora: number): string {
  const brt = new Date(agora - BRT_OFFSET_MS);
  if (brt.getUTCHours() < HORA_BRT) {
    brt.setUTCDate(brt.getUTCDate() - 1);
  }
  return brt.toISOString().slice(0, 10);
}

async function marcar(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Reserva o direito de rodar — escrita condicional, igual ao sync do CRM: só
 * ganha quem consegue mover a marca de tentativa, e ela só se move se a última
 * for antiga.
 */
async function reservar(agora: number): Promise<boolean> {
  const agoraIso = new Date(agora).toISOString();
  const limiteIso = new Date(agora - RETENTATIVA_MS).toISOString();
  const movida = await prisma.appSetting.updateMany({
    where: { key: KEY_TENTATIVA, value: { lt: limiteIso } },
    data: { value: agoraIso },
  });
  if (movida.count > 0) return true;
  try {
    await prisma.appSetting.create({ data: { key: KEY_TENTATIVA, value: agoraIso } });
    return true;
  } catch {
    return false;
  }
}

export interface ResultadoTickLembretes {
  dia: string;
  rodou: boolean;
  motivo?: string;
  resultado?: ResultadoLembretes;
}

/** Não lança: um tique ruim não pode derrubar o agendador. */
export async function tickLembretes(
  agora: number = Date.now(),
): Promise<ResultadoTickLembretes> {
  const dia = diaDevido(agora);
  try {
    const marca = await prisma.appSetting.findUnique({ where: { key: KEY_DIA } });
    if (marca?.value === dia) return { dia, rodou: false, motivo: "dia já processado" };

    if (!(await reservar(agora))) {
      return { dia, rodou: false, motivo: "outra execução pegou este dia (ou falha recente)" };
    }

    const resultado = await dispararLembretesDoDia(new Date(agora));

    // Cadência desligada também marca o dia: sem isso o agendador tentaria de
    // novo a cada 5 minutos, para não fazer nada.
    await marcar(KEY_DIA, dia);
    return { dia, rodou: true, resultado };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { dia, rodou: false, motivo: `erro: ${msg}` };
  }
}

const FLAG = Symbol.for("gestor-creditos.cobranca-lembretes-scheduler");
type GlobalComFlag = typeof globalThis & { [FLAG]?: { handle: NodeJS.Timeout } };

export function registrarLembretesScheduler(): void {
  const g = globalThis as GlobalComFlag;
  if (g[FLAG]) return;

  const tick = async () => {
    const r = await tickLembretes();
    if (r.rodou && r.resultado) {
      const x = r.resultado;
      if (x.candidatas > 0 || x.enviados > 0 || x.falhas > 0) {
        console.log(
          `[cobranca-lembretes] ${r.dia} modo=${x.modo} candidatas=${x.candidatas} ` +
            `enviados=${x.enviados} falhas=${x.falhas} jaEnviados=${x.jaEnviados}`,
        );
        for (const d of x.detalhes) console.log(`  ${d}`);
      }
    }
  };

  // Primeiro tique após 90s (deixa o server estabilizar e não briga com o
  // alert-scheduler, que acorda aos 60s), depois de 5 em 5 minutos.
  setTimeout(() => {
    void tick();
    g[FLAG] = { handle: setInterval(() => void tick(), TICK_MS) };
  }, 90_000);

  console.log(`[cobranca-lembretes] registrado — ${HORA_BRT}h BRT, confere a cada 5 min`);
}
