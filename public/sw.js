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
 * Também recebe as notificações push (ver `push`/`notificationclick` no fim do
 * arquivo). Só o service worker consegue exibir notificação de push — a página
 * pode estar fechada quando o aviso chega, e é justamente esse o objetivo.
 *
 * Ao mudar qualquer coisa aqui, suba o VERSION: o `activate` apaga todo cache
 * que não seja o da versão corrente.
 */

const VERSION = "v2";
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

/* ------------------------------------------------------------------ *
 * Notificações push
 * ------------------------------------------------------------------ */

/** Aberto quando o cliente toca na notificação e o payload não diz outra coisa. */
const URL_PADRAO = "/portal-cliente";

/**
 * Chegou um push do servidor.
 *
 * O payload vem de `src/lib/push-notificacoes.ts` como JSON
 * (`{ titulo, mensagem, url }`), mas NÃO dá pra confiar nisso: um push sem
 * corpo é legítimo (serve pra "acorde e busque dados"), e um payload
 * malformado não pode derrubar o handler. Se `showNotification` não for
 * chamado, o Android e o Chrome exibem por conta própria um aviso genérico
 * "Este site foi atualizado em segundo plano" — feio e sem contexto. Por isso
 * há sempre um texto de reserva.
 */
self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    // Payload não-JSON: aproveita como texto puro, se houver.
    dados = { mensagem: event.data ? event.data.text() : "" };
  }

  const titulo = dados.titulo || "Rede Brasil Solar";
  const opcoes = {
    body: dados.mensagem || "Você tem uma novidade sobre a sua usina.",
    icon: "/pwa/icon-192.png",
    // O badge é o ícone monocromático da barra de status do Android.
    badge: "/pwa/icon-192.png",
    // `tag` faz a notificação nova SUBSTITUIR a anterior de mesma tag em vez de
    // empilhar. Sem isso, um cliente que fica dias sem abrir acumula uma pilha
    // de avisos repetidos.
    tag: dados.tag || "brasil-solar",
    renotify: Boolean(dados.tag),
    data: { url: dados.url || URL_PADRAO },
  };

  // `waitUntil` mantém o service worker vivo até a notificação aparecer; sem
  // ele o navegador pode encerrar o worker antes de exibir.
  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

/**
 * Cliente tocou na notificação: foca a aba/app que já estiver aberto no portal
 * em vez de abrir uma segunda instância; só abre nova janela se não houver
 * nenhuma.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || URL_PADRAO;

  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({
        type: "window",
        // Necessário para enxergar janelas ainda não controladas por este SW.
        includeUncontrolled: true,
      });

      for (const janela of janelas) {
        if (new URL(janela.url).pathname.startsWith("/portal-cliente")) {
          await janela.focus();
          // Já está no portal: navega só se o destino for outra tela.
          if ("navigate" in janela && !janela.url.endsWith(destino)) {
            await janela.navigate(destino);
          }
          return;
        }
      }

      await self.clients.openWindow(destino);
    })(),
  );
});
