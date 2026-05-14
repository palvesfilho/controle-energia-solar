/**
 * Instrumentação Next.js — registra schedulers de background no boot do server.
 *
 * Roda uma vez por processo (HMR no dev pode reimportar; usamos guard no globalThis
 * pra não duplicar). Em deploy serverless (Vercel), setInterval não persiste —
 * trocar por Vercel Cron / similar lá.
 */

const SCHEDULER_FLAG = Symbol.for("gestor-creditos.alert-scheduler");

type GlobalWithFlag = typeof globalThis & {
  [SCHEDULER_FLAG]?: { handle: NodeJS.Timeout };
};

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_ALERT_SCHEDULER === "1") return;

  const g = globalThis as GlobalWithFlag;
  if (g[SCHEDULER_FLAG]) return;

  const { runAlertSync } = await import("@/lib/sync-alerts");

  const HOUR_MS = 60 * 60 * 1000;

  const tick = async () => {
    try {
      const r = await runAlertSync();
      const totalResolved =
        r.autoResolved.offline +
        r.autoResolved.lowGeneration +
        r.autoResolved.erroInversor +
        r.autoResolved.temperatura +
        r.autoResolved.frequencia +
        r.autoResolved.tensao +
        r.autoResolved.contrato;
      console.log(
        `[alert-scheduler] tick: created=${r.alertsCreated} resolved=${totalResolved}`,
      );
    } catch (e) {
      console.error("[alert-scheduler] erro no tick:", e);
    }
  };

  // Primeiro tick após 60s (deixa o server estabilizar antes), depois a cada hora.
  setTimeout(() => {
    void tick();
    const handle = setInterval(() => void tick(), HOUR_MS);
    g[SCHEDULER_FLAG] = { handle };
  }, 60_000);

  console.log("[alert-scheduler] registrado — primeiro tick em 60s, depois a cada 1h");
}
