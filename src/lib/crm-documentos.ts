/**
 * Leitura dos documentos do CRM, que moram num bucket R2 diferente do nosso.
 *
 * O CRM (GERADOR_PROPOSTA) guarda os anexos da adesão no bucket
 * `rbs-documentos`; o Gestor usa `gestor-creditos`. São buckets distintos, mas
 * da MESMA conta Cloudflare (63294675cdc4d6…), e o token do Gestor é de conta
 * inteira — testado em 15/08/2026 lendo um objeto do bucket do CRM com a
 * credencial daqui. Por isso não há credencial nova: só o nome do bucket, que
 * tem default e pode ser trocado por `CRM_R2_BUCKET_NAME` se um dia mudar.
 *
 * SOMENTE LEITURA, e sem copiar: o arquivo é servido sob demanda direto do
 * bucket do CRM. Duplicar geraria a pergunta "qual das duas cópias vale?" na
 * primeira vez que o cliente reenviasse um documento.
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

let cliente: S3Client | null = null;

function getCliente(): S3Client {
  if (cliente) return cliente;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 não configurado: defina R2_ENDPOINT, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.",
    );
  }

  cliente = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cliente;
}

export function bucketDoCrm(): string {
  return process.env.CRM_R2_BUCKET_NAME || "rbs-documentos";
}

/** Baixa um anexo da adesão. Devolve null quando a chave não existe. */
export async function lerDocumentoDoCrm(r2Key: string): Promise<Buffer | null> {
  try {
    const resposta = await getCliente().send(
      new GetObjectCommand({ Bucket: bucketDoCrm(), Key: r2Key }),
    );
    const corpo = resposta.Body;
    if (!corpo) return null;
    const chunks: Buffer[] = [];
    // @ts-expect-error - o Body do SDK v3 é um async iterable no Node
    for await (const pedaco of corpo) chunks.push(Buffer.from(pedaco));
    return Buffer.concat(chunks);
  } catch (err) {
    const nome = err instanceof Error ? err.name : String(err);
    if (nome === "NoSuchKey" || nome === "NotFound") return null;
    throw err;
  }
}
