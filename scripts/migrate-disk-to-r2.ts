import "dotenv/config";
import { promises as fs } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Migra arquivos de uploads/ no disco local pro bucket R2.
 *
 * Uso:
 *   npx tsx scripts/migrate-disk-to-r2.ts [--dry-run] [--filter <substring>] [--overwrite]
 *
 * Por padrão pula arquivos vazios e os que já existem no R2 (dedup por key).
 * Use --overwrite pra forçar reupload.
 */

type Args = { dryRun: boolean; overwrite: boolean; filter: string | null };

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = { dryRun: false, overwrite: false, filter: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--dry-run") out.dryRun = true;
    else if (a[i] === "--overwrite") out.overwrite = true;
    else if (a[i] === "--filter") out.filter = a[++i] ?? null;
  }
  return out;
}

function getClient(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_* env vars não definidas");
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(): string {
  const b = process.env.R2_BUCKET_NAME;
  if (!b) throw new Error("R2_BUCKET_NAME não definido");
  return b;
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
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

async function exists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs();
  const root = join(process.cwd(), "uploads");
  const client = getClient();
  const bucket = getBucket();

  let scanned = 0;
  let skippedEmpty = 0;
  let skippedFilter = 0;
  let skippedExisting = 0;
  let uploaded = 0;
  let failed = 0;

  console.log(`Migrando ${root} → R2 bucket "${bucket}"`);
  console.log(`  dryRun=${args.dryRun} overwrite=${args.overwrite} filter=${args.filter ?? "(nenhum)"}`);
  console.log("");

  for await (const file of walk(root)) {
    scanned++;
    const rel = relative(root, file).split(sep).join("/");
    const key = rel;

    if (args.filter && !rel.includes(args.filter)) {
      skippedFilter++;
      continue;
    }

    let size = 0;
    try {
      const st = await fs.stat(file);
      size = st.size;
    } catch {
      failed++;
      continue;
    }
    if (size === 0) {
      skippedEmpty++;
      continue;
    }

    if (!args.overwrite && (await exists(client, bucket, key))) {
      skippedExisting++;
      continue;
    }

    if (args.dryRun) {
      console.log(`  [dry] ${key} (${size} bytes)`);
      uploaded++;
      continue;
    }

    try {
      const body = await fs.readFile(file);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentTypeForKey(key),
        }),
      );
      console.log(`  ok ${key} (${size} bytes)`);
      uploaded++;
    } catch (e) {
      console.error(`  ERR ${key}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  console.log("");
  console.log(`scanned=${scanned} uploaded=${uploaded} skippedEmpty=${skippedEmpty} skippedFilter=${skippedFilter} skippedExisting=${skippedExisting} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
