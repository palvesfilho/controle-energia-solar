"use client";

/**
 * Tela inicial do módulo MENSAGENS: as campanhas e, principalmente, quem
 * respondeu a elas.
 *
 * As duas abas existem porque o trabalho é em dois tempos: escrever/disparar
 * (Campanhas) e ligar para quem levantou a mão (Interessados). Campanha que
 * gera lead e não vira ligação não gerou venda nenhuma — por isso a contagem de
 * interessados aparece já na lista, e não escondida no relatório de cada uma.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  MessageSquareHeart,
  Plus,
  Send,
  Users,
  Smartphone,
  Loader2,
  Phone,
  HandHeart,
  AlertTriangle,
  CheckCheck,
  Undo2,
} from "lucide-react";
import { formatInstantBR } from "@/lib/date-only";
import { AtivacoesPainel } from "@/components/mensagens/ativacoes-painel";

interface CampanhaLinha {
  id: string;
  nome: string;
  titulo: string;
  mensagem: string;
  canal: string;
  status: string;
  publicoResumo: string | null;
  totalPublico: number;
  totalComApp: number;
  totalAparelhos: number;
  destinatarios: number;
  interessados: number;
  criadoPorNome: string | null;
  enviadaEm: string | null;
  createdAt: string;
}

interface Interessado {
  id: string;
  interesseEm: string;
  atendidoEm: string | null;
  atendidoPorNome: string | null;
  campanhaId: string;
  campanhaNome: string;
  oferta: string;
  proprietarioId: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
}

const CORES_STATUS: Record<string, string> = {
  RASCUNHO: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ENVIANDO: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  ENVIADA: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  FALHOU: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

/** Link de WhatsApp a partir do telefone cadastrado. */
function linkWhatsapp(telefone: string | null): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return `https://wa.me/55${digitos}`;
}

export function MensagensPainel() {
  const [campanhas, setCampanhas] = useState<CampanhaLinha[]>([]);
  const [interessados, setInteressados] = useState<Interessado[]>([]);
  const [pushConfigurado, setPushConfigurado] = useState(true);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [rc, ri] = await Promise.all([
        fetch("/api/admin/mensagens/campanhas"),
        fetch("/api/admin/mensagens/interessados"),
      ]);
      if (rc.ok) {
        const d = await rc.json();
        setCampanhas(d.campanhas);
        setPushConfigurado(d.pushConfigurado);
      }
      if (ri.ok) setInteressados((await ri.json()).interessados);
    } catch {
      toast.error("Não foi possível carregar as campanhas");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Baixa (ou reabre) o lead. É o que faz o sino do header parar de tocar. */
  async function atender(id: string, atendido: boolean) {
    try {
      const res = await fetch(`/api/admin/mensagens/interessados/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: atendido ? "ATENDER" : "REABRIR" }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Falha");
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar o lead");
    }
  }

  const enviadas = campanhas.filter((c) => c.status === "ENVIADA");
  const alcanceTotal = enviadas.reduce((s, c) => s + c.destinatarios, 0);
  const leadsTotal = campanhas.reduce((s, c) => s + c.interessados, 0);
  // A fila é o que ainda NÃO foi atendido — é esse número que exige ação hoje.
  const aguardando = interessados.filter((i) => !i.atendidoEm);
  const jaAtendidos = interessados.filter((i) => i.atendidoEm);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquareHeart className="h-6 w-6" /> Mensagens
          </h1>
          <p className="text-sm text-muted-foreground">
            Duas formas de falar com a base: <strong>campanhas</strong>, que você escreve e
            dispara, e <strong>ativações</strong>, que disparam sozinhas quando algo acontece na
            usina do cliente.
          </p>
        </div>
        <Link href="/admin/brasil-solar/mensagens/nova">
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova campanha
          </Button>
        </Link>
      </div>

      {!pushConfigurado && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            As chaves VAPID não estão configuradas neste ambiente:{" "}
            <strong>nenhuma notificação chega ao celular</strong>. As campanhas ainda aparecem na
            caixa de avisos do portal. Defina <code>VAPID_PUBLIC_KEY</code> e{" "}
            <code>VAPID_PRIVATE_KEY</code>.
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Send className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold leading-none">{enviadas.length}</div>
              <div className="text-[11px] text-muted-foreground">campanhas enviadas</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold leading-none">{alcanceTotal}</div>
              <div className="text-[11px] text-muted-foreground">entregas na base</div>
            </div>
          </CardContent>
        </Card>
        {/* Mostra a FILA, não o histórico: o número que exige ação hoje é quem
            ainda não recebeu ligação. O total de interessados de todos os
            tempos só cresce e nunca pede nada de ninguém. */}
        <Card className={cn(aguardando.length > 0 && "border-emerald-500")}>
          <CardContent className="flex items-center gap-3 py-4">
            <HandHeart className="h-5 w-5 text-emerald-600" />
            <div>
              <div className="text-2xl font-bold leading-none">{aguardando.length}</div>
              <div className="text-[11px] text-muted-foreground">
                aguardando contato
                {leadsTotal > 0 && ` · ${leadsTotal} no total`}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="campanhas">
        {/* As duas divisões e a fila que as duas alimentam. Campanha e ativação
            são separadas porque são naturezas diferentes — uma é decisão de um
            dia, a outra é promessa permanente — mas o lead que sai delas é o
            mesmo trabalho, e por isso Interessados é uma aba só. */}
        <TabsList>
          <TabsTrigger value="campanhas">Campanhas ({campanhas.length})</TabsTrigger>
          <TabsTrigger value="ativacoes">Ativações</TabsTrigger>
          <TabsTrigger value="interessados">Interessados ({aguardando.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="space-y-2 pt-4">
          {carregando ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : campanhas.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma campanha ainda. Comece por um modelo pronto em{" "}
                <strong>Nova campanha</strong>.
              </CardContent>
            </Card>
          ) : (
            campanhas.map((c) => (
              <Link key={c.id} href={`/admin/brasil-solar/mensagens/${c.id}`}>
                <Card className="transition-colors hover:border-emerald-500">
                  <CardContent className="flex flex-wrap items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{c.nome}</span>
                        <Badge className={cn("text-[10px]", CORES_STATUS[c.status])}>
                          {c.status}
                        </Badge>
                        {c.canal === "SO_PORTAL" && (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            só portal
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.titulo} — {c.mensagem}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {c.publicoResumo}
                        {c.enviadaEm && ` · enviada em ${formatInstantBR(new Date(c.enviadaEm))}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <div className="font-semibold">{c.destinatarios}</div>
                        <div className="text-[10px] text-muted-foreground">entregas</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1 font-semibold">
                          <Smartphone className="h-3 w-3" />
                          {c.totalAparelhos}
                        </div>
                        <div className="text-[10px] text-muted-foreground">aparelhos</div>
                      </div>
                      <div className="text-center">
                        <div
                          className={cn(
                            "font-semibold",
                            c.interessados > 0 && "text-emerald-600",
                          )}
                        >
                          {c.interessados}
                        </div>
                        <div className="text-[10px] text-muted-foreground">interessados</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </TabsContent>

        <TabsContent value="ativacoes">
          <AtivacoesPainel />
        </TabsContent>

        <TabsContent value="interessados" className="space-y-2 pt-4">
          {interessados.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Ninguém tocou no botão de interesse ainda. Campanhas com um botão claro
                (&ldquo;Quero agendar&rdquo;) são as que geram lead.
              </CardContent>
            </Card>
          ) : (
            <>
              {aguardando.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Fila zerada — todo mundo que levantou a mão já foi atendido.
                  </CardContent>
                </Card>
              )}

              {aguardando.map((i) => (
                <LinhaInteressado key={i.id} i={i} onAtender={atender} />
              ))}

              {jaAtendidos.length > 0 && (
                <>
                  <div className="pt-4 text-xs font-medium text-muted-foreground">
                    Já atendidos ({jaAtendidos.length})
                  </div>
                  {jaAtendidos.map((i) => (
                    <LinhaInteressado key={i.id} i={i} onAtender={atender} />
                  ))}
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Uma linha da fila de leads. O botão muda de papel conforme o estado: baixa o
 * lead quando está pendente, devolve para a fila quando alguém baixou por
 * engano — reabrir é o desfazer de uma ação que apaga o cliente do sino.
 */
function LinhaInteressado({
  i,
  onAtender,
}: {
  i: Interessado;
  onAtender: (id: string, atendido: boolean) => void;
}) {
  const wa = linkWhatsapp(i.telefone);
  const atendido = !!i.atendidoEm;

  return (
    <Card className={cn(atendido && "opacity-60")}>
      <CardContent className="flex flex-wrap items-center gap-4 py-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/brasil-solar/proprietarios/${i.proprietarioId}`}
            className="font-medium hover:underline"
          >
            {i.nome}
          </Link>
          <div className="text-xs text-muted-foreground">
            {[i.cidade, i.uf].filter(Boolean).join(" · ")}
            {i.telefone && ` · ${i.telefone}`}
          </div>
          <div className="mt-0.5 text-[11px]">
            <Badge variant="secondary" className="font-normal">
              {i.oferta}
            </Badge>{" "}
            <span className="text-muted-foreground">
              {i.campanhaNome} · {formatInstantBR(new Date(i.interesseEm))}
            </span>
          </div>
          {atendido && (
            <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
              Atendido por {i.atendidoPorNome ?? "alguém"} em{" "}
              {formatInstantBR(new Date(i.atendidoEm!))}
            </div>
          )}
        </div>

        {wa && !atendido && (
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Phone className="h-3.5 w-3.5" /> WhatsApp
            </Button>
          </a>
        )}

        <Button
          size="sm"
          variant={atendido ? "ghost" : "default"}
          className="gap-1.5"
          onClick={() => onAtender(i.id, !atendido)}
        >
          {atendido ? (
            <>
              <Undo2 className="h-3.5 w-3.5" /> Reabrir
            </>
          ) : (
            <>
              <CheckCheck className="h-3.5 w-3.5" /> Marcar como atendido
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
