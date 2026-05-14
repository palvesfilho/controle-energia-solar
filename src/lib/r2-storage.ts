import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 não configurado: defina R2_ENDPOINT, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY no .env",
    );
  }

  cachedClient = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error("R2 não configurado: defina R2_BUCKET_NAME no .env");
  }
  return bucket;
}

/**
 * Converte um caminho relativo armazenado no banco (ex.: "uploads/billing/x.pdf",
 * "/api/files/billing/x.pdf" ou "billing/x.pdf") para a key canônica no R2
 * (sem prefixos "uploads/" ou "api/files/").
 */
export function relativePathToKey(relativePath: string): string {
  let k = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (k.startsWith("api/files/")) k = k.slice("api/files/".length);
  if (k.startsWith("uploads/")) k = k.slice("uploads/".length);
  return k;
}

export async function saveBufferToR2(
  buffer: Buffer,
  subdir: string,
  fileName: string,
): Promise<{ relativePath: string; key: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${subdir}/${safeName}`;
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentTypeForKey(key),
    }),
  );
  return { relativePath: `uploads/${key}`, key };
}

export async function saveUploadedFileToR2(
  file: File,
  subdir: string,
): Promise<{ relativePath: string; fileName: string; size: number; key: string }> {
  if (!file || file.size === 0) {
    throw new Error("Arquivo vazio ou ausente");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${Date.now()}-${safeName}`;
  const key = `${subdir}/${fileName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: bytes,
      ContentType: file.type || contentTypeForKey(key),
    }),
  );
  return { relativePath: `uploads/${key}`, fileName, size: file.size, key };
}

export async function readFromR2(relativePath: string): Promise<Buffer | null> {
  const key = relativePathToKey(relativePath);
  try {
    const out = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    );
    if (!out.Body) return null;
    const bytes = await out.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

export async function deleteFromR2(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  const key = relativePathToKey(relativePath);
  if (!key) return;
  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
    );
  } catch {
    // objeto inexistente — silencioso, igual ao disco
  }
}

/**
 * Lista todas as keys do bucket cujo objeto tem tamanho > 0. Pagina automaticamente.
 * Use para popular um Set in-memory pra checagem de existência em lote.
 */
export async function listExistingR2Keys(prefix?: string): Promise<Set<string>> {
  const client = getClient();
  const bucket = getBucket();
  const set = new Set<string>();
  let continuationToken: string | undefined;
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of out.Contents ?? []) {
      if (obj.Key && (obj.Size ?? 0) > 0) set.add(obj.Key);
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);
  return set;
}

function contentTypeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] ?? "application/octet-stream";
}
