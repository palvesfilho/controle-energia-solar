/**
 * `ultimaLeitura` é o relógio em que a detecção de usina parada se apoia:
 * `sync-alerts.ts` conta HORAS DE SOL desde este campo. Quem grava "agora" sem
 * ter lido nada CEGA o alarme — a usina muda aparece recém-lida e nunca alerta.
 *
 * Medido em 31/08/2026 na Huawei, logo após um clique em "Atualizar": 127 de
 * 129 usinas com `ultimaLeitura` < 2h, 20 delas OFFLINE no portal e UM único
 * alerta aberto. E em 03/09/2026: 83 usinas com leitura dos últimos 7 dias e
 * ZERO log de geração no período.
 *
 * Regra única desta camada: o carimbo vem do DADO, nunca do instante da nossa
 * rodada, e nunca anda para trás. O coletor intradiário já faz assim
 * (`marcarComunicacao` usa a hora da amostra); aqui as rotinas de geração
 * DIÁRIA e os botões manuais passam a fazer o mesmo, com a granularidade que
 * têm — o dia.
 */

/**
 * Gerou hoje ou ontem = ONLINE. É a mesma régua da WEG, e a razão dela: o
 * `status` do inversor PISCA (offline/online várias vezes ao dia), então quem
 * decide é a ENERGIA. Foi alarme por status que deixou uma usina 119 dias
 * parada sem ninguém ver.
 */
export const LIMITE_ONLINE_MS = 48 * 3600_000;

/** Fim do dia em Brasília (UTC-3) — 02:59:59Z do dia seguinte. */
function fimDoDiaBrt(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59) + 3 * 3600_000);
}

/**
 * Carimbo a partir de um DIA com geração.
 *
 * Não sabemos a que hora do dia o inversor comunicou; o mais tarde que pode ter
 * sido é o fim daquele dia. Assumir o meio-dia adiantaria o relógio da mudez em
 * meio dia e acenderia alerta em usina que está bem. No dia corrente o teto é
 * `agora` — carimbo no futuro apareceria como "há -3h" na tela.
 */
export function leituraDoDia(
  year: number,
  month: number,
  day: number,
  agora: Date = new Date(),
): Date {
  const carimbo = fimDoDiaBrt(year, month, day);
  return carimbo > agora ? agora : carimbo;
}

/** O mesmo, a partir da data de um `MonitoringLog` (gravado a 12:00Z do dia). */
export function leituraDoLog(data: Date, agora: Date = new Date()): Date {
  return leituraDoDia(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate(), agora);
}

/**
 * Último dia do lote que PROVA comunicação. `undefined` = a plataforma não nos
 * deu prova nenhuma, e então não se escreve nada.
 *
 * 0,0 kWh não prova: na Growatt é exatamente o que um datalogger mudo responde
 * (ver `dia-sem-dado.ts`). Quem comunica gerando zero — inversor em falha que
 * responde 0 W — é carimbado pelo coletor intradiário, que enxerga a amostra.
 */
export function leituraDoUltimoDiaComGeracao(
  dias: Array<{ day: number; energyKwh: number }>,
  year: number,
  month: number,
  agora: Date = new Date(),
): Date | undefined {
  let ultimo = 0;
  for (const d of dias) {
    if (d.energyKwh > 0 && d.day > ultimo) ultimo = d.day;
  }
  if (ultimo === 0) return undefined;
  return leituraDoDia(year, month, ultimo, agora);
}

/**
 * Só deixa o carimbo AVANÇAR, e devolve o pedaço do `data:` do Prisma pronto
 * para espalhar. Uma rodada de mês passado traz o último dia DAQUELE mês —
 * gravar isso por cima de uma leitura de hoje faria a usina parecer parada e
 * acenderia alerta falso.
 */
export function avancoDeLeitura(
  atual: Date | null | undefined,
  candidato: Date | null | undefined,
): { ultimaLeitura?: Date } {
  if (!candidato) return {};
  if (atual && atual.getTime() >= candidato.getTime()) return {};
  return { ultimaLeitura: candidato };
}

/**
 * Status pela evidência: promove a ONLINE quando a leitura é fresca, e no resto
 * dos casos devolve `undefined` — o Prisma ignora o campo e o rótulo que já
 * estava fica onde estava. Rebaixar sem prova é o defeito que jogou 249 usinas
 * SolarEdge para SEM_DADOS em 19/08/2026, e `SEM_DADOS` é justamente o rótulo
 * que ESCONDE a usina do detector de mudez (`sync-alerts.ts:128`).
 */
export function statusPorEvidencia(
  leitura: Date | undefined,
  agora: Date = new Date(),
): "ONLINE" | undefined {
  if (!leitura) return undefined;
  return agora.getTime() - leitura.getTime() < LIMITE_ONLINE_MS ? "ONLINE" : undefined;
}
