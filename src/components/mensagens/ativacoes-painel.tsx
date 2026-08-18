"use client";

/**
 * Divisão 2 do módulo Mensagens: ATIVAÇÕES.
 *
 * A tela existe para tornar visível uma coisa que, por natureza, é invisível:
 * regras que mandam mensagem sozinhas. Por isso cada linha mostra, sempre,
 * quatro coisas — se está ligada, o que observa, de quanto em quanto tempo pode
 * repetir para o mesmo cliente, e quantas mensagens já saíram.
 *
 * ⚠️ Ligar uma regra é a única aprovação que existe aqui. Depois disso a
 * mensagem vai ao cliente sem ninguém conferir. A confirmação diz isso com
 * todas as letras, e o botão "Simular" existe para ninguém ligar às cegas.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Zap,
  ZapOff,
  Loader2,
  Plus,
  Trash2,
  FlaskConical,
  Clock,
  Bell,
} from "lucide-react";
import { formatInstantBR } from "@/lib/date-only";
import { MODELOS_ATIVACAO, type ModeloAtivacao } from "@/lib/mensagens-ativacoes-modelos";
import { DESCRICAO_GATILHO } from "@/lib/mensagens-gatilhos-rotulos";

interface Ativacao {
  id: string;
  nome: string;
  gatilho: string;
  gatilhoResumo: string;
  titulo: string;
  mensagem: string;
  ctaLabel: string | null;
  canal: string;
  ativa: boolean;
  cooldownDias: number;
  ativadaEm: string | null;
  ultimaAvaliacaoEm: string | null;
  totalDisparos: number;
  envios: number;
  criadoPorNome: string | null;
}

export function AtivacoesPainel() {
  const [ativacoes, setAtivacoes] = useState<Ativacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [criando, setCriando] = useState<ModeloAtivacao | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/admin/mensagens/ativacoes");
      if (res.ok) setAtivacoes((await res.json()).ativacoes);
    } catch {
      toast.error("Não foi possível carregar as ativações");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function ligar(a: Ativacao) {
    if (a.ativa) {
      if (!window.confirm(`Desligar “${a.nome}”? Nenhuma mensagem sai enquanto estiver desligada.`))
        return;
    } else {
      const ok = window.confirm(
        `Ligar “${a.nome}”?\n\n` +
          `A partir de agora esta regra manda a mensagem SOZINHA, sem ninguém aprovar cada envio:\n\n` +
          `Quando: ${a.gatilhoResumo}\n` +
          `“${a.titulo}”\n${a.mensagem}\n\n` +
          `Quem JÁ está nessa condição hoje não recebe nada — só quem entrar nela daqui pra frente. ` +
          `O mesmo cliente não recebe esta regra de novo por ${a.cooldownDias} dias.`,
      );
      if (!ok) return;
    }

    setAgindo(a.id);
    try {
      const res = await fetch(`/api/admin/mensagens/ativacoes/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativa: !a.ativa }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Falha");
      toast.success(a.ativa ? "Ativação desligada." : "Ativação ligada.");
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao alterar");
    } finally {
      setAgindo(null);
    }
  }

  async function simular(a: Ativacao) {
    setAgindo(a.id);
    try {
      const res = await fetch(`/api/admin/mensagens/ativacoes/${a.id}/simular`, {
        method: "POST",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Falha");
      toast.info(
        `Hoje esta regra encontraria ${d.candidatos} cliente(s) na condição e mandaria ${d.enviados} mensagem(ns).` +
          (d.emCooldown > 0 ? ` ${d.emCooldown} está(ão) em cooldown.` : ""),
        { duration: 8000 },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao simular");
    } finally {
      setAgindo(null);
    }
  }

  async function excluir(a: Ativacao) {
    if (!window.confirm(`Excluir “${a.nome}”? O histórico de mensagens dela some junto.`)) return;
    setAgindo(a.id);
    try {
      const res = await fetch(`/api/admin/mensagens/ativacoes/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Falha");
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setAgindo(null);
    }
  }

  async function criar(m: ModeloAtivacao, titulo: string, mensagem: string, cooldownDias: number) {
    try {
      const res = await fetch("/api/admin/mensagens/ativacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: m.nome,
          gatilho: m.gatilho,
          params: m.params,
          titulo,
          mensagem,
          ctaLabel: m.ctaLabel,
          cooldownDias,
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Falha");
      toast.success("Ativação criada — e nasce DESLIGADA. Ligue quando quiser que ela comece.");
      setCriando(null);
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar");
    }
  }

  const ligadas = ativacoes.filter((a) => a.ativa).length;

  return (
    <div className="space-y-4 pt-4">
      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        Ativações mandam a mensagem <strong>sozinhas</strong>, quando o cliente entra na condição
        que você escolher. Elas leem os mesmos alertas de usina que aparecem na tela do time — não
        existe uma segunda definição de &ldquo;usina parada&rdquo; aqui.
        {ligadas === 0 && (
          <>
            {" "}
            <strong>Nenhuma está ligada no momento</strong>, então nada dispara.
          </>
        )}
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        ativacoes.map((a) => (
          <Card key={a.id} className={cn(a.ativa && "border-emerald-500")}>
            <CardContent className="flex flex-wrap items-start gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.nome}</span>
                  <Badge
                    className={cn(
                      "text-[10px]",
                      a.ativa
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                    )}
                  >
                    {a.ativa ? "LIGADA" : "DESLIGADA"}
                  </Badge>
                  {a.canal === "SO_PORTAL" && (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      só portal
                    </Badge>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Bell className="h-3 w-3" /> {a.gatilhoResumo}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> repete no máximo a cada {a.cooldownDias} dias
                  </span>
                  <span>{a.totalDisparos} mensagem(ns) enviada(s)</span>
                  {a.ativadaEm && a.ativa && (
                    <span>ligada em {formatInstantBR(new Date(a.ativadaEm))}</span>
                  )}
                </div>

                <div className="mt-1.5 text-xs">
                  <span className="font-medium">{a.titulo}</span>
                  <span className="text-muted-foreground"> — {a.mensagem}</span>
                </div>
                {a.ctaLabel && (
                  <Badge variant="secondary" className="mt-1.5 text-[10px] font-normal">
                    Botão: {a.ctaLabel}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={agindo === a.id}
                  onClick={() => simular(a)}
                  className="gap-1.5"
                >
                  <FlaskConical className="h-3.5 w-3.5" /> Simular
                </Button>
                <Button
                  size="sm"
                  variant={a.ativa ? "outline" : "default"}
                  disabled={agindo === a.id}
                  onClick={() => ligar(a)}
                  className="gap-1.5"
                >
                  {agindo === a.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : a.ativa ? (
                    <ZapOff className="h-3.5 w-3.5" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  {a.ativa ? "Desligar" : "Ligar"}
                </Button>
                {!a.ativa && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={agindo === a.id}
                    onClick={() => excluir(a)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <div className="pt-2">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Adicionar ativação — modelos prontos
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODELOS_ATIVACAO.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setCriando(m)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
                criando?.id === m.id && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{m.nome}</span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{m.porQue}</div>
            </button>
          ))}
        </div>
      </div>

      {criando && (
        <FormularioAtivacao
          modelo={criando}
          onCancelar={() => setCriando(null)}
          onCriar={criar}
        />
      )}
    </div>
  );
}

/**
 * Confirmação de criação com o texto aberto para edição.
 *
 * Não é um "salvar direto": a mensagem de uma ativação será lida por clientes
 * durante meses sem ninguém reler, então ela merece uma passada consciente na
 * hora de criar.
 */
function FormularioAtivacao({
  modelo,
  onCancelar,
  onCriar,
}: {
  modelo: ModeloAtivacao;
  onCancelar: () => void;
  onCriar: (m: ModeloAtivacao, titulo: string, mensagem: string, cooldown: number) => void;
}) {
  const [titulo, setTitulo] = useState(modelo.titulo);
  const [mensagem, setMensagem] = useState(modelo.mensagem);
  const [cooldown, setCooldown] = useState(modelo.cooldownDias);

  const def = DESCRICAO_GATILHO[modelo.gatilho];

  return (
    <Card className="border-emerald-500">
      <CardContent className="space-y-3 py-4">
        <div className="text-sm font-semibold">{modelo.nome}</div>
        <div className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
          <strong>Quando dispara:</strong> {def?.descricao}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Título</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} />
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
            rows={3}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            Não repetir para o mesmo cliente por (dias){" "}
            <span className="text-muted-foreground">— a trava contra virar perseguição</span>
          </Label>
          <Input
            type="number"
            value={cooldown}
            min={1}
            max={365}
            onChange={(e) => setCooldown(Number(e.target.value) || 1)}
            className="max-w-32"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={() => onCriar(modelo, titulo, mensagem, cooldown)}>
            Criar (desligada)
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Nada dispara até você ligar a ativação.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
