import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";

async function main() {
  const instalacao = process.argv[2];
  if (!instalacao) throw new Error("Uso: npx tsx scripts/debug-infosimples-arg.ts <instalacao>");

  const cred = await prisma.cpflCredential.findFirst({ where: { instalacao } });
  if (!cred) throw new Error(`Credencial CPFL não encontrada para instalação ${instalacao}`);

  const token = process.env.INFOSIMPLES_API_TOKEN;
  if (!token) throw new Error("INFOSIMPLES_API_TOKEN não configurado no .env");

  const senha = decrypt(cred.senhaCpfl);
  console.log("Email:", cred.emailCpfl);
  console.log("Senha (tamanho decrypt):", senha.length);
  console.log("Instalação:", cred.instalacao);
  console.log("Token (8 primeiros):", token.slice(0, 8) + "...");

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
  console.log("\n--- Resposta ---");
  console.log("HTTP status:", res.status);
  const json = await res.json();
  console.log("code:", json.code);
  console.log("code_message:", json.code_message);
  console.log("errors:", JSON.stringify(json.errors));
  console.log("header:", JSON.stringify(json.header, null, 2));
  console.log("data length:", json.data?.length);
  console.log("site_receipts:", json.site_receipts);
  if (json.data?.[0]) {
    const d = json.data[0];
    console.log("\n--- Primeira fatura ---");
    console.log("instalacao:", d.instalacao);
    console.log("mes:", d.mes);
    console.log("vencimento:", d.vencimento, "| normalizado:", d.normalizado_vencimento);
    console.log("valor:", d.valor, "| normalizado:", d.normalizado_valor);
    console.log("conta_paga:", d.conta_paga);
    console.log("ocr items:", Array.isArray(d.ocr) ? d.ocr.length : "(não array)");
    if (Array.isArray(d.ocr) && d.ocr[0]) {
      const o = d.ocr[0];
      console.log("ocr[0].ref_mes/ano:", o.ref_mes, "/", o.ref_ano);
      console.log("ocr[0].mes/ano:", o.mes, "/", o.ano);
      console.log("ocr[0].codigo_barras:", o.codigo_barras);
      console.log("ocr[0].energia.consumo length:", o.energia?.consumo?.length);
      console.log("ocr[0].energia.medidor length:", o.energia?.medidor?.length);
      console.log("ocr[0].aviso (primeiros 200 chars):", String(o.aviso ?? "").slice(0, 200));
    }
  }
}

main()
  .catch((e) => { console.error("ERRO:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
