/**
 * Smoke test da conexão Cloudflare R2.
 *
 * Faz: PutObject → ListObjects → GetObject → DeleteObject
 * com um arquivo dummy "_r2-smoke-test-<timestamp>.txt".
 *
 * Se algum passo falhar, mostra erro descritivo (credencial errada,
 * bucket inexistente, endpoint errado etc).
 */
import "dotenv/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
] as const;

function step(label: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(
    () => console.log(`  ✅ ${label}`),
    (e) => {
      console.log(`  ❌ ${label}`);
      console.log(`     erro: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    },
  );
}

async function main() {
  console.log("=== Verificando .env ===");
  for (const k of REQUIRED) {
    const v = process.env[k];
    if (!v || v.trim() === "" || v.includes("PREENCHER")) {
      console.log(`  ❌ ${k} ausente/vazio`);
      process.exit(1);
    }
    const masked = v.length > 12 ? v.substring(0, 4) + "..." + v.substring(v.length - 4) : "***";
    console.log(`  ✅ ${k}=${masked}`);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!.trim(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    },
  });
  const Bucket = process.env.R2_BUCKET_NAME!.trim();
  const Key = `_r2-smoke-test-${Date.now()}.txt`;
  const Body = `R2 smoke test em ${new Date().toISOString()}`;

  console.log(`\n=== Bucket: ${Bucket} ===`);

  await step(`PutObject ${Key}`, async () => {
    await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType: "text/plain" }));
  });

  await step(`ListObjectsV2 (filtro _r2-smoke)`, async () => {
    const r = await client.send(new ListObjectsV2Command({ Bucket, Prefix: "_r2-smoke" }));
    const found = r.Contents?.some((o) => o.Key === Key);
    if (!found) throw new Error(`objeto recém-criado não apareceu no list (Contents=${r.Contents?.length ?? 0})`);
  });

  await step(`GetObject ${Key}`, async () => {
    const r = await client.send(new GetObjectCommand({ Bucket, Key }));
    const buf = await r.Body!.transformToString();
    if (buf !== Body) throw new Error(`conteúdo divergente: esperado "${Body}", recebido "${buf}"`);
  });

  await step(`DeleteObject ${Key}`, async () => {
    await client.send(new DeleteObjectCommand({ Bucket, Key }));
  });

  console.log("\n🎉 R2 funcionando corretamente.");
}

main().catch(() => {
  console.log("\n❌ Falhou — confira o erro acima.");
  process.exit(1);
});
