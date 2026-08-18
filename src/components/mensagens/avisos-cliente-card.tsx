"use client";

/**
 * Caixa de avisos do cliente no Portal — o outro lado do módulo MENSAGENS.
 *
 * Push é um empurrão que dura segundos e não volta: quem estava dirigindo
 * perdeu a oferta para sempre. Aqui o aviso espera. É também o que alcança o
 * cliente que nunca autorizou notificação — sem esta caixa, campanha só falaria
 * com a minoria que instalou o app.
 *
 * 🔑 O botão de interesse é o produto inteiro: é ele que vira lead com telefone
 * na tela do pós-venda. Sem CTA, a campanha informa e não vende.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, Check, Loader2, X } from "lucide-react";

interface Aviso {
  id: string;
  titulo: string;
  mensagem: string;
  ctaLabel: string | null;
  enviadaEm: string;
  lido: boolean;
  interesse: boolean;
}

export function AvisosClienteCard() {
  const searchParams = useSearchParams();
  // Chega preenchido quando o cliente toca na notificação: o disparo põe
  // `?aviso=<envioId>` na URL justamente para registrar a abertura.
  const avisoDaNotificacao = searchParams.get("aviso");

  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/portal-cliente/avisos");
      if (res.ok) setAvisos((await res.json()).avisos);
    } catch {
      // Silêncio de propósito: o portal não pode virar tela de erro por causa
      // de um card de avisos que não carregou.
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Marca como lido o aviso que trouxe o cliente até aqui. É a única medida de
  // engajamento possível — o Web Push não confirma leitura.
  useEffect(() => {
    if (!avisoDaNotificacao) return;
    void fetch(`/api/portal-cliente/avisos/${avisoDaNotificacao}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "LIDO" }),
    });
  }, [avisoDaNotificacao]);

  async function agir(id: string, acao: "INTERESSE" | "DISPENSAR") {
    setAgindo(id);
    try {
      await fetch(`/api/portal-cliente/avisos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      if (acao === "DISPENSAR") {
        setAvisos((prev) => prev.filter((a) => a.id !== id));
      } else {
        setAvisos((prev) => prev.map((a) => (a.id === id ? { ...a, interesse: true } : a)));
      }
    } finally {
      setAgindo(null);
    }
  }

  // Sem aviso nenhum o card não aparece: caixa vazia no portal só ocupa a tela
  // e sugere que falta alguma coisa.
  if (carregando || avisos.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-[#59604F]" />
        <h3 className="text-sm font-semibold text-[#1F1F1F]">Avisos para você</h3>
      </div>

      <div className="space-y-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={`rounded-xl border p-4 ${
              a.lido ? "border-[#E6EAE7]" : "border-[#CDE3D7] bg-[#F3F9F5]"
            }`}
          >
            <div className="text-sm font-semibold text-[#1F1F1F]">{a.titulo}</div>
            <p className="mt-0.5 text-sm text-[#59604F]">{a.mensagem}</p>

            <div className="mt-3 flex items-center gap-2">
              {a.interesse ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#E7F4EC] px-3 py-1.5 text-xs font-medium text-[#1F6B43]">
                  <Check className="h-3.5 w-3.5" /> Recebemos seu interesse — vamos falar com você
                </span>
              ) : (
                a.ctaLabel && (
                  <button
                    type="button"
                    disabled={agindo === a.id}
                    onClick={() => void agir(a.id, "INTERESSE")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F6B43] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {agindo === a.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {a.ctaLabel}
                  </button>
                )
              )}
              <button
                type="button"
                disabled={agindo === a.id}
                onClick={() => void agir(a.id, "DISPENSAR")}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[#8A938D] hover:text-[#59604F]"
              >
                <X className="h-3.5 w-3.5" /> Dispensar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
