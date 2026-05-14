import "dotenv/config";

process.env.STORAGE_BACKEND = "r2";

import {
  saveBufferToStorage,
  readFromStorage,
  deleteUploadedFile,
} from "../src/lib/file-storage";

async function main() {
  const fileName = `smoke-${Date.now()}.bin`;
  const subdir = "smoke-test";
  const payload = Buffer.from("R2 round-trip OK — " + new Date().toISOString());

  console.log(`backend=${process.env.STORAGE_BACKEND}`);
  console.log(`payload=${payload.length} bytes`);

  const saved = await saveBufferToStorage(payload, subdir, fileName);
  console.log(`saved.relativePath=${saved.relativePath}`);

  const readBack = await readFromStorage(saved.relativePath);
  if (!readBack) {
    throw new Error("readFromStorage retornou null");
  }
  console.log(`read.size=${readBack.size}`);

  if (Buffer.compare(payload, readBack.data) !== 0) {
    throw new Error("Bytes diferem: round-trip FALHOU");
  }
  console.log("bytes match — round-trip OK");

  await deleteUploadedFile(saved.relativePath);
  const afterDelete = await readFromStorage(saved.relativePath);
  if (afterDelete !== null) {
    throw new Error("Objeto ainda existe após delete");
  }
  console.log("delete OK");

  console.log("\nSMOKE PASS");
}

main().catch((e) => {
  console.error("\nSMOKE FAIL:", e);
  process.exit(1);
});
