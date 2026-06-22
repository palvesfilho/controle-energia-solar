/**
 * Sweep automatizado de rotas pra detectar regressões pós-cutover Clerk.
 *
 * Modos:
 *  - guest (default): sem cookie, valida que rotas protegidas redirecionam pra /login-clerk
 *  - authed (auto): cria session via @clerk/backend pra um user existente
 *  - authed (cookie): SWEEP_COOKIE=<valor> usa cookie real copiado do navegador
 *
 * Rodar authed automático (cria session pra paulo.alves@redebrasilsolar.com.br):
 *   NODE_OPTIONS=--use-system-ca npx tsx scripts/sweep-routes.ts --authed
 *
 * Rodar com cookie real:
 *   SWEEP_COOKIE="..." NODE_OPTIONS=--use-system-ca npx tsx scripts/sweep-routes.ts
 *
 * Rodar guest:
 *   NODE_OPTIONS=--use-system-ca npx tsx scripts/sweep-routes.ts
 */
import "dotenv/config";
import { createClerkClient } from "@clerk/backend";

const BASE_URL = process.env.SWEEP_BASE_URL || "http://localhost:3000";
const TIMEOUT_MS = 30_000;
const AUTHED_FLAG = process.argv.includes("--authed");
const ONLY_PAGES = process.argv.includes("--pages");
const ONLY_APIS = process.argv.includes("--apis");
const AUTHED_EMAIL = process.env.SWEEP_AUTHED_EMAIL || "paulo.alves@redebrasilsolar.com.br";
let COOKIE = process.env.SWEEP_COOKIE || "";
const COOKIE_HEADER = process.env.SWEEP_COOKIE_HEADER || "";

type Route = { path: string; method?: "GET" | "POST"; label?: string };

// Pages principais. IDs dinâmicos ([id], [mes]) omitidos — testaríamos só estática.
const PAGES: Route[] = [
  { path: "/portal" },
  { path: "/painel" },
  { path: "/relatorios" },
  { path: "/admin" },
  { path: "/admin/agenda" },
  { path: "/admin/lancamentos" },
  { path: "/admin/relatorios" },
  { path: "/admin/uploads/novo" },
  { path: "/admin/usuarios" },
  { path: "/admin/usuarios/novo" },
  { path: "/admin/investidores" },
  { path: "/admin/investidores/novo" },
  { path: "/admin/usinas" },
  { path: "/admin/usinas/nova" },
  { path: "/admin/consumidores" },
  { path: "/admin/consumidores/novo" },
  { path: "/admin/unidades-consumidoras" },
  { path: "/admin/unidades-consumidoras/nova" },
  { path: "/admin/gestao-creditos/analise" },
  { path: "/admin/gestao-creditos/balanco-mensal" },
  { path: "/admin/gestao-creditos/rateios" },
  { path: "/admin/faturas-energia" },
  { path: "/admin/faturas-energia/fechamento-mensal" },
  { path: "/admin/faturas-energia/gestao-financeira" },
  { path: "/admin/faturamento" },
  { path: "/admin/faturamento/usinas" },
  { path: "/admin/faturamento/unidades-consumidoras" },
  { path: "/admin/faturamento/fechamentos-investidor" },
  { path: "/admin/faturamento/fechamento-financeiro" },
  { path: "/admin/faturamento/fechamento-financeiro/configuracao" },
  { path: "/admin/brasil-solar" },
  { path: "/admin/brasil-solar/novo" },
  { path: "/admin/brasil-solar/mapa" },
  { path: "/admin/brasil-solar/relatorios" },
  { path: "/admin/brasil-solar/importar" },
  { path: "/admin/brasil-solar/erros-usinas" },
  { path: "/admin/brasil-solar/proprietarios" },
  { path: "/admin/brasil-solar/proprietarios/novo" },
  { path: "/admin/brasil-solar/proprietarios/importar" },
  { path: "/admin/obra/aprovacao" },
  { path: "/admin/obra/calendario" },
  { path: "/admin/obra/cronograma" },
  { path: "/admin/obra/cronograma/nova" },
  { path: "/admin/obra/finalizadas" },
  { path: "/admin/obra/gestao-obra" },
  { path: "/admin/obra/indicadores" },
  { path: "/admin/personalizacoes" },
  { path: "/admin/personalizacoes/alertas-usinas" },
  { path: "/admin/personalizacoes/codigos-erro-inversor" },
  { path: "/admin/personalizacoes/distribuidora-emails" },
  { path: "/admin/personalizacoes/equipes" },
  { path: "/admin/personalizacoes/obras" },
  { path: "/admin/personalizacoes/relatorio-parametros" },
  { path: "/admin/validar-inversor" },
];

// APIs GET principais (POST/PUT/DELETE de fora porque mudariam estado).
const APIS: Route[] = [
  { path: "/api/users" },
  { path: "/api/plants" },
  { path: "/api/investors" },
  { path: "/api/consumers" },
  { path: "/api/consumer-units" },
  { path: "/api/obras" },
  { path: "/api/reports" },
  { path: "/api/brasil-solar" },
  { path: "/api/brasil-solar/stats" },
  { path: "/api/brasil-solar/mapa" },
  { path: "/api/brasil-solar/linkable" },
  { path: "/api/brasil-solar/proprietarios" },
  { path: "/api/brasil-solar/relatorios/visao-geral" },
  { path: "/api/brasil-solar/alertas-usinas" },
  { path: "/api/brasil-solar/sync/status" },
  { path: "/api/brasil-solar/sync-huawei/status" },
  { path: "/api/brasil-solar/sync-solaredge/status" },
  { path: "/api/billing/plants" },
  { path: "/api/billing/plants/pendencias" },
  { path: "/api/billing/consumer-units" },
  { path: "/api/admin/faturas-energia" },
  { path: "/api/admin/faturas-energia/abertas" },
  { path: "/api/admin/faturas-energia/fechamento-mensal" },
  { path: "/api/admin/gestao-creditos/snapshots" },
  { path: "/api/admin/gestao-creditos/baselines" },
  { path: "/api/admin/gestao-creditos/users-atribuiveis" },
  { path: "/api/admin/gestao-creditos/analise" },
  { path: "/api/admin/financeiro/tax-rates" },
  { path: "/api/admin/financeiro/recurring-costs" },
  { path: "/api/admin/financeiro/recurring-cost-entries" },
  { path: "/api/admin/financeiro/fechamento" },
  { path: "/api/admin/fechamentos-investidor" },
  { path: "/api/admin/obra/indicadores" },
  { path: "/api/admin/obra/gestao-obra" },
  { path: "/api/admin/obra/calendario" },
  { path: "/api/admin/obra/calendario/resumo" },
  { path: "/api/admin/codigos-erro-inversor" },
  { path: "/api/admin/codigos-erro-inversor/lookup" },
  { path: "/api/admin/personalizacoes/relatorio-parametros" },
  { path: "/api/admin/personalizacoes/equipes" },
  { path: "/api/admin/personalizacoes/distribuidora-emails" },
  { path: "/api/admin/personalizacoes/alertas-usinas" },
  { path: "/api/admin/personalizacoes/obras-materiais" },
  { path: "/api/plant-monthly" },
  { path: "/api/consumer-monthly" },
  { path: "/api/credit-management/monthly-balance" },
];

async function checkOne(route: Route, isAuthed: boolean): Promise<{ ok: boolean; status: number | string; note?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    const finalCookieHeader = COOKIE_HEADER || (COOKIE ? `__session=${COOKIE}` : "");
    if (finalCookieHeader) {
      headers["Cookie"] = finalCookieHeader;
      // azp claim do JWT do Clerk exige Origin/Referer batendo com a URL autorizada
      headers["Origin"] = BASE_URL;
      headers["Referer"] = BASE_URL + "/";
    }
    const res = await fetch(BASE_URL + route.path, {
      method: route.method || "GET",
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const isApi = route.path.startsWith("/api/");
    const status = res.status;

    if (!isAuthed) {
      // guest mode: rotas protegidas devem redirecionar OU API devolver 401
      if (isApi) {
        return { ok: status === 401, status, note: status === 401 ? "" : "esperava 401" };
      }
      return { ok: status === 307 || status === 302, status, note: status === 307 || status === 302 ? "" : "esperava redirect" };
    }

    // authed mode: 200 ok, ou redirect interno (NÃO pra /login-clerk)
    if (status === 200) return { ok: true, status };
    if (status === 307 || status === 302) {
      const loc = res.headers.get("location") || "";
      if (loc.includes("/login-clerk")) {
        return { ok: false, status, note: "redirecionou pra /login-clerk (cookie expirou?)" };
      }
      return { ok: true, status, note: `→ ${loc}` };
    }
    if (status === 401) return { ok: false, status, note: "cookie expirou? logar de novo" };
    if (status === 403) return { ok: false, status, note: "RBAC negou pra esse role" };
    return { ok: false, status };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: "ERR", note: err instanceof Error ? err.message : String(err) };
  }
}

async function obtainCookieViaBackend(): Promise<string> {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const users = await clerk.users.getUserList({ emailAddress: [AUTHED_EMAIL] });
  const user = users.data[0];
  if (!user) throw new Error(`User ${AUTHED_EMAIL} não existe no Clerk`);

  const session = await clerk.sessions.createSession({ userId: user.id });
  const tokenResp = await clerk.sessions.getToken(session.id, "default");
  return tokenResp.jwt;
}

async function main() {
  if (AUTHED_FLAG && !COOKIE) {
    console.log(`Criando session sintética via @clerk/backend pra ${AUTHED_EMAIL}...`);
    try {
      COOKIE = await obtainCookieViaBackend();
      console.log(`✓ Session criada (${COOKIE.length} chars)\n`);
    } catch (err) {
      console.error(`✗ Falhou: ${err instanceof Error ? err.message : err}`);
      console.error("Caia pra modo guest.");
    }
  }

  const isAuthed = COOKIE.length > 0 || COOKIE_HEADER.length > 0;

  // Preflight: confirma que o cookie ainda é válido ANTES de gastar tempo
  if (isAuthed) {
    try {
      const finalCookie = COOKIE_HEADER || `__session=${COOKIE}`;
      const res = await fetch(BASE_URL + "/api/debug-auth", {
        headers: {
          Cookie: finalCookie,
          Origin: BASE_URL,
          Referer: BASE_URL + "/",
        },
      });
      const data = await res.json();
      if (!data.auth?.userId) {
        console.error("\n✗ PREFLIGHT FALHOU: cookie expirou ou inválido");
        console.error("  Acessa http://localhost:3000/api/my-cookie-header AGORA e copia o cookie novo.");
        console.error("  Detalhe:", JSON.stringify(data.auth, null, 2));
        process.exit(2);
      }
      console.log(`✓ Preflight OK: userId=${data.auth.userId}, role=${JSON.stringify(data.auth.role)}\n`);
    } catch (err) {
      console.error(`✗ Preflight ERR: ${err instanceof Error ? err.message : err}`);
      process.exit(2);
    }
  }
  console.log("=".repeat(60));
  console.log(`Sweep em ${BASE_URL}`);
  console.log(`Modo: ${isAuthed ? "AUTHED" : "GUEST (sem cookie — valida redirects)"}`);
  console.log("=".repeat(60));

  const all = ONLY_PAGES ? PAGES : ONLY_APIS ? APIS : [...PAGES, ...APIS];
  console.log(`Rodando ${all.length} rotas (${ONLY_PAGES ? "só pages" : ONLY_APIS ? "só APIs" : "tudo"})\n`);
  let ok = 0;
  const fails: Array<{ route: Route; status: number | string; note?: string }> = [];

  // Paralelizar em batches pra caber dentro do TTL de 60s do cookie Clerk.
  const CONCURRENCY = 20;
  for (let i = 0; i < all.length; i += CONCURRENCY) {
    const batch = all.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((r) => checkOne(r, isAuthed)));
    for (let j = 0; j < batch.length; j++) {
      const route = batch[j];
      const res = results[j];
      const tag = res.ok ? "✓" : "✗";
      const note = res.note ? `  (${res.note})` : "";
      console.log(`${tag} [${String(res.status).padStart(3)}] ${route.method || "GET"} ${route.path}${note}`);
      if (res.ok) ok++;
      else fails.push({ route, status: res.status, note: res.note });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Resumo: ${ok}/${all.length} ok, ${fails.length} fail`);

  if (fails.length > 0) {
    console.log("\nFalhas (paste pro Claude corrigir):");
    for (const f of fails) {
      console.log(`  ${f.route.method || "GET"} ${f.route.path} → ${f.status}${f.note ? ` (${f.note})` : ""}`);
    }
    process.exit(1);
  }
}

main();
