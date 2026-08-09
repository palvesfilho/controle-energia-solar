"use client";

import { useCallback, useEffect, useState } from "react";
import { detectaIOS, detectaInstalado } from "./use-instalar-app";

/**
 * Estado e ações das notificações push do Portal do Cliente.
 *
 * Três armadilhas que este hook existe para esconder da UI:
 *
 * 1. **iPhone só recebe push depois de instalado.** O Safari não expõe
 *    `PushManager` fora do app na tela de início (iOS 16.4+). Por isso o estado
 *    `precisaInstalar`: oferecer o botão ali só produziria erro.
 *
 * 2. **Permissão negada não volta atrás.** O navegador só pergunta UMA vez; um
 *    "Bloquear" é definitivo até o cliente mexer nas configurações do site. Daí
 *    pedir permissão apenas no clique, nunca ao carregar a tela.
 *
 * 3. **Em desenvolvimento não há service worker.** O `PwaRegister` só registra
 *    em produção. Sem registro, `navigator.serviceWorker.ready` NUNCA resolve —
 *    o botão ficaria girando para sempre. Por isso checamos
 *    `getRegistration()` antes.
 */

export type EstadoPush =
  /** Ainda lendo a situação atual do navegador. */
  | "carregando"
  /** Navegador sem suporte a push (ou desktop antigo). */
  | "indisponivel"
  /** iPhone que ainda não instalou o app na tela de início. */
  | "precisaInstalar"
  /** Dá pra ativar. */
  | "desligado"
  /** Já recebe avisos neste aparelho. */
  | "ligado"
  /** Cliente bloqueou; só pelas configurações do navegador. */
  | "bloqueado";

export interface PushNotificacoes {
  estado: EstadoPush;
  ocupado: boolean;
  erro: string | null;
  ativar: () => Promise<void>;
  desativar: () => Promise<void>;
}

/**
 * A chave VAPID chega em base64url e o `pushManager.subscribe` exige bytes.
 * Sem essa conversão o navegador rejeita com um "InvalidCharacterError" que não
 * explica nada.
 */
function base64UrlParaBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const preenchimento = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + preenchimento).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(base64);
  // O buffer é criado à parte de propósito: `new Uint8Array(n)` tem tipo
  // `Uint8Array<ArrayBufferLike>`, que o TS não aceita como `BufferSource` do
  // `subscribe` (ArrayBufferLike inclui SharedArrayBuffer). Partir de um
  // ArrayBuffer concreto resolve sem `as`.
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i += 1) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

/** Registro ativo do service worker, ou `null` se não houver nenhum. */
async function registroAtivo(): Promise<ServiceWorkerRegistration | null> {
  const existente = await navigator.serviceWorker.getRegistration("/");
  if (!existente) return null;
  // Com um registro em mãos, `ready` resolve assim que ele ativar.
  return navigator.serviceWorker.ready;
}

export function usePushNotificacoes(): PushNotificacoes {
  const [estado, setEstado] = useState<EstadoPush>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const suportado =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!suportado) {
        // iPhone fora do app instalado cai aqui: o Safari esconde o
        // PushManager. Vale distinguir, senão o cliente lê "não suportado" num
        // aparelho que suporta.
        if (!cancelado) {
          setEstado(detectaIOS() && !detectaInstalado() ? "precisaInstalar" : "indisponivel");
        }
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelado) setEstado("bloqueado");
        return;
      }

      const registro = await registroAtivo();
      if (cancelado) return;
      if (!registro) {
        // Produção: o PwaRegister ainda não terminou. Desenvolvimento: nunca vai.
        setEstado("indisponivel");
        return;
      }

      const inscricao = await registro.pushManager.getSubscription();
      if (cancelado) return;
      setEstado(inscricao ? "ligado" : "desligado");
    })().catch(() => {
      if (!cancelado) setEstado("indisponivel");
    });

    return () => {
      cancelado = true;
    };
  }, []);

  const ativar = useCallback(async () => {
    setOcupado(true);
    setErro(null);
    try {
      // Precisa vir do clique: fora de um gesto do usuário o navegador recusa.
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }

      const resChave = await fetch("/api/portal-cliente/push/chave");
      if (!resChave.ok) throw new Error("Servidor sem notificações configuradas.");
      const { chavePublica } = (await resChave.json()) as { chavePublica: string };

      const registro = await registroAtivo();
      if (!registro) throw new Error("O aplicativo ainda não terminou de instalar.");

      const inscricao = await registro.pushManager.subscribe({
        // Obrigatório `true`: o navegador não aceita push silencioso.
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaBytes(chavePublica),
      });

      const res = await fetch("/api/portal-cliente/push/inscrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inscricao.toJSON()),
      });
      if (!res.ok) {
        // Não deu pra registrar no servidor: desfaz no navegador, senão o
        // aparelho fica inscrito num push que ninguém consegue disparar.
        await inscricao.unsubscribe().catch(() => {});
        throw new Error("Não foi possível registrar este aparelho.");
      }

      setEstado("ligado");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ativar os avisos.");
    } finally {
      setOcupado(false);
    }
  }, []);

  const desativar = useCallback(async () => {
    setOcupado(true);
    setErro(null);
    try {
      const registro = await registroAtivo();
      const inscricao = await registro?.pushManager.getSubscription();
      if (inscricao) {
        // Avisa o servidor ANTES de cancelar: depois do `unsubscribe` o
        // endpoint some e a linha ficaria órfã no banco.
        await fetch("/api/portal-cliente/push/cancelar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        }).catch(() => {});
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao desativar os avisos.");
    } finally {
      setOcupado(false);
    }
  }, []);

  return { estado, ocupado, erro, ativar, desativar };
}
