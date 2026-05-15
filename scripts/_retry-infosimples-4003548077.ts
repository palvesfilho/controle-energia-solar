import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";

const INSTALACAO = "4003548077";
const MAX_RETRIES = 3;
const BACKOFF_MS = [10_000, 20_000, 40_000];

async function callInfo(token: string, email: string, senha: string, instalacao: string) {
  const body = new URLSearchParams({ token, email, senha, instalacao, timeout: "300" });
  const t0 = Date.now();
  const res = await fetch("https://api.infosimples.com/api/v2/consultas/contas/cpfl/download-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const json = await res.json();
  return {
    elapsed,
    httpStatus: res.status,
    code: json.code,
    msg: json.code_message,
    dataLen: json.data?.length ?? 0,
    billable: json.header?.billable,
  };
}

async function main() {
  const cred = await prisma.cpflCredential.findFirst({ where: { instalacao: INSTALACAO } });
  if (!cred) throw new Error(`Sem credencial pra ${INSTALACAO}`);
  const token = process.env.INFOSIMPLES_API_TOKEN!;
  const senha = decrypt(cred.senhaCpfl);

  for (let i = 0; i < MAX_RETRIES; i++) {
    console.log(`\nTentativa ${i + 1}/${MAX_RETRIES}...`);
    const r = await callInfo(token, cred.emailCpfl, senha, INSTALACAO);
    console.log(
      ` → HTTP ${r.httpStatus} em ${r.elapsed}s · code=${r.code} (${r.msg}) · data=${r.dataLen} · billable=${r.billable}`
    );
    if (r.code === 200 && r.dataLen > 0) {
      console.log("\n✓ SUCESSO na tentativa", i + 1);
      return;
    }
    if (i < MAX_RETRIES - 1) {
      console.log(` (aguardando ${BACKOFF_MS[i] / 1000}s antes da próxima)`);
      await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));
    }
  }
  console.log("\n✗ FALHOU em todas as tentativas");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
