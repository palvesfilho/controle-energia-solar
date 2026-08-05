"use client";

import { CloudOff, RotateCw } from "lucide-react";
import { brandGradient } from "@/lib/brand-colors";

/**
 * Tela exibida pelo service worker (`public/sw.js`) quando o app está aberto
 * sem conexão. É pública e estática de propósito: precisa ser pré-cacheada no
 * install do SW, antes de existir qualquer sessão.
 *
 * Não mostra dados do cliente — ver a nota sobre cache em `public/sw.js`.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F8F7] px-6 text-center">
      <div
        className="h-16 w-16 rounded-2xl flex items-center justify-center mb-6"
        style={{ background: brandGradient }}
      >
        <CloudOff className="h-8 w-8 text-white" />
      </div>

      <h1 className="text-xl font-semibold text-[#1F1F1F]">Você está sem conexão</h1>
      <p className="text-sm text-[#59604F] mt-2 max-w-sm">
        Não conseguimos carregar os dados da sua usina agora. Assim que o sinal
        voltar, é só tentar de novo.
      </p>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-8 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ background: brandGradient }}
      >
        <RotateCw className="h-4 w-4" />
        Tentar de novo
      </button>

      <p className="text-xs text-[#8A938D] mt-10">Rede Brasil Solar · Portal do Cliente</p>
    </div>
  );
}
