import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";

async function main() {
  const cred = await prisma.cpflCredential.findFirst({ where: { instalacao: "4003926123" } });
  if (!cred) throw new Error("nao encontrada");
  const token = process.env.INFOSIMPLES_API_TOKEN!;
  const senha = decrypt(cred.senhaCpfl);
  console.log("Email:", cred.emailCpfl, "| Senha decrypt tamanho:", senha.length, "| Instalacao:", cred.instalacao);

  const body = new URLSearchParams({
    token,
    email: cred.emailCpfl,
    senha,
    instalacao: cred.instalacao,
    timeout: "300",
  });
  const res = await fetch("https://api.infosimples.com/api/v2/consultas/contas/cpfl/download-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  console.log("HTTP:", res.status);
  const json = await res.json();
  console.log("Code:", json.code, "| Message:", json.code_message);
  console.log("Errors:", JSON.stringify(json.errors));
  console.log("Header:", JSON.stringify(json.header, null, 2));
  console.log("Data length:", json.data?.length);
  console.log("Site receipts:", json.site_receipts);
}

main()
  .catch((e) => { console.error("ERRO:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
