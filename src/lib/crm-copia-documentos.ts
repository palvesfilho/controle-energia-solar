/**
 * Copia os documentos de uma adesão do CRM para dentro do Gestor.
 *
 * POR QUE COPIAR, e não apontar para o CRM: em 15/08/2026, enquanto esta
 * integração era construída, a adesão 16 do INSTITUTO ELEVA foi apagada do CRM.
 * Referência morre com a origem; cópia não. O documento é prova de uma relação
 * comercial e precisa sobreviver à faxina de quem cuida do funil de vendas.
 *
 * ARQUIVO ÚNICO, N REFERÊNCIAS: a chave no storage é derivada da ADESÃO, não da
 * UC. Um titular com 11 UCs (a LABIMED) tem um contrato social só no bucket, e
 * as 11 linhas de `ConsumerUnit` guardam o mesmo caminho. Trocar o documento é
 * uma escrita, não onze.
 *
 * São sete documentos, no máximo um de cada por adesão (conferido: nenhuma
 * adesão do CRM tem dois arquivos da mesma categoria):
 *   termo de adesão, procuração e
 *   autorização de acesso         — PDFs assinados, base64 em `envelopes_assinatura`
 *   identidade, cartão CNPJ,
 *   contrato social, outros       — anexos no bucket R2 do CRM
 *
 * A autorização de acesso passou a ser assinada junto com os outros dois em
 * 21/08/2026 (migration 097 do CRM). Adesão assinada antes disso não tem esse
 * PDF e nunca vai ter — a ficha dela fica vazia, dizendo o que falta.
 *
 * A fatura de energia fica de fora de propósito: o Gestor precisa do NÚMERO da
 * UC, que já vem no termo; o PDF serve à conferência de comissão do vendedor e
 * continua no CRM.
 */
import { prisma } from "@/lib/prisma";
import { saveBufferToStorage } from "@/lib/file-storage";
import { lerDocumentoDoCrm } from "@/lib/crm-documentos";
import {
  buscarEnvelopeDaAdesao,
  corrigirMojibake,
  listarDocumentosDaAdesao,
} from "@/lib/crm-supabase";
import { separarTermoEProcuracao } from "@/lib/crm-envelope-pdfs";

/** Campos de `ConsumerUnit` preenchidos por esta cópia. */
export interface DocumentosCopiados {
  docTermoAdesao?: string;
  docTermoAdesaoNome?: string;
  docProcuracao?: string;
  docProcuracaoNome?: string;
  docAutorizacaoAcesso?: string;
  docAutorizacaoAcessoNome?: string;
  docIdentidade?: string;
  docIdentidadeNome?: string;
  docCartaoCnpj?: string;
  docCartaoCnpjNome?: string;
  docContratoSocial?: string;
  docContratoSocialNome?: string;
  docOutros?: string;
  docOutrosNome?: string;
  docsAdesaoIdCrm?: number;
  docsCopiadosEm?: Date;
}

export interface ResultadoCopia {
  campos: DocumentosCopiados;
  copiados: string[];
  reaproveitados: string[];
  falhas: string[];
}

const CAMPO_POR_CATEGORIA: Record<string, { path: keyof DocumentosCopiados; nome: keyof DocumentosCopiados }> = {
  identidade: { path: "docIdentidade", nome: "docIdentidadeNome" },
  cartao_cnpj: { path: "docCartaoCnpj", nome: "docCartaoCnpjNome" },
  contrato_social: { path: "docContratoSocial", nome: "docContratoSocialNome" },
  outros: { path: "docOutros", nome: "docOutrosNome" },
};

/**
 * Se algum cadastro da MESMA adesão já copiou este documento, reaproveita o
 * caminho em vez de subir o arquivo de novo. É o que faz "um objeto, N
 * referências".
 *
 * Procura nos DOIS cadastros: a mesma adesão pode gerar UCs e um proprietário
 * de usina, e olhar só um lado faria o segundo subir uma cópia do arquivo que
 * já está no bucket.
 */
async function caminhoJaCopiado(
  adesaoId: number,
  campo: keyof DocumentosCopiados,
): Promise<string | null> {
  const onde = { docsAdesaoIdCrm: adesaoId, [campo]: { not: null } };
  const selecao = { [campo]: true } as Record<string, boolean>;

  const [naUc, noInvestidor] = await Promise.all([
    prisma.consumerUnit.findFirst({ where: onde, select: selecao }),
    prisma.investor.findFirst({ where: onde, select: selecao }),
  ]);

  for (const linha of [naUc, noInvestidor]) {
    const valor = linha ? (linha as Record<string, unknown>)[campo] : null;
    if (typeof valor === "string") return valor;
  }
  return null;
}

export async function copiarDocumentosDaAdesao(adesaoId: number): Promise<ResultadoCopia> {
  const resultado: ResultadoCopia = {
    campos: { docsAdesaoIdCrm: adesaoId, docsCopiadosEm: new Date() },
    copiados: [],
    reaproveitados: [],
    falhas: [],
  };

  const subdir = `crm-adesoes/${adesaoId}`;

  const guardar = async (
    rotulo: string,
    campoPath: keyof DocumentosCopiados,
    campoNome: keyof DocumentosCopiados,
    nomeArquivo: string,
    obterBytes: () => Promise<Buffer | null>,
  ) => {
    try {
      const jaTem = await caminhoJaCopiado(adesaoId, campoPath);
      if (jaTem) {
        (resultado.campos as Record<string, unknown>)[campoPath] = jaTem;
        (resultado.campos as Record<string, unknown>)[campoNome] = nomeArquivo;
        resultado.reaproveitados.push(rotulo);
        return;
      }

      const bytes = await obterBytes();
      if (!bytes || bytes.length === 0) {
        resultado.falhas.push(`${rotulo}: arquivo vazio ou ausente no CRM`);
        return;
      }

      const { relativePath } = await saveBufferToStorage(bytes, subdir, nomeArquivo);
      (resultado.campos as Record<string, unknown>)[campoPath] = relativePath;
      (resultado.campos as Record<string, unknown>)[campoNome] = nomeArquivo;
      resultado.copiados.push(rotulo);
    } catch (err) {
      // Uma falha não derruba as outras cinco: registra e segue. Metade dos
      // documentos vale mais que nenhum, desde que se saiba qual faltou.
      resultado.falhas.push(`${rotulo}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 1 a 3 — termo, procuração e autorização de acesso, do envelope de assinatura.
  //
  // Qual é qual sai do CONTEÚDO, não do nome da coluna: em 14 das 22 adesões do
  // CRM as duas colunas estão trocadas na origem. Ver crm-envelope-pdfs.ts.
  const envelope = await buscarEnvelopeDaAdesao(adesaoId).catch(() => null);
  if (envelope?.pdf_termo_assinado || envelope?.pdf_procuracao_assinada) {
    const { termo, procuracao, invertido } = await separarTermoEProcuracao({
      colunaTermo: envelope.pdf_termo_assinado
        ? Buffer.from(envelope.pdf_termo_assinado, "base64")
        : null,
      colunaProcuracao: envelope.pdf_procuracao_assinada
        ? Buffer.from(envelope.pdf_procuracao_assinada, "base64")
        : null,
    });

    if (invertido) {
      console.warn(
        `[crm-copia-documentos] adesão ${adesaoId}: colunas do envelope trocadas no CRM — corrigido pelo conteúdo.`,
      );
    }

    if (termo) {
      await guardar("termo de adesão", "docTermoAdesao", "docTermoAdesaoNome",
        `termo-adesao-${adesaoId}.pdf`, async () => termo);
    }
    if (procuracao) {
      await guardar("procuração", "docProcuracao", "docProcuracaoNome",
        `procuracao-${adesaoId}.pdf`, async () => procuracao);
    }
  }

  // A autorização de acesso não passa pelo desembaralhamento: ela é coluna nova,
  // escrita depois que o CRM passou a casar documento por NOME de arquivo, e não
  // por posição na lista — que era o que trocava termo e procuração na origem.
  if (envelope?.pdf_autorizacao_assinada) {
    const autorizacao = Buffer.from(envelope.pdf_autorizacao_assinada, "base64");
    await guardar("autorização de acesso", "docAutorizacaoAcesso", "docAutorizacaoAcessoNome",
      `autorizacao-acesso-${adesaoId}.pdf`, async () => autorizacao);
  }

  // 3 a 6 — anexos do bucket do CRM.
  const anexos = await listarDocumentosDaAdesao(adesaoId).catch(() => []);
  for (const doc of anexos) {
    const destino = CAMPO_POR_CATEGORIA[doc.categoria ?? ""];
    if (!destino || !doc.r2_key) continue;
    const nome = corrigirMojibake(doc.nome_arquivo) || `${doc.categoria}-${doc.id}.pdf`;
    await guardar(doc.categoria!, destino.path, destino.nome, nome,
      () => lerDocumentoDoCrm(doc.r2_key!));
  }

  return resultado;
}
