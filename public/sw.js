/**
 * Service worker do Portal do Cliente (PWA) — Rede Brasil Solar.
 *
 * Fica na raiz (`/sw.js`) de propósito: o escopo de um service worker é o
 * diretório onde ele mora, e daqui ele controla `/portal-cliente` e as rotas de
 * login para as quais o Clerk redireciona.
 *
 * O que ele guarda:
 *   - assets estáticos do build (`/_next/static/*`, com hash no nome) e os
 *     ícones do PWA → cache-first, porque nunca mudam sem mudar de URL;
 *   - a página `/offline`, exibida quando uma navegação falha sem rede.
 *
 * O que ele NUNCA guarda: HTML de página autenticada e respostas de `/api`.
 * O portal mostra consumo, geração e valores de um cliente específico; num
 * celular compartilhado (ou depois do logout) um HTML cacheado apareceria para
 * a pessoa errada. Por isso a navegação é sempre network-first sem gravar em
 * cache — offline o app abre na tela `/offline`, não em dados de outra pessoa.
 *
 * Ao mudar qualquer coisa aqui, suba o VERSION: o `activate` apaga todo cache
 * que não seja o da versão corrente.
 */

const VERSION = "v1";
const STATIC_CACHE = `bs-portal-static-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/pwa/icon-192.png", "/pwa/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // `cache: "reload"` ignora o cache HTTP do navegador e busca a versão
      // nova do build no deploy.
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const chaves = await caches.keys();
      await Promise.all(
        chaves.filter((chave) => chave !== STATIC_CACHE).map((chave) => caches.delete(chave)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Assets imutáveis: o nome do arquivo muda a cada build, então cache-first é seguro. */
function isAssetImutavel(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pwa/") ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Same-origin apenas. Clerk, Google Fonts e afins passam direto.
  if (url.origin !== self.location.origin) return;
  // API nunca é cacheada nem interceptada.
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return offline ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (isAssetImutavel(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});

/**
 * Permite que a página force a ativação de um SW novo sem esperar o próximo
 * fechamento do app (ver `pwa-register.tsx`).
 */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
