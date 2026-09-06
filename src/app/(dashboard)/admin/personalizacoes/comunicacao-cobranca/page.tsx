"use client";

/**
 * Comunicação com o cliente na cobrança — estado da configuração e teste.
 *
 * Duas perguntas, nesta ordem:
 *   1. As credenciais funcionam? (o cartão de cima faz LOGIN de verdade no SMTP
 *      e pergunta à Uazapi se a instância está pareada)
 *   2. A mensagem chega? (o teste manda uma de verdade para onde você digitar)
 *
 * ⚠️ O botão de teste ENVIA, mesmo com o disparo em modo simulação. É de
 * propósito: o destino é digitado à mão, é um gesto deliberado.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, MessageCircle, RefreshCw, Send, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface Estado {
  modo: "off" | "simulacao" | "real";
  travaContato: boolean;
  identidade: { nome: string; suporte: string };
  email: {
    configurado: boolean;
    provedor: string;
    remetente: string;
    ok: boolean;
    detalhe: string;
  };
  whatsapp: { configurado: boolean; ok: boolean; detalhe: string; numero?: string };
}

const MODO_TEXTO: Record<Estado["modo"], { rotulo: string; classe: string; explica: string }> = {
  simulacao: {
    rotulo: "SIMULAÇÃO",
    classe: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
    explica:
      "Emitir cobrança monta a mensagem e registra para quem iria, mas NÃO envia nada ao cliente.",
  },
  real: {
    rotulo: "REAL",
    classe: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
    explica: "Cada cobrança emitida envia email e WhatsApp ao cliente de verdade.",
  },
  off: {
    rotulo: "DESLIGADO",
    classe: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    explica: "Nenhum aviso é montado nem enviado. O Asaas volta a notificar sozinho.",
  },
};

function Linha({
  Icone,
  titulo,
  ok,
  configurado,
  detalhe,
  extra,
}: {
  Icone: typeof Mail;
  titulo: string;
  ok: boolean;
  configurado: boolean;
  detalhe: string;
  extra?: string;
}) {
  const Selo = ok ? ShieldCheck : ShieldAlert;
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Icone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{titulo}</span>
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
              ok
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                : "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"
            }`}
          >
            <Selo className="h-3 w-3" />
            {ok ? "funcionando" : configurado ? "com problema" : "não configurado"}
          </span>
        </div>
        <p className="mt-1 break-words text-xs text-muted-foreground">{detalhe}</p>
        {extra ? <p className="mt-0.5 text-xs text-muted-foreground">{extra}</p> : null}
      </div>
    </div>
  );
}

export default function ComunicacaoCobrancaPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [email, setEmail] = useState("");
  const [fone, setFone] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/comunicacao-cobranca");
      if (!r.ok) throw new Error("Falha ao consultar o estado da configuração");
      setEstado(await r.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const enviarTeste = async () => {
    if (!email.trim() && !fone.trim()) {
      toast.error("Informe um email e/ou um telefone de destino.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/admin/comunicacao-cobranca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), fone: fone.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error ?? "Falha no envio de teste");
        return;
      }
      for (const canal of ["email", "whatsapp"] as const) {
        const res = data[canal];
        if (!res) continue;
        if (res.ok) toast.success(`${canal === "email" ? "Email" : "WhatsApp"} enviado para ${res.destino}`);
        else toast.error(`${canal === "email" ? "Email" : "WhatsApp"} falhou: ${res.erro}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio de teste");
    } finally {
      setEnviando(false);
    }
  };

  const modo = estado ? MODO_TEXTO[estado.modo] : null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/personalizacoes"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Comunicação com o cliente</h1>
          <p className="text-sm text-muted-foreground">
            Email e WhatsApp disparados quando uma cobrança é emitida.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={carregando}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          Verificar de novo
        </button>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          {carregando && !estado ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Verificando...</p>
          ) : !estado ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Não foi possível consultar a configuração.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Disparo automático:</span>
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${modo!.classe}`}>
                  {modo!.rotulo}
                </span>
                <span className="text-xs text-muted-foreground">{modo!.explica}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Trava de contato:{" "}
                <strong>{estado.travaContato ? "ligada" : "desligada"}</strong> —{" "}
                {estado.travaContato
                  ? "UC sem email e telefone não pode ser cobrada."
                  : "a pendência aparece na tela, mas não impede cobrar."}
              </p>
              <p className="text-xs text-muted-foreground">
                O cliente vê a assinatura <strong>{estado.identidade.nome}</strong> e responde para{" "}
                <strong>{estado.identidade.suporte}</strong>.
              </p>

              <div className="grid gap-3 pt-1 md:grid-cols-2">
                <Linha
                  Icone={Mail}
                  titulo="Email"
                  ok={estado.email.ok}
                  configurado={estado.email.configurado}
                  detalhe={estado.email.detalhe}
                  extra={estado.email.configurado ? `Remetente: ${estado.email.remetente}` : undefined}
                />
                <Linha
                  Icone={MessageCircle}
                  titulo="WhatsApp"
                  ok={estado.whatsapp.ok}
                  configurado={estado.whatsapp.configurado}
                  detalhe={estado.whatsapp.detalhe}
                  extra={estado.whatsapp.numero ? `Número remetente: ${estado.whatsapp.numero}` : undefined}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">Enviar mensagem de teste</h2>
            <p className="text-xs text-muted-foreground">
              Manda uma mensagem de verdade para o destino que você digitar — mesmo com o
              disparo em modo simulação. Use o seu próprio contato.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-[240px] flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <input
              type="tel"
              placeholder="(55) 99999-9999"
              value={fone}
              onChange={(e) => setFone(e.target.value)}
              className="min-w-[180px] rounded-lg border bg-background px-3 py-1.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => void enviarTeste()}
              disabled={enviando}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {enviando ? "Enviando..." : "Enviar teste"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            O telefone passa pela mesma régua da cobrança: DDD válido, celular, nono dígito.
            Número fixo é recusado — não recebe WhatsApp.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
