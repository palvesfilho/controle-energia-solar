"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BellRing, Loader2, Send, Smartphone } from "lucide-react";
import { formatInstantBR } from "@/lib/date-only";

/**
 * Card "Notificações push" da página do proprietário.
 *
 * Serve para o teste manual: escrever um título e uma mensagem quaisquer e ver
 * exatamente como o celular renderiza. Nada aqui é automático — nenhum aviso
 * sai sem alguém clicar.
 *
 * ⚠️ O disparo toca o celular de uma pessoa real, por isso a confirmação antes
 * de enviar mostra o nome do proprietário e quantos aparelhos vão receber.
 */

interface Dispositivo {
  id: string;
  userAgent: string | null;
  createdAt: string;
  ultimoEnvioEm: string | null;
}

/** "Android · Chrome" a partir do user agent — só para reconhecer o aparelho. */
function descreveAparelho(ua: string | null): string {
  if (!ua) return "Aparelho não identificado";

  const sistema = /iPhone|iPad|iPod/i.test(ua)
    ? "iPhone/iPad"
    : /Android/i.test(ua)
      ? "Android"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X/i.test(ua)
          ? "Mac"
          : "Sistema desconhecido";

  // A ordem importa: o Edge também se diz "Chrome", e o Chrome também se diz
  // "Safari". Do mais específico para o mais genérico.
  const navegador = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /SamsungBrowser/i.test(ua)
        ? "Samsung Internet"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Chrome\//i.test(ua)
            ? "Chrome"
            : /Safari\//i.test(ua)
              ? "Safari"
              : "Navegador desconhecido";

  return `${sistema} · ${navegador}`;
}

export function PushTesteCard({
  proprietarioId,
  proprietarioNome,
}: {
  proprietarioId: string;
  proprietarioNome: string;
}) {
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [configurado, setConfigurado] = useState(true);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [titulo, setTitulo] = useState("Rede Brasil Solar");
  const [mensagem, setMensagem] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(
        `/api/admin/brasil-solar/push/dispositivos?proprietarioId=${proprietarioId}`,
      );
      if (!res.ok) throw new Error();
      const d = (await res.json()) as {
        configurado: boolean;
        dispositivos: Dispositivo[];
      };
      setConfigurado(d.configurado);
      setDispositivos(d.dispositivos);
    } catch {
      toast.error("Não foi possível carregar os aparelhos inscritos");
    } finally {
      setCarregando(false);
    }
  }, [proprietarioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function enviar() {
    const t = titulo.trim();
    const m = mensagem.trim();
    if (!t || !m) {
      toast.error("Preencha o título e a mensagem");
      return;
    }

    const quantos = dispositivos.length;
    const confirmado = window.confirm(
      `Enviar esta notificação agora para ${quantos} aparelho${quantos > 1 ? "s" : ""} de ${proprietarioNome}?\n\n${t}\n${m}`,
    );
    if (!confirmado) return;

    setEnviando(true);
    try {
      const res = await fetch("/api/admin/brasil-solar/push/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proprietarioId, titulo: t, mensagem: m }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Falha ao enviar");

      const { enviados, removidos, falhas } = d as {
        enviados: number;
        removidos: number;
        falhas: string[];
      };

      if (enviados > 0) {
        // "Aceito" e não "recebido": o Web Push não confirma leitura, e o
        // aparelho desligado só recebe quando voltar.
        toast.success(
          `Aceito pelo serviço de push para ${enviados} aparelho${enviados > 1 ? "s" : ""}. Se não aparecer, confira o celular.`,
        );
      } else {
        toast.warning("Nenhum aparelho recebeu o envio");
      }
      if (removidos > 0) {
        toast.info(
          `${removidos} inscrição(ões) expirada(s) foram removidas — aquele aparelho precisa autorizar de novo.`,
        );
      }
      falhas.forEach((f) => toast.error(`Falha no envio — ${f}`));

      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <BellRing className="h-4 w-4" /> Notificações push ({dispositivos.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configurado && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
            As chaves VAPID não estão configuradas neste ambiente. Nem a
            inscrição nem o envio funcionam até definir{" "}
            <code>VAPID_PUBLIC_KEY</code> e <code>VAPID_PRIVATE_KEY</code>.
          </div>
        )}

        {carregando ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando aparelhos…
          </div>
        ) : dispositivos.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">
            Nenhum aparelho inscrito. O cliente precisa abrir o portal no
            celular e tocar em <strong>Ativar avisos</strong> — no iPhone, só
            depois de instalar o app na tela de início.
          </div>
        ) : (
          <div className="space-y-1.5">
            {dispositivos.map((d) => (
              <div
                key={d.id}
                className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
              >
                <Smartphone className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="font-medium">{descreveAparelho(d.userAgent)}</div>
                  <div className="text-muted-foreground">
                    Autorizado em {formatInstantBR(new Date(d.createdAt))}
                    {d.ultimoEnvioEm &&
                      ` · último envio em ${formatInstantBR(new Date(d.ultimoEnvioEm))}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 border-t pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="push-titulo" className="text-xs">
              Título
            </Label>
            <Input
              id="push-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={80}
              placeholder="Sua usina gerou hoje"
            />
            {/* O Android corta o título perto de 50 caracteres; avisar antes
                evita um teste que "some" no celular sem explicação. */}
            <p className="text-[11px] text-muted-foreground">
              {titulo.trim().length}/80 — acima de ~50 o celular corta.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="push-mensagem" className="text-xs">
              Mensagem
            </Label>
            <textarea
              id="push-mensagem"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="18,4 kWh — melhor dia do mês."
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <p className="text-[11px] text-muted-foreground">
              {mensagem.trim().length}/300 — o celular mostra ~2 linhas fechado.
            </p>
          </div>

          <Button
            onClick={enviar}
            disabled={enviando || dispositivos.length === 0 || !configurado}
            className="gap-1.5"
          >
            {enviando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Enviar teste
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
