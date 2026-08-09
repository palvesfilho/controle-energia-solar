"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Estado da instalação do PWA, compartilhado por quem oferece a instalação.
 *
 * Existem dois consumidores com aparências bem diferentes, mas a mesma lógica:
 *  - `InstallPrompt` — a faixa branca que o cliente vê no portal.
 *  - `InstallAppBotao` — o botão discreto da barra de prévia da Visão do cliente.
 *
 * Os sistemas não se comportam igual: Android/Chrome/Edge disparam
 * `beforeinstallprompt` e deixam abrir o diálogo nativo; iOS/Safari não tem essa
 * API e só aceita o caminho manual (Compartilhar → Adicionar à Tela de Início).
 */

const CHAVE_DISPENSA = "bs-pwa-install-dispensado";

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type EstadoInstalacao = {
  /** O navegador liberou o diálogo nativo: dá pra instalar num clique. */
  podeInstalarDireto: boolean;
  /** iPhone/iPad: só resta ensinar o caminho manual. */
  ehIOS: boolean;
  /** Já está aberto como app instalado. */
  instalado: boolean;
  /** O cliente já fechou a faixa neste navegador. */
  dispensado: boolean;
  dispensar: () => void;
  instalar: () => Promise<void>;
};

/**
 * Exportadas porque o `usePushNotificacoes` depende das MESMAS respostas: no
 * iPhone o push só existe depois que o app está instalado na tela de início.
 * Duas detecções separadas acabariam discordando e o cliente veria "ative os
 * avisos" numa tela que não pode ativar nada.
 */
export function detectaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari no iOS não implementa display-mode: standalone.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function detectaIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function useInstalarApp(): EstadoInstalacao {
  const [evento, setEvento] = useState<PromptEvent | null>(null);
  const [ehIOS, setEhIOS] = useState(false);
  const [instalado, setInstalado] = useState(false);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    // Só depois de montar: no servidor não existe navigator, e ler isso na
    // primeira renderização quebraria a hidratação.
    setEhIOS(detectaIOS());
    setInstalado(detectaInstalado());
    setDispensado(localStorage.getItem(CHAVE_DISPENSA) === "1");

    const aoPoderInstalar = (e: Event) => {
      // Sem o preventDefault o Chrome mostra o próprio mini-infobar.
      e.preventDefault();
      setEvento(e as PromptEvent);
    };

    const aoInstalar = () => setInstalado(true);

    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  const dispensar = useCallback(() => {
    localStorage.setItem(CHAVE_DISPENSA, "1");
    setDispensado(true);
  }, []);

  const instalar = useCallback(async () => {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "accepted") setInstalado(true);
    // O evento é de uso único: depois de consumido não dá pra chamar de novo.
    setEvento(null);
  }, [evento]);

  return {
    podeInstalarDireto: evento !== null,
    ehIOS,
    instalado,
    dispensado,
    dispensar,
    instalar,
  };
}
