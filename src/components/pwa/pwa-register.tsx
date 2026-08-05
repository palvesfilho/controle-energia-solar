"use client";

import { useEffect } from "react";

/**
 * Registra o service worker do PWA (`public/sw.js`).
 *
 * Só roda em produção: em dev os chunks do Next não têm hash estável e o
 * cache-first de `/_next/static/` serviria arquivo velho depois de um HMR.
 * Para testar localmente use `npm run build && npm start` (localhost conta
 * como origem segura, então o install do PWA funciona lá).
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Se já existe controller, este load é de um app instalado; a troca de
    // controller depois disso significa deploy novo e pede reload. Na primeira
    // instalação o `clients.claim()` também dispara o evento — aí NÃO
    // recarregamos, senão todo primeiro acesso piscaria.
    const jaTinhaController = Boolean(navigator.serviceWorker.controller);
    let recarregando = false;

    const aoTrocarController = () => {
      if (!jaTinhaController || recarregando) return;
      recarregando = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", aoTrocarController);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registro) => {
        registro.addEventListener("updatefound", () => {
          const novo = registro.installing;
          if (!novo) return;
          novo.addEventListener("statechange", () => {
            if (novo.state === "installed" && navigator.serviceWorker.controller) {
              // Versão nova pronta e uma antiga no controle: assume já.
              novo.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch((err) => {
        console.error("[pwa] falha ao registrar o service worker", err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", aoTrocarController);
    };
  }, []);

  return null;
}
