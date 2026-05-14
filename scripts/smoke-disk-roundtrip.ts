import "dotenv/config";

process.env.STORAGE_BACKEND = "disk";

import {
  saveBufferToStorage,
  readFromStorage,
  deleteUploadedFile,
} from "../src/lib/file-storage";

async function main() {
  const fileName = `smoke-disk-${Date.now()}.bin`;
  const payload = Buffer.from("disk round-trip " + new Date().toISOString());

  console.log(`backend=${process.env.STORAGE_BACKEND}`);
  const saved = await saveBufferToStorage(payload, "smoke-test", fileName);
  console.log(`saved.relativePath=${saved.relativePath}`);

  const readBack = await readFromStorage(saved.relativePath);
  if (!readBack || Buffer.compare(payload, readBack.data) !== 0) {
    throw new Error("FAIL");
  }
  console.log("bytes match");

  await deleteUploadedFile(saved.relativePath);
  const after = await readFromStorage(saved.relativePath);
  if (after) throw new Error("still exists after delete");
  console.log("disk PASS");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
