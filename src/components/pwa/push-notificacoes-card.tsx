"use client";

import { Bell, BellOff, BellRing, Loader2, Share, SquarePlus } from "lucide-react";
import { brand, brandGradient } from "@/lib/brand-colors";
import { usePushNotificacoes } from "./use-push-notificacoes";

/**
 * Card "Avisos no celular" do Portal do Cliente.
 *
 * Aparece dentro da página (não como faixa flutuante) de propósito: a faixa de
 * baixo já é da instalação do app, e duas caixas sobrepostas no rodapé do
 * celular brigariam pelo mesmo espaço.
 *
 * Toda a lógica difícil está no `usePushNotificacoes`; aqui só traduzimos cada
 * estado para uma frase que o cliente entenda sem saber o que é push.
 */
export function PushNotificacoesCard() {
  const { estado, ocupado, erro, ativar, desativar } = usePushNotificacoes();

  // Enquanto lê o navegador, não pisca nada: um card que aparece e some em
  // meio segundo parece defeito.
  if (estado === "carregando") return null;

  // Navegador sem suporte (desktop antigo, Firefox sem push): silêncio. Não há
  // nada que o cliente possa fazer, e um aviso de erro só assusta.
  if (estado === "indisponivel") return null;

  return (
    <div className="mt-6 rounded-2xl bg-white ring-1 ring-black/5 p-5">
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center"
          style={{ background: estado === "ligado" ? brand.tealDark : brandGradient }}
        >
          {estado === "ligado" ? (
            <BellRing className="h-5 w-5 text-white" />
          ) : estado === "bloqueado" ? (
            <BellOff className="h-5 w-5 text-white" />
          ) : (
            <Bell className="h-5 w-5 text-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1F1F1F]">Avisos no celular</p>

          {estado === "precisaInstalar" && (
            <>
              <p className="text-xs text-[#59604F] mt-0.5">
                No iPhone, os avisos só funcionam com o app instalado na tela de
                início.
              </p>
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
                    Escolha <strong>Adicionar à Tela de Início</strong> e abra por ali.
                  </span>
                </li>
              </ol>
            </>
          )}

          {estado === "bloqueado" && (
            <p className="text-xs text-[#59604F] mt-0.5">
              As notificações estão bloqueadas para este site. Para voltar a
              receber, libere as notificações nas configurações do navegador —
              daqui não é possível perguntar de novo.
            </p>
          )}

          {estado === "desligado" && (
            <>
              <p className="text-xs text-[#59604F] mt-0.5">
                Receba um aviso quando houver novidade sobre a sua usina, mesmo
                com o app fechado.
              </p>
              <button
                type="button"
                onClick={ativar}
                disabled={ocupado}
                className="mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: brandGradient }}
              >
                {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Ativar avisos
              </button>
            </>
          )}

          {estado === "ligado" && (
            <>
              <p className="text-xs text-[#59604F] mt-0.5">
                Este aparelho está recebendo os avisos da sua usina.
              </p>
              <button
                type="button"
                onClick={desativar}
                disabled={ocupado}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#D7E0DB] px-4 py-2 text-xs font-medium text-[#59604F] transition-colors hover:bg-[#F5F8F7] disabled:opacity-60"
              >
                {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Desativar
              </button>
            </>
          )}

          {erro && <p className="mt-2 text-xs text-[#B4472C]">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
