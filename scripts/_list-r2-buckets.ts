import "dotenv/config";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

async function main() {
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!.trim(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    },
  });

  const r = await client.send(new ListBucketsCommand({}));
  console.log(`Buckets encontrados na conta: ${r.Buckets?.length ?? 0}\n`);
  for (const b of r.Buckets ?? []) {
    console.log(`  - ${b.Name}  (criado em ${b.CreationDate?.toISOString() ?? "?"})`);
  }
  console.log(`\nValor atual em R2_BUCKET_NAME: "${process.env.R2_BUCKET_NAME}"`);
}
main().catch((e) => { console.error("ERRO:", e instanceof Error ? e.message : e); process.exit(1); });
