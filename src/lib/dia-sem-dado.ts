/**
 * Um dia que volta 0,0 kWh da API do fabricante NÃO distingue duas coisas muito
 * diferentes:
 *   - a usina existiu o dia todo e não gerou nada (raríssimo), e
 *   - o datalogger não mandou nada, então a plataforma não tem o que consolidar.
 *
 * Medido em 13/08/2026 na Growatt: a planta 620604 (SANDRA MARA CAMARGO RIGHI,
 * do proprietário SANDRO SOUZA DA SILVA) devolve 0,0 kWh em todos os dias desde
 * 15/04/2026 e vem com `status: 4` na lista de plantas — enquanto a fatura da
 * RGE do ciclo 17/06→20/07/2026 registrou **598 kWh injetados** no medidor. Ou
 * seja: a usina gerou, quem parou foi a comunicação. O backfill tinha gravado
 * 79 linhas de `0,0` como se fossem medição, e o relatório do cliente passou a
 * AFIRMAR que a usina não gerou nada.
 *
 * Ausência de linha é a verdade que temos ("não sei"); zero é uma afirmação
 * ("medi, e deu zero"). Não escrever o zero mantém a soma do mês igual e faz o
 * relatório mostrar lacuna em vez de mentir.
 *
 * Ver também `feedback_anomalias_sinalizar`: anomalia se sinaliza, não se
 * silencia — e o silêncio aqui era gravar zero.
 */
export function ehDiaSemDado(kwh: number | null | undefined): boolean {
  return !(typeof kwh === "number" && Number.isFinite(kwh) && kwh > 0);
}
