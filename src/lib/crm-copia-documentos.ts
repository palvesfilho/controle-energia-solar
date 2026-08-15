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
 * São seis documentos, no máximo um de cada por adesão (conferido: nenhuma
 * adesão do CRM tem dois arquivos da mesma categoria):
 *   termo de adesão e procuração  — PDFs assinados, base64 em `envelopes_assinatura`
 *   identidade, cartão CNPJ,
 *   contrato social, outros       — anexos no bucket R2 do CRM
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

/** Campos de `ConsumerUnit` preenchidos por esta cópia. */
export interface DocumentosCopiados {
  docTermoAdesao?: string;
  docTermoAdesaoNome?: string;
  docProcuracao?: string;
  docProcuracaoNome?: string;
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
 * Se outra UC da MESMA adesão já copiou este documento, reaproveita o caminho
 * em vez de subir o arquivo de novo. É o que faz "um objeto, N referências".
 */
async function caminhoJaCopiado(
  adesaoId: number,
  campo: keyof DocumentosCopiados,
): Promise<string | null> {
  const existente = await prisma.consumerUnit.findFirst({
    where: { docsAdesaoIdCrm: adesaoId, [campo]: { not: null } },
    select: { [campo]: true } as Record<string, boolean>,
  });
  const valor = existente ? (existente as Record<string, unknown>)[campo] : null;
  return typeof valor === "string" ? valor : null;
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

  // 1 e 2 — termo e procuração, do envelope de assinatura.
  const envelope = await buscarEnvelopeDaAdesao(adesaoId).catch(() => null);
  if (envelope?.pdf_termo_assinado) {
    await guardar("termo de adesão", "docTermoAdesao", "docTermoAdesaoNome",
      `termo-adesao-${adesaoId}.pdf`,
      async () => Buffer.from(envelope.pdf_termo_assinado!, "base64"));
  }
  if (envelope?.pdf_procuracao_assinada) {
    await guardar("procuração", "docProcuracao", "docProcuracaoNome",
      `procuracao-${adesaoId}.pdf`,
      async () => Buffer.from(envelope.pdf_procuracao_assinada!, "base64"));
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
