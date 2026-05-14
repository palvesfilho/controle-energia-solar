import "dotenv/config";

import {
  saveBufferToStorage,
  readFromStorage,
  deleteUploadedFile,
} from "../src/lib/file-storage";

async function main() {
  const fileName = `smoke-env-${Date.now()}.bin`;
  const payload = Buffer.from("env round-trip " + new Date().toISOString());

  console.log(`STORAGE_BACKEND=${process.env.STORAGE_BACKEND ?? "(undefined → disk)"}`);
  const saved = await saveBufferToStorage(payload, "smoke-test", fileName);
  console.log(`saved=${saved.relativePath}`);

  const r = await readFromStorage(saved.relativePath);
  if (!r || Buffer.compare(payload, r.data) !== 0) throw new Error("FAIL");
  console.log("bytes match");

  await deleteUploadedFile(saved.relativePath);
  const after = await readFromStorage(saved.relativePath);
  if (after) throw new Error("still exists after delete");
  console.log("PASS");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
