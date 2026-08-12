/**
 * Memória de quais inversores cada usina tem — persistida, não derivada.
 *
 * Por que existe
 * -------------
 * O coletor descobre os inversores de uma usina pela API da plataforma e, até
 * agora, "lembrava" dessa descoberta lendo os `InverterSample` dos últimos 7
 * dias (`dispositivosConhecidos`). Isso funciona enquanto a usina gera: a
 * própria amostra é o registro. Mas cria um laço quando ela NÃO gera, ou quando
 * a chamada de dados falha:
 *
 *   descobre os inversores → a busca de dados leva 407 → nenhuma amostra é
 *   gravada → a usina continua "sem dispositivo conhecido" → na rodada seguinte
 *   é redescoberta do zero, gastando de novo o endpoint mais escasso.
 *
 * Medido na Huawei em 12/08/26: 27 inversores descobertos numa rodada e
 * descartados na mesma rodada; o contador "(79 ainda sem dispositivo conhecido)"
 * não descia havia dias. Ver [[project_huawei_cota_407_descoberta]].
 *
 * Por que aqui e não numa tabela própria
 * --------------------------------------
 * `AppSetting` é chave/valor e já existe. Uma tabela `InverterDevice` seria mais
 * limpa, mas exigiria migração no Postgres de PRODUÇÃO — e o ganho não paga o
 * risco enquanto o volume é de ~100 usinas por plataforma.
 *
 * ⚠️ NÃO usar `InverterSample` com valores nulos como memória de descoberta: a
 * linha mexe em `ultimaAmostra`/`ultimaLeitura` e silenciaria o alerta OFFLINE
 * de uma usina realmente parada.
 */
import { prisma } from "./prisma";

/**
 * Depois disso a usina volta pra fila de descoberta.
 *
 * Existe porque inversor trocado ou usina remanejada mudam o `devId`, e uma
 * memória eterna deixaria o coletor pedindo dado de um aparelho que não existe
 * mais — falha silenciosa, que é o modo de falha desta integração inteira.
 */
const VALIDADE_DIAS = 30;

interface RegistroMemoria {
  /** psKeys no formato do adapter da plataforma (ex.: `HW:38:1000000123`). */
  d: string[];
  /** ISO date da última vez que a descoberta confirmou esses dispositivos. */
  em: string;
}

type Memoria = Record<string, RegistroMemoria>;

function chave(plataforma: string): string {
  return `intraday.devices.${plataforma}`;
}

function venceu(em: string, agora: Date): boolean {
  const t = Date.parse(em);
  if (Number.isNaN(t)) return true;
  return agora.getTime() - t > VALIDADE_DIAS * 24 * 60 * 60 * 1000;
}

/**
 * Dispositivos memorizados por usina, já sem os vencidos.
 *
 * Nunca lança: memória corrompida ou ausente vale como "não sei de ninguém" —
 * o pior efeito possível é uma rodada de descoberta a mais, e derrubar a coleta
 * inteira por causa de um JSON quebrado seria muito pior.
 */
export async function lerDispositivosMemorizados(
  plataforma: string,
  agora = new Date(),
): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: chave(plataforma) } });
    if (!row) return mapa;
    const bruto = JSON.parse(row.value) as Memoria;
    for (const [clientId, reg] of Object.entries(bruto)) {
      // Lista VAZIA é devolvida de propósito. Ela significa "já perguntamos, e
      // esta usina não tem inversor cadastrado" — descartá-la aqui devolveria a
      // usina à fila de descoberta em toda rodada, que é exatamente o laço que
      // este módulo veio desfazer. Só a validade tira alguém da memória.
      if (!reg || !Array.isArray(reg.d) || venceu(reg.em, agora)) continue;
      mapa.set(clientId, reg.d);
    }
  } catch {
    return mapa;
  }
  return mapa;
}

/**
 * Grava as descobertas da rodada, mesclando com o que já havia e podando o que
 * venceu. `descobertos` traz apenas as usinas consultadas nesta rodada — quem
 * não foi consultado permanece como estava.
 *
 * Uma usina consultada que respondeu SEM nenhum inversor é gravada com a lista
 * vazia de propósito: é informação ("essa usina não tem inversor cadastrado"),
 * e sem isso ela voltaria pra fila de descoberta para sempre — o mesmo laço que
 * este módulo veio desfazer.
 */
export async function gravarDispositivosMemorizados(
  plataforma: string,
  descobertos: Map<string, string[]>,
  agora = new Date(),
): Promise<void> {
  if (descobertos.size === 0) return;
  const k = chave(plataforma);
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: k } });
    const atual: Memoria = row ? (JSON.parse(row.value) as Memoria) : {};

    for (const [clientId, reg] of Object.entries(atual)) {
      if (venceu(reg?.em ?? "", agora)) delete atual[clientId];
    }
    const em = agora.toISOString();
    for (const [clientId, psKeys] of descobertos) {
      atual[clientId] = { d: [...new Set(psKeys)], em };
    }

    const value = JSON.stringify(atual);
    await prisma.appSetting.upsert({
      where: { key: k },
      update: { value },
      create: { key: k, value },
    });
  } catch {
    // Memória é otimização, não fonte da verdade: falhar aqui não pode derrubar
    // a coleta — na pior hipótese a próxima rodada redescobre.
  }
}

/** Esquece a memória de uma plataforma (usado por script de manutenção). */
export async function limparDispositivosMemorizados(plataforma: string): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: chave(plataforma) } });
}
