/**
 * Cliente do serviço de robôs de faturas (FastAPI + Selenium, no Railway).
 *
 * O robô baixa as segundas vias do portal da concessionária. Ele é um serviço à
 * parte porque Selenium não roda dentro do Next, e um download leva de minutos a
 * horas — a CPFL chega a pôr uma fila de acesso de até 45 min na frente do login.
 * Por isso o contrato é assíncrono: cria-se um job, recebe-se o id na hora, e
 * pergunta-se o andamento depois.
 *
 * ESTE é o único arquivo que conhece o serviço. Duas coisas nunca podem vazar dele:
 *   - a ROBO_API_KEY (fica no servidor; jamais vai para o navegador);
 *   - a senha do portal, que viaja na criação do job e NÃO é persistida lá.
 *
 * Config: ROBO_URL e ROBO_API_KEY (Railway → serviço controle-energia-solar).
 */

export interface CredencialPortal {
  nome: string;
  email: string;
  senha: string;
}

export type StatusJob =
  | "pendente"
  | "executando"
  | "concluido"
  | "falhou"
  | "cancelado";

export interface FaturaDoRobo {
  uc: string;
  mes: string;
  /** "baixada" | "em_aberto" | "indisponivel" | "falha" | "falha_envio" */
  status: string;
  detalhe: string;
  /** URL pública (quando o bucket tem domínio) — senão vem só a `chave`. */
  arquivo: string | null;
  /** Caminho do objeto no armazenamento do robô. É por ele que se busca o PDF. */
  chave?: string | null;
  jaExistia?: boolean;
}

export interface ResultadoJob {
  status: StatusJob;
  progresso: string;
  erro: string | null;
  /**
   * `completo` é o campo que decide se deu certo — NÃO use status === "concluido".
   * O robô segue em frente quando o portal falha numa UC, em vez de abortar tudo:
   * um job pode terminar "concluido" com completo=false e UCs incompletas.
   */
  completo: boolean | null;
  faturas: FaturaDoRobo[];
  ucsIncompletas: string[];
}

export class RoboIndisponivelError extends Error {}

function config(): { url: string; chave: string } {
  const url = process.env.ROBO_URL;
  const chave = process.env.ROBO_API_KEY;
  if (!url || !chave) {
    throw new RoboIndisponivelError(
      "Serviço de robôs não configurado (defina ROBO_URL e ROBO_API_KEY).",
    );
  }
  return { url: url.replace(/\/$/, ""), chave };
}

async function pedir(caminho: string, init?: RequestInit): Promise<Response> {
  const { url, chave } = config();
  let resposta: Response;
  try {
    resposta = await fetch(`${url}${caminho}`, {
      ...init,
      headers: { "X-API-Key": chave, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch (err) {
    throw new RoboIndisponivelError(
      `Não consegui falar com o serviço de robôs: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new RoboIndisponivelError(
      `Serviço de robôs respondeu ${resposta.status}: ${detalhe.slice(0, 200)}`,
    );
  }
  return resposta;
}

/**
 * Dispara o download das faturas de UMA unidade consumidora.
 *
 * `codigosUc`: todos os identificadores conhecidos da UC (número novo, código
 * antigo, número da instalação). O robô entra apenas nas UCs que casarem com
 * algum deles — mandar os três protege da troca de código que a RGE fez em
 * jul/2026, em que a mesma UC passou a aparecer com número diferente no portal.
 *
 * `limiteFaturas`: máximo por UC; 0 = sem limite.
 */
export async function baixarFaturasDaUc(params: {
  credencial: CredencialPortal;
  codigosUc: string[];
  limiteFaturas: number;
}): Promise<{ jobId: string }> {
  const codigos = [...new Set(params.codigosUc.filter(Boolean))];
  const resposta = await pedir("/jobs/faturas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientes: [params.credencial],
      ucs: codigos,
      limite_faturas: params.limiteFaturas,
    }),
  });
  const json = (await resposta.json()) as { id: string };
  return { jobId: json.id };
}

/** Andamento de um job, já achatado no que a tela precisa. */
export async function consultarJob(jobId: string): Promise<ResultadoJob> {
  const resposta = await pedir(`/jobs/${encodeURIComponent(jobId)}`);
  const job = (await resposta.json()) as {
    status: StatusJob;
    progresso?: string;
    erro?: string | null;
    resultado?: {
      completo?: boolean;
      clientes?: Array<{
        erro?: string;
        ucs_incompletas?: string[];
        faturas?: Array<{
          uc: string;
          mes: string;
          status: string;
          detalhe?: string;
          arquivo?: string | null;
          chave?: string | null;
          ja_existia?: boolean;
        }>;
      }>;
    } | null;
  };

  const faturas: FaturaDoRobo[] = [];
  const ucsIncompletas: string[] = [];
  // O robô nunca aborta por um cliente: ele registra o motivo em `clientes[].erro`
  // e segue. Esse é o campo que carrega diagnósticos acionáveis — "esta conta não
  // tem UC vinculada", por exemplo. Sem lê-lo, a tela só mostraria "0 faturas" e a
  // pessoa não saberia o que fazer.
  const motivos: string[] = [];
  for (const cliente of job.resultado?.clientes ?? []) {
    if (cliente.erro) motivos.push(cliente.erro);
    ucsIncompletas.push(...(cliente.ucs_incompletas ?? []));
    for (const f of cliente.faturas ?? []) {
      faturas.push({
        uc: f.uc,
        mes: f.mes,
        status: f.status,
        detalhe: f.detalhe ?? "",
        arquivo: f.arquivo ?? null,
        chave: f.chave ?? null,
        jaExistia: f.ja_existia ?? false,
      });
    }
  }

  return {
    status: job.status,
    progresso: job.progresso ?? "",
    // O erro do job (falha técnica) tem precedência; na falta dele, o motivo que
    // o robô registrou por cliente é o que explica um resultado vazio.
    erro: job.erro ?? (motivos.length ? motivos.join(" ") : null),
    completo: job.resultado?.completo ?? null,
    faturas,
    ucsIncompletas,
  };
}

/** Pede para o robô parar entre uma fatura e outra (preserva o que já baixou). */
export async function cancelarJob(jobId: string): Promise<void> {
  await pedir(`/jobs/${encodeURIComponent(jobId)}/cancelar`, { method: "POST" });
}

/**
 * Baixa o PDF de uma fatura já processada pelo robô.
 *
 * Prefere a `chave` (o serviço busca no armazenamento e reentrega, autenticado).
 * A URL pública do bucket só é usada quando não há chave — é o caso de um bucket
 * com domínio próprio, em que o arquivo é servido direto.
 */
export async function baixarPdfDaFatura(
  fatura: FaturaDoRobo,
): Promise<ArrayBuffer> {
  if (fatura.chave) {
    const resposta = await pedir(
      `/arquivos/${fatura.chave.split("/").map(encodeURIComponent).join("/")}`,
    );
    return resposta.arrayBuffer();
  }
  if (fatura.arquivo?.startsWith("http")) {
    const resposta = await fetch(fatura.arquivo, { cache: "no-store" });
    if (!resposta.ok) {
      throw new RoboIndisponivelError(
        `Não consegui baixar o PDF (${resposta.status}).`,
      );
    }
    return resposta.arrayBuffer();
  }
  throw new RoboIndisponivelError("Fatura sem caminho de arquivo.");
}
