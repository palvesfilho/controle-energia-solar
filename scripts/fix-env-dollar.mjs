import fs from "node:fs";

const p = new URL("../.env", import.meta.url);
let s = fs.readFileSync(p, "utf8");

// Escapa o '$' inicial do valor de ASAAS_API_KEY para evitar expansão pelo
// loader de env do Next (@next/env / dotenv-expand).
// Aceita valor entre aspas duplas, aspas simples ou sem aspas.
const before = s;
s = s.replace(
  /^(ASAAS_API_KEY=)("?)\$(?!\\)/m,
  (_m, prefix, quote) => `${prefix}${quote}\\$`,
);

if (s === before) {
  console.log("no change (already escaped or different format)");
} else {
  fs.writeFileSync(p, s);
  console.log("escaped ok");
}
