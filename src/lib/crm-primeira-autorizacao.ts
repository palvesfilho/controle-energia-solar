/**
 * Vigia da PRIMEIRA adesão assinada com a Autorização de Acesso.
 *
 * A autorização entrou no envelope da adesão em 21/08/2026 (commit 9536009 aqui,
 * d09445b no CRM), mas subiu numa janela sem nenhum envelope em voo: os 26
 * existentes eram todos do mundo antigo, de dois documentos. Ou seja, o caminho
 * inteiro — envelope de três, cópia para o cadastro, fechamento da venda — nunca
 * rodou com cliente real.
 *
 * Este módulo existe para que ninguém precise LEMBRAR de conferir. Quando o
 * primeiro envelope com autorização aparecer, a fila do CRM avisa — e traz o
 * veredito do que dá para conferir sozinho.
 *
 * 🔑 O que ele confere sozinho, e por quê: em 15/08/2026, das 22 adesões
 * medidas, **14 tinham termo e procuração em colunas trocadas** lá na origem. A
 * causa era o CRM casar id de documento por POSIÇÃO numa listagem cuja ordem a
 * Clicksign não garante; passou a casar pelo NOME do arquivo. A prova de que a
 * correção pegou só existe numa adesão nova — e é justamente ela que este
 * módulo intercepta. `separarTermoEProcuracao` classifica pelo CONTEÚDO e
 * devolve `invertido`: é esse o veredito.
 *
 * O resultado fica gravado em `AppSetting` porque a conferência baixa três PDFs
 * do CRM e lê a primeira página de dois deles — caro demais para refazer a cada
 * vez que alguém abre a fila.
 */
import { prisma } from "@/lib/prisma";
import {
  buscarPdfAssinado,
  listarAdesoes,
  listarEnvelopesAssinatura,
  listarEnvelopesComAutorizacaoAssinada,
} from "@/lib/crm-supabase";
import { separarTermoEProcuracao } from "@/lib/crm-envelope-pdfs";

/**
 * Vereditos já calculados, por envelope: `{ [envelopeId]: PrimeiraAutorizacao }`.
 * Conferir custa três downloads e duas leituras de PDF — não se refaz.
 */
const KEY_VEREDITOS = "crm.autorizacao.vereditos";
/**
 * Ids de envelope cujo aviso o operador já arquivou.
 *
 * 🔑 É por envelope, e não um "já vi" global: em 22/08/2026 a primeira adesão
 * com autorização a chegar foi um TESTE ("ASDFASD ASDFASD"). Com um marcador
 * global, arquivar o teste teria calado o aviso da primeira adesão REAL — o
 * único caso que este módulo existe para pegar.
 */
const KEY_DISPENSADOS = "crm.autorizacao.dispensados";

export interface PrimeiraAutorizacao {
  envelopeId: string;
  adesaoId: number | null;
  cliente: string | null;
  assinadoEm: string | null;
  /** Os três documentos estão guardados no envelope? */
  temTermo: boolean;
  temProcuracao: boolean;
  temAutorizacao: boolean;
  /**
   * `true` = o conteúdo contrariou o nome da coluna, ou seja, o defeito das 14
   * de 22 AINDA acontece nas adesões novas. `null` = não deu para afirmar
   * (PDF ilegível ou faltando) — e aí não se chuta.
   */
  colunasTrocadas: boolean | null;
  /** Quando este veredito foi calculado (ISO). */
  conferidoEm: string;
}

export interface EstadoPrimeiraAutorizacao {
  /** Há envelope com autorização AINDA NÃO arquivado para anunciar. */
  chegou: boolean;
  primeira?: PrimeiraAutorizacao;
  /** Quantos envelopes já têm autorização — pode passar de 1 com o tempo. */
  total: number;
  /** Quantos já foram arquivados pelo operador. */
  dispensados: number;
}

function base64ParaBuffer(b64: string | null): Buffer | null {
  if (!b64) return null;
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

/**
 * Baixa os três PDFs e diz se termo e procuração vieram nas colunas certas.
 * Chamado UMA vez por envelope; o resultado é gravado.
 */
async function conferirEnvelope(
  envelopeId: string,
  adesaoId: number | null,
  cliente: string | null,
  assinadoEm: string | null,
): Promise<PrimeiraAutorizacao> {
  const [termoB64, procuracaoB64, autorizacaoB64] = await Promise.all([
    buscarPdfAssinado(envelopeId, "termo"),
    buscarPdfAssinado(envelopeId, "procuracao"),
    buscarPdfAssinado(envelopeId, "autorizacao"),
  ]);

  const colunaTermo = base64ParaBuffer(termoB64);
  const colunaProcuracao = base64ParaBuffer(procuracaoB64);

  // Sem os dois não há troca possível de medir — e `null` diz "não sei",
  // que é diferente de "está certo".
  let colunasTrocadas: boolean | null = null;
  if (colunaTermo && colunaProcuracao) {
    try {
      const r = await separarTermoEProcuracao({ colunaTermo, colunaProcuracao });
      colunasTrocadas = r.invertido;
    } catch {
      colunasTrocadas = null;
    }
  }

  return {
    envelopeId,
    adesaoId,
    cliente,
    assinadoEm,
    temTermo: Boolean(colunaTermo),
    temProcuracao: Boolean(colunaProcuracao),
    temAutorizacao: Boolean(autorizacaoB64),
    colunasTrocadas,
    conferidoEm: new Date().toISOString(),
  };
}

/** Lê uma chave que guarda JSON, tolerando lixo. */
async function lerJson<T>(key: string, padrao: T): Promise<T> {
  const linha = await prisma.appSetting.findUnique({ where: { key } });
  if (!linha) return padrao;
  try {
    return JSON.parse(linha.value) as T;
  } catch {
    return padrao; // conteúdo corrompido não derruba a tela
  }
}

async function gravarJson(key: string, valor: unknown): Promise<void> {
  const value = JSON.stringify(valor);
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

/**
 * O próximo envelope com autorização que ainda merece aviso.
 *
 * "Próximo" é o mais ANTIGO ainda não arquivado — a ordem em que os fatos
 * aconteceram. Só vai ao CRM baixar PDF na primeira vez que cada envelope
 * aparece; depois o veredito vem do que ficou guardado.
 */
export async function estadoPrimeiraAutorizacao(): Promise<EstadoPrimeiraAutorizacao> {
  const comAutorizacao = await listarEnvelopesComAutorizacaoAssinada();
  const dispensados = new Set(await lerJson<string[]>(KEY_DISPENSADOS, []));

  const total = comAutorizacao.size;
  if (total === 0) return { chegou: false, total: 0, dispensados: dispensados.size };

  const pendentes = [...comAutorizacao].filter((id) => !dispensados.has(id));
  if (pendentes.length === 0) return { chegou: false, total, dispensados: dispensados.size };

  const envelopes = (await listarEnvelopesAssinatura())
    .filter((e) => pendentes.includes(String(e.id)))
    .sort((a, b) => String(a.criado_em ?? "").localeCompare(String(b.criado_em ?? "")));

  const alvo = envelopes[0];
  if (!alvo) return { chegou: false, total, dispensados: dispensados.size };
  const envelopeId = String(alvo.id);

  const vereditos = await lerJson<Record<string, PrimeiraAutorizacao>>(KEY_VEREDITOS, {});
  const jaConferido = vereditos[envelopeId];
  if (jaConferido) {
    return { chegou: true, primeira: jaConferido, total, dispensados: dispensados.size };
  }

  const adesoes = await listarAdesoes();
  const cliente = adesoes.find((a) => a.id === alvo.adesao_id)?.cliente_nome ?? null;

  const primeira = await conferirEnvelope(envelopeId, alvo.adesao_id, cliente, alvo.assinado_em);
  vereditos[envelopeId] = primeira;
  await gravarJson(KEY_VEREDITOS, vereditos);

  console.log(
    `[primeira-autorizacao] CHEGOU — envelope ${envelopeId} (${cliente ?? "cliente ?"}): ` +
      `termo=${primeira.temTermo} procuracao=${primeira.temProcuracao} ` +
      `autorizacao=${primeira.temAutorizacao} colunasTrocadas=${primeira.colunasTrocadas}`,
  );

  return { chegou: true, primeira, total, dispensados: dispensados.size };
}

/**
 * Arquiva o aviso DESTE envelope. O veredito continua guardado (é histórico);
 * o que muda é que ele para de aparecer — e o próximo envelope com autorização
 * volta a avisar, do zero.
 */
export async function arquivarAviso(envelopeId: string): Promise<void> {
  const dispensados = await lerJson<string[]>(KEY_DISPENSADOS, []);
  if (dispensados.includes(envelopeId)) return;
  await gravarJson(KEY_DISPENSADOS, [...dispensados, envelopeId]);
}
