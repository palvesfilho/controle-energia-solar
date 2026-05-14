import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";

async function main() {
  const instalacao = process.argv[2] || "3082099467";
  const cred = await prisma.cpflCredential.findFirst({ where: { instalacao } });
  if (!cred) throw new Error(`nao encontrada: ${instalacao}`);
  const token = process.env.INFOSIMPLES_API_TOKEN!;
  const senha = decrypt(cred.senhaCpfl);
  console.log("Email:", cred.emailCpfl, "| Instalacao:", cred.instalacao);

  const body = new URLSearchParams({
    token,
    email: cred.emailCpfl,
    senha,
    instalacao: cred.instalacao,
    timeout: "300",
  });
  const start = Date.now();
  const res = await fetch("https://api.infosimples.com/api/v2/consultas/contas/cpfl/download-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  console.log(`HTTP: ${res.status} em ${Date.now() - start}ms`);
  const json = await res.json();
  console.log("Code:", json.code, "| Message:", json.code_message);
  console.log("Errors:", JSON.stringify(json.errors));
  console.log("Header:", JSON.stringify(json.header, null, 2));
  console.log("Site receipts:", json.site_receipts);
  if (json.data?.length) console.log("Data[0]:", JSON.stringify(json.data[0]).substring(0, 500));
}

main()
  .catch((e) => { console.error("ERRO:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
