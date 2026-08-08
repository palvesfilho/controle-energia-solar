"use client";

import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { brand, brandGradient } from "@/lib/brand-colors";
import { useInstalarApp } from "./use-instalar-app";

/**
 * Faixa "Instalar aplicativo" do Portal do Cliente.
 *
 * A lógica de detectar o sistema e abrir o diálogo mora no `useInstalarApp`;
 * aqui fica só a aparência. Some quando o app já está instalado ou quando o
 * cliente dispensa a faixa.
 *
 * O primo desta faixa é o `InstallAppBotao`, usado na barra de prévia da Visão
 * do cliente — mesma lógica, aparência discreta.
 */
export function InstallPrompt() {
  const { podeInstalarDireto, ehIOS, instalado, dispensado, dispensar, instalar } =
    useInstalarApp();
  const [comoFazerIOS, setComoFazerIOS] = useState(false);

  // No iOS não há evento para esperar: a faixa aparece assim que sabemos que é
  // iPhone. Nos demais, só depois que o navegador libera a instalação.
  const visivel = !instalado && !dispensado && (ehIOS || podeInstalarDireto);
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

            {ehIOS ? (
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
