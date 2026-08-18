"use client";

/**
 * Escrita de uma campanha: modelo → texto → público → disparo.
 *
 * A prévia do celular fica ao lado do texto o tempo todo. O título vira
 * reticências perto de 50 caracteres no Android e o corpo mostra ~2 linhas com
 * a notificação fechada — quem escreve precisa VER o corte enquanto digita, não
 * descobrir depois que a oferta ficou fora da tela.
 *
 * ⚠️ Enviar toca o celular de clientes reais e não tem desfazer. Por isso o
 * fluxo é: salva rascunho → (opcional) manda prova para um aparelho → confirma
 * com o número de pessoas na frente.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Send, Save, Sparkles, Bell } from "lucide-react";
import { MODELOS_CAMPANHA, type ModeloCampanha } from "@/lib/mensagens-modelos";
import type { FiltroPublico } from "@/lib/mensagens-publico";
import { SeletorPublico, type PreviaPublicoUI } from "@/components/mensagens/seletor-publico";

/** Como o Android mostra o texto com a notificação fechada. */
function PreviaCelular({ titulo, mensagem }: { titulo: string; mensagem: string }) {
  return (
    <div className="rounded-2xl bg-[#1b1b1f] p-3 text-white shadow-lg">
      <div className="rounded-xl bg-[#2c2c31] p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-white/60">
          <Bell className="h-3 w-3" /> REDE BRASIL SOLAR · agora
        </div>
        <div className="truncate text-sm font-semibold">
          {titulo || "Título da notificação"}
        </div>
        <div className="line-clamp-2 text-xs text-white/70">
          {mensagem || "O corpo da mensagem aparece aqui, em duas linhas."}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-white/40">
        Prévia aproximada. iPhone e Android cortam em pontos um pouco diferentes.
      </p>
    </div>
  );
}

export function CampanhaEditor() {
  const router = useRouter();

  const [modeloId, setModeloId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [canal, setCanal] = useState<"PUSH_E_PORTAL" | "SO_PORTAL">("PUSH_E_PORTAL");
  const [filtro, setFiltro] = useState<FiltroPublico>({});
  const [previa, setPrevia] = useState<PreviaPublicoUI | null>(null);
  const [salvando, setSalvando] = useState(false);

  function aplicarModelo(m: ModeloCampanha) {
    setModeloId(m.id);
    setNome(m.nome);
    setTitulo(m.titulo);
    setMensagem(m.mensagem);
    setCtaLabel(m.ctaLabel ?? "");
    // O filtro do modelo é sugestão — sobrescreve o que estava, porque metade
    // de um recorte antigo com metade do novo não é público de ninguém.
    setFiltro(m.filtro);
  }

  /** Cria o rascunho e devolve o id. Único ponto que fala com a API de criação. */
  async function salvarRascunho(): Promise<string | null> {
    if (!nome.trim() || !titulo.trim() || !mensagem.trim()) {
      toast.error("Preencha o nome da campanha, o título e a mensagem");
      return null;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/mensagens/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          titulo: titulo.trim(),
          mensagem: mensagem.trim(),
          ctaLabel: ctaLabel.trim() || null,
          canal,
          filtro,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Falha ao salvar");
      return d.id as string;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function salvarESair() {
    const id = await salvarRascunho();
    if (id) {
      toast.success("Rascunho salvo — nada foi enviado ainda.");
      router.push(`/admin/brasil-solar/mensagens/${id}`);
    }
  }

  async function salvarEEnviar() {
    const total = previa?.total ?? 0;
    const comApp = previa?.comApp ?? 0;
    if (total === 0) {
      toast.error("O público está vazio — ajuste os filtros.");
      return;
    }

    const confirmado = window.confirm(
      `Enviar AGORA para ${total} cliente(s)?\n\n` +
        `${comApp} têm o app e vão receber a notificação no celular; os demais verão o aviso ao abrir o portal.\n\n` +
        `“${titulo.trim()}”\n${mensagem.trim()}\n\n` +
        `Não é possível desfazer.`,
    );
    if (!confirmado) return;

    const id = await salvarRascunho();
    if (!id) return;

    setSalvando(true);
    try {
      const res = await fetch(`/api/admin/mensagens/campanhas/${id}/enviar`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Falha ao disparar");
      toast.success(
        `Campanha enviada: ${d.publico} cliente(s) na caixa de avisos, ${d.aparelhosEnviados} aparelho(s) aceitos pelo serviço de push.`,
      );
      router.push(`/admin/brasil-solar/mensagens/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao disparar");
      // O rascunho existe: leva para a tela dele em vez de perder o texto.
      router.push(`/admin/brasil-solar/mensagens/${id}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/brasil-solar/mensagens"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nova campanha</h1>
          <p className="text-sm text-muted-foreground">
            Escolha um modelo pronto ou escreva do zero. Nada sai antes de você confirmar.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Sparkles className="h-4 w-4" /> Modelos prontos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {MODELOS_CAMPANHA.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => aplicarModelo(m)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
                  modeloId === m.id && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
                )}
              >
                <Badge variant="secondary" className="mb-1.5 text-[10px] font-normal">
                  {m.categoria}
                </Badge>
                <div className="text-sm font-medium leading-tight">{m.nome}</div>
                <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{m.porQue}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">1. A mensagem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da campanha (só você vê)</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={120}
                placeholder="Limpeza semestral — agosto/2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={80}
                placeholder="Sua usina pode gerar mais"
              />
              <p
                className={cn(
                  "text-[11px]",
                  titulo.trim().length > 50 ? "text-amber-600" : "text-muted-foreground",
                )}
              >
                {titulo.trim().length}/80 — acima de ~50 o celular corta.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem</Label>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                maxLength={300}
                rows={4}
                placeholder="Módulo sujo perde até 20% de geração…"
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <p className="text-[11px] text-muted-foreground">
                {mensagem.trim().length}/300 — o celular mostra ~2 linhas fechado.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Botão de interesse{" "}
                <span className="text-muted-foreground">— vazio = aviso sem botão</span>
              </Label>
              <Input
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                maxLength={40}
                placeholder="Quero agendar"
              />
              <p className="text-[11px] text-muted-foreground">
                Quem tocar aqui vira lead na aba <strong>Interessados</strong>, com telefone.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Como entregar</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCanal("PUSH_E_PORTAL")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    canal === "PUSH_E_PORTAL"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "hover:bg-muted",
                  )}
                >
                  Notificação no celular + portal
                </button>
                <button
                  type="button"
                  onClick={() => setCanal("SO_PORTAL")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    canal === "SO_PORTAL"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "hover:bg-muted",
                  )}
                >
                  Só no portal (não toca o celular)
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <PreviaCelular titulo={titulo} mensagem={mensagem} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">2. Quem recebe</CardTitle>
        </CardHeader>
        <CardContent>
          <SeletorPublico filtro={filtro} onChange={setFiltro} onPrevia={setPrevia} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button variant="outline" onClick={salvarESair} disabled={salvando} className="gap-1.5">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar rascunho
        </Button>
        <Button onClick={salvarEEnviar} disabled={salvando} className="gap-1.5">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar agora
        </Button>
        <span className="text-xs text-muted-foreground">
          {previa
            ? `${previa.total} cliente(s) · ${previa.comApp} com app`
            : "calculando o público…"}
        </span>
      </div>
    </div>
  );
}
