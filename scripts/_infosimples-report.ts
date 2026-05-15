import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";
import { writeFile } from "fs/promises";
import { join } from "path";

interface TestResult {
  instalacao: string;
  nome: string;
  email: string;
  httpStatus: number;
  code: number;
  codeMessage: string;
  billable: boolean;
  dataLen: number;
  elapsedS: string;
  signature: string;
  requestedAt: string;
  remoteIp: string;
  apiVersion: string;
  errors: unknown;
}

async function testOne(
  token: string,
  email: string,
  senha: string,
  instalacao: string,
  nome: string
): Promise<TestResult> {
  const body = new URLSearchParams({ token, email, senha, instalacao, timeout: "300" });
  const t0 = Date.now();
  const res = await fetch("https://api.infosimples.com/api/v2/consultas/contas/cpfl/download-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);
  const json = await res.json();
  const h = json.header ?? {};
  return {
    instalacao,
    nome,
    email,
    httpStatus: res.status,
    code: json.code,
    codeMessage: json.code_message,
    billable: !!h.billable,
    dataLen: json.data?.length ?? 0,
    elapsedS,
    signature: h.signature ?? "-",
    requestedAt: h.requested_at ?? "-",
    remoteIp: h.remote_ip ?? "-",
    apiVersion: h.api_version_full ?? "-",
    errors: json.errors ?? [],
  };
}

async function main() {
  const all = await prisma.cpflCredential.findMany({
    where: { consumerUnit: { distribuidora: "RGE", active: true } },
    select: {
      emailCpfl: true,
      senhaCpfl: true,
      instalacao: true,
      consumerUnit: { select: { nome: true, codigoUc: true } },
    },
    orderBy: { instalacao: "asc" },
  });
  // Amostra de 20 UCs + garante que 4003548077 está incluída
  const SAMPLE_SIZE = 20;
  const FORCE_INCLUDE = ["4003548077"];
  const sample = all.slice(0, SAMPLE_SIZE);
  for (const inst of FORCE_INCLUDE) {
    if (!sample.some((c) => c.instalacao === inst)) {
      const found = all.find((c) => c.instalacao === inst);
      if (found) sample.push(found);
    }
  }
  const creds = sample;

  console.log(`Testando ${creds.length} UCs RGE com credencial cadastrada...\n`);
  const results: TestResult[] = [];
  const token = process.env.INFOSIMPLES_API_TOKEN!;

  for (let i = 0; i < creds.length; i++) {
    const c = creds[i];
    const nome = c.consumerUnit?.nome ?? "-";
    let senha: string;
    try {
      senha = decrypt(c.senhaCpfl);
    } catch {
      console.log(`  [${i + 1}/${creds.length}] ${c.instalacao} ${nome} — FALHA decrypt`);
      continue;
    }
    try {
      const r = await testOne(token, c.emailCpfl, senha, c.instalacao, nome);
      const tag = r.code === 200 && r.dataLen > 0 ? "✓" : "✗";
      console.log(
        `  [${i + 1}/${creds.length}] ${tag} ${r.instalacao} ${nome.slice(0, 28)} — code=${r.code} data=${r.dataLen} (${r.elapsedS}s)`
      );
      results.push(r);
    } catch (e) {
      console.log(`  [${i + 1}/${creds.length}] ${c.instalacao} ${nome} — ERRO:`, (e as Error).message);
    }
  }

  // Gera relatório markdown
  const failing = results.filter((r) => r.code !== 200 || r.dataLen === 0);
  const success = results.filter((r) => r.code === 200 && r.dataLen > 0);
  const today = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`# Relatório de falhas Infosimples — RGE Sul · ${today}`);
  lines.push("");
  lines.push(`**Cliente Infosimples:** ${results[0]?.email ?? "-"} (token *SISTEMA GERENCIAMENTO DE CRÉDITOS*)`);
  lines.push(`**Endpoint:** \`POST https://api.infosimples.com/api/v2/consultas/contas/cpfl/download-ocr\``);
  lines.push(`**Distribuidora:** RGE (grupo CPFL)`);
  lines.push(`**API version testada:** ${results[0]?.apiVersion ?? "-"}`);
  lines.push(`**Total testado:** ${results.length} UCs · **Sucesso:** ${success.length} · **Falha (code 600):** ${failing.length}`);
  lines.push("");
  lines.push("## Resumo do problema");
  lines.push("");
  lines.push("As instalações abaixo retornam consistentemente `code 600 — Um erro inesperado ocorreu e será analisado` ao consultar via API Infosimples para a RGE Sul, mesmo após retries com backoff (testado até 3 tentativas com intervalo de até 40s). As credenciais funcionam normalmente para outras instalações do mesmo cliente (ver \"UCs com sucesso\" no final). `billable: false` confirma que o problema ocorre antes da consulta ser cobrada — falha do lado Infosimples ao raspar o portal RGE.");
  lines.push("");
  lines.push("## UCs com falha (code 600)");
  lines.push("");
  lines.push("| Instalação | UC | HTTP | Code | Signature (header.signature) | Requested at |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of failing) {
    const sigShort = r.signature.length > 24 ? r.signature.slice(0, 24) + "…" : r.signature;
    lines.push(`| ${r.instalacao} | ${r.nome} | ${r.httpStatus} | ${r.code} | \`${sigShort}\` | ${r.requestedAt} |`);
  }
  lines.push("");
  lines.push("### Signatures completas (para rastreamento Infosimples)");
  lines.push("");
  for (const r of failing) {
    lines.push(`- **${r.instalacao}** (${r.nome}) — \`${r.signature}\``);
  }
  lines.push("");
  lines.push("## UCs com sucesso (mesmo login/senha)");
  lines.push("");
  lines.push("| Instalação | UC | HTTP | Code | Tempo |");
  lines.push("|---|---|---|---|---|");
  for (const r of success) {
    lines.push(`| ${r.instalacao} | ${r.nome} | ${r.httpStatus} | ${r.code} | ${r.elapsedS}s |`);
  }
  lines.push("");
  lines.push("## Pedido");
  lines.push("");
  lines.push("Por favor verifiquem do lado de vocês o que está causando o `code 600` consistente para essas instalações específicas. As credenciais não são o problema (mesmo email/senha funciona para outras UCs). Suspeitamos de algum issue na raspagem do portal RGE para essas instalações em particular.");
  lines.push("");
  lines.push("Atenciosamente.");

  const reportPath = join(process.cwd(), `infosimples-report-${today}.md`);
  await writeFile(reportPath, lines.join("\n"), "utf8");
  console.log(`\n✓ Relatório gerado em: ${reportPath}`);
  console.log(`  ${failing.length} falhas · ${success.length} sucessos · ${results.length} total`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
