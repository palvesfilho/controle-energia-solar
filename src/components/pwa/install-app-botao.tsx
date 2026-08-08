"use client";

import { useState } from "react";
import { Check, Download, Share, SquarePlus } from "lucide-react";
import { brand } from "@/lib/brand-colors";
import { useInstalarApp } from "./use-instalar-app";

/**
 * Botão "Instalar app" da barra de prévia da Visão do cliente.
 *
 * Mesma lógica da faixa que o cliente vê (`InstallPrompt`), aparência discreta
 * para caber na barra verde. Três diferenças propositais em relação à faixa:
 *
 *  1. Fica DENTRO da barra de prévia, não flutuando na base — a Visão do cliente
 *     é uma réplica de suporte, e um pop-up idêntico ao do cliente confundiria
 *     quem está demonstrando a tela numa chamada.
 *  2. Ignora o "dispensado" do localStorage: é ferramenta de operação, tem que
 *     estar sempre à mão.
 *  3. Nunca some. Quando o navegador não oferece a instalação, explica o porquê
 *     em vez de sumir calado — senão o operador fica procurando um botão que
 *     não existe.
 *
 * ⚠️ O `start_url` do manifest é `/portal-cliente`. Instalar por aqui cria o
 * ícone do portal REAL, que vai pedir o login do cliente — é o comportamento
 * certo, mas o aviso no painel evita a surpresa.
 */
export function InstallAppBotao() {
  const { podeInstalarDireto, ehIOS, instalado, instalar } = useInstalarApp();
  const [painelAberto, setPainelAberto] = useState(false);

  if (instalado) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold opacity-80">
        <Check className="h-3.5 w-3.5" /> App instalado
      </span>
    );
  }

  async function aoClicar() {
    if (podeInstalarDireto) {
      await instalar();
      return;
    }
    // iOS e navegadores sem suporte: o painel é a única coisa que temos.
    setPainelAberto((aberto) => !aberto);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={aoClicar}
        aria-expanded={painelAberto}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        {/* Em tela estreita a barra já leva o alternador e o "Voltar";
            aqui sobra só o ícone. */}
        <span className="hidden sm:inline">Instalar app</span>
        <span className="sr-only sm:hidden">Instalar app</span>
      </button>

      {painelAberto && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl bg-white p-3 text-[#1F1F1F] shadow-lg ring-1 ring-black/5">
          {ehIOS ? (
            <>
              <p className="text-xs font-semibold">Instalar no iPhone</p>
              <ol className="mt-2 space-y-2 text-xs text-[#59604F]">
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
            </>
          ) : (
            <>
              <p className="text-xs font-semibold">Instalação indisponível aqui</p>
              <p className="mt-1 text-xs text-[#59604F]">
                Este navegador não ofereceu a instalação. Ela funciona no Chrome ou
                Edge, por HTTPS — no Firefox não existe. Se você já instalou o app
                antes, o botão não aparece de novo.
              </p>
            </>
          )}
          <p className="mt-3 border-t pt-2 text-[11px] text-[#8A938D]">
            O ícone abre o portal do cliente e pede o login dele, não o seu.
          </p>
        </div>
      )}
    </div>
  );
}
