/**
 * Diagnóstico R2: testa vários nomes prováveis pra entender o estado real.
 */
import "dotenv/config";
import {
  S3Client,
  HeadBucketCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";

async function main() {
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!.trim(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    },
  });

  console.log("=== ListBuckets ===");
  try {
    const r = await client.send(new ListBucketsCommand({}));
    console.log(`Owner: ${JSON.stringify(r.Owner)}`);
    console.log(`Buckets: ${r.Buckets?.length ?? 0}`);
    for (const b of r.Buckets ?? []) console.log(`  - ${b.Name} (criado ${b.CreationDate?.toISOString()})`);
  } catch (e) {
    console.log(`erro: ${e instanceof Error ? e.message : e}`);
  }

  console.log("\n=== HeadBucket nos nomes prováveis ===");
  const candidatos = [
    "gestor-creditos",
    "gestor-creditos-faturas",
    "GESTOR-CRÉDITOS",
    "gestor-credito",
    "credito",
    "creditos",
    "faturas",
    "solvesm",
    "solvesm-faturas",
    "energia",
  ];
  for (const Bucket of candidatos) {
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
      console.log(`  ✅ EXISTE: "${Bucket}"`);
    } catch (e) {
      const code = (e as { name?: string; $metadata?: { httpStatusCode?: number } });
      const status = code.$metadata?.httpStatusCode;
      const name = code.name ?? "?";
      console.log(`  ❌ "${Bucket}" → status=${status} ${name}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
