import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";

const INSTALACAO = "4003548077";

async function main() {
  const uc = await prisma.consumerUnit.findUnique({
    where: { codigoUc: INSTALACAO },
    select: { id: true, nome: true, codigoUc: true, distribuidora: true, loginDistribuidora: true },
  });
  console.log("UC:", uc);

  const cred = await prisma.cpflCredential.findFirst({ where: { instalacao: INSTALACAO } });
  if (!cred) {
    console.error("\n>>> CpflCredential NÃO encontrada para instalacao", INSTALACAO);
    console.log("\nListando credenciais existentes (top 5):");
    const all = await prisma.cpflCredential.findMany({ take: 5, select: { id: true, instalacao: true, emailCpfl: true } });
    console.log(all);
    process.exit(1);
  }
  console.log("Credencial:", { id: cred.id, instalacao: cred.instalacao, emailCpfl: cred.emailCpfl, consumerUnitId: cred.consumerUnitId, plantId: cred.plantId });

  const token = process.env.INFOSIMPLES_API_TOKEN;
  if (!token) {
    console.error("INFOSIMPLES_API_TOKEN não configurado no .env");
    process.exit(1);
  }
  console.log("Token:", token.substring(0, 10) + "...");

  let senha: string;
  try {
    senha = decrypt(cred.senhaCpfl);
    console.log("Senha decifrada OK (tamanho:", senha.length, ")");
  } catch (e) {
    console.error("FALHA AO DECIFRAR SENHA:", e);
    process.exit(1);
  }

  const body = new URLSearchParams({
    token,
    email: cred.emailCpfl,
    senha,
    instalacao: cred.instalacao,
    timeout: "300",
  });

  console.log("\nChamando Infosimples...");
  const t0 = Date.now();
  const res = await fetch("https://api.infosimples.com/api/v2/consultas/contas/cpfl/download-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`HTTP ${res.status} em ${elapsed}s`);

  const json = await res.json();
  console.log("Code:", json.code, "—", json.code_message);
  console.log("Errors:", JSON.stringify(json.errors));
  console.log("Header:", JSON.stringify(json.header, null, 2));
  if (json.data && Array.isArray(json.data)) {
    console.log("Data length:", json.data.length);
    for (const item of json.data) {
      console.log(" -", {
        instalacao: item.instalacao,
        mes: item.mes,
        ano: item.ano,
        vencimento: item.vencimento,
        valor: item.valor,
        conta_paga: item.conta_paga,
        tem_pdf: !!item.documento,
        tem_ocr: !!item.ocr,
      });
    }
  }
  console.log("Site receipts:", json.site_receipts);
}

main()
  .catch((e) => {
    console.error("ERRO:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
