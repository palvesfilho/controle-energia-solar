"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { brand, brandGradient } from "@/lib/brand-colors";

/**
 * Faixa "Instalar aplicativo" do Portal do Cliente.
 *
 * Dois caminhos, porque os sistemas não se comportam igual:
 *  - Android/Chrome/Edge disparam `beforeinstallprompt`; guardamos o evento e
 *    abrimos o diálogo nativo no clique.
 *  - iOS/Safari não tem essa API. Lá só resta explicar o caminho manual
 *    (Compartilhar → Adicionar à Tela de Início).
 *
 * Some quando o app já está instalado (`display-mode: standalone`) ou quando o
 * cliente dispensa a faixa.
 */

const CHAVE_DISPENSA = "bs-pwa-install-dispensado";

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function estaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari no iOS não implementa display-mode: standalone.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function ehIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [evento, setEvento] = useState<PromptEvent | null>(null);
  const [mostrarIOS, setMostrarIOS] = useState(false);
  const [visivel, setVisivel] = useState(false);
  const [comoFazerIOS, setComoFazerIOS] = useState(false);

  useEffect(() => {
    if (estaInstalado()) return;
    if (localStorage.getItem(CHAVE_DISPENSA) === "1") return;

    if (ehIOS()) {
      setMostrarIOS(true);
      setVisivel(true);
      return;
    }

    const aoPoderInstalar = (e: Event) => {
      // Sem o preventDefault o Chrome mostra o próprio mini-infobar.
      e.preventDefault();
      setEvento(e as PromptEvent);
      setVisivel(true);
    };

    const aoInstalar = () => setVisivel(false);

    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  function dispensar() {
    localStorage.setItem(CHAVE_DISPENSA, "1");
    setVisivel(false);
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "accepted") setVisivel(false);
    // O evento é de uso único: depois de consumido não dá pra chamar de novo.
    setEvento(null);
  }

  if (!visivel) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-white shadow-lg ring-1 ring-black/5 p-4">
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: brandGradient }}
          >
            <Download className="h-5 w-5 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1F1F1F]">
              Instale o app da sua usina
            </p>
            <p className="text-xs text-[#59604F] mt-0.5">
              Fica com ícone na tela do celular e abre direto, sem navegador.
            </p>

            {mostrarIOS ? (
              comoFazerIOS ? (
                <ol className="mt-3 space-y-2 text-xs text-[#59604F]">
                  <li className="flex items-center gap-2">
                    <Share className="h-4 w-4 shrink-0" style={{ color: brand.teal }} />
                    <span>
                      Toque em <strong>Compartilhar</strong>, na barra do Safari.
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <SquarePlus className="h-4 w-4 shrink-0" style={{ color: brand.teal }} />
                    <span>
                      Escolha <strong>Adicionar à Tela de Início</strong>.
                    </span>
                  </li>
                </ol>
              ) : (
                <button
                  type="button"
                  onClick={() => setComoFazerIOS(true)}
                  className="mt-3 rounded-lg px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: brandGradient }}
                >
                  Como instalar
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={instalar}
                className="mt-3 rounded-lg px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: brandGradient }}
              >
                Instalar aplicativo
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={dispensar}
            aria-label="Dispensar"
            className="shrink-0 rounded-md p-1 text-[#8A938D] hover:bg-[#F5F8F7]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
