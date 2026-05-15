import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";

async function tryOne(cred: { emailCpfl: string; senhaCpfl: string; instalacao: string }, label: string) {
  const token = process.env.INFOSIMPLES_API_TOKEN!;
  let senha: string;
  try {
    senha = decrypt(cred.senhaCpfl);
  } catch (e) {
    console.log(`[${label}] FALHA AO DECIFRAR:`, (e as Error).message);
    return;
  }
  const body = new URLSearchParams({
    token,
    email: cred.emailCpfl,
    senha,
    instalacao: cred.instalacao,
    timeout: "300",
  });
  const t0 = Date.now();
  const res = await fetch("https://api.infosimples.com/api/v2/consultas/contas/cpfl/download-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const json = await res.json();
  console.log(
    `[${label}] inst=${cred.instalacao} email=${cred.emailCpfl} → HTTP ${res.status} em ${elapsed}s · code=${json.code} (${json.code_message}) · billable=${json.header?.billable} · data=${json.data?.length ?? 0}`
  );
}

async function main() {
  // Pega 3 UCs RGE ativas distintas com credencial
  const creds = await prisma.cpflCredential.findMany({
    where: {
      consumerUnit: { distribuidora: "RGE", active: true },
    },
    take: 5,
    select: {
      emailCpfl: true,
      senhaCpfl: true,
      instalacao: true,
      consumerUnit: { select: { nome: true, codigoUc: true } },
    },
  });
  console.log(`Encontradas ${creds.length} credenciais RGE para testar:\n`);

  for (const c of creds) {
    const label = `${c.consumerUnit?.codigoUc} (${c.consumerUnit?.nome?.slice(0, 25) ?? "-"})`;
    await tryOne(c, label);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
