"use client";

/**
 * Relatório de uma campanha — e o botão de disparo, quando ainda é rascunho.
 *
 * As três colunas contam histórias diferentes e não devem ser somadas:
 *   entregas  = clientes que têm o aviso na caixa do portal (o alcance real);
 *   aparelhos = celulares que o serviço de push ACEITOU (não é "visto");
 *   abriram   = tocaram na notificação ou abriram o aviso no portal;
 *   interesse = tocaram no botão da oferta. É o único que vira venda.
 *
 * ⚠️ Web Push não confirma leitura. Não existe "entregue no celular" aqui, e a
 * tela não promete isso em lugar nenhum.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Loader2,
  Send,
  Trash2,
  Users,
  Smartphone,
  Eye,
  HandHeart,
  Phone,
  CheckCheck,
} from "lucide-react";
import { formatInstantBR } from "@/lib/date-only";

interface Envio {
  id: string;
  proprietarioId: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  aparelhos: number;
  pushStatus: string;
  erro: string | null;
  lidoEm: string | null;
  interesseEm: string | null;
  dispensadoEm: string | null;
  atendidoEm: string | null;
  atendidoPorNome: string | null;
}

interface Campanha {
  id: string;
  nome: string;
  titulo: string;
  mensagem: string;
  ctaLabel: string | null;
  canal: string;
  status: string;
  publicoResumo: string | null;
  totalPublico: number;
  totalComApp: number;
  totalAparelhos: number;
  criadoPorNome: string | null;
  enviadaEm: string | null;
  createdAt: string;
  envios: Envio[];
}

function linkWhatsapp(telefone: string | null): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, "");
  return digitos.length < 10 ? null : `https://wa.me/55${digitos}`;
}

export function CampanhaDetalhe({ campanhaId }: { campanhaId: string }) {
  const router = useRouter();
  const [c, setC] = useState<Campanha | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/admin/mensagens/campanhas/${campanhaId}`);
      if (!res.ok) throw new Error();
      setC(await res.json());
    } catch {
      toast.error("Não foi possível carregar a campanha");
    } finally {
      setCarregando(false);
    }
  }, [campanhaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function disparar() {
    if (!c) return;
    const confirmado = window.confirm(
      `Enviar a campanha “${c.nome}” agora?\n\n` +
        `Público: ${c.publicoResumo}\n\n` +
        `“${c.titulo}”\n${c.mensagem}\n\nNão é possível desfazer.`,
    );
    if (!confirmado) return;

    setAgindo(true);
    try {
      const res = await fetch(`/api/admin/mensagens/campanhas/${campanhaId}/enviar`, {
        method: "POST",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Falha ao disparar");
      toast.success(
        `Enviada: ${d.publico} cliente(s) na caixa de avisos, ${d.aparelhosEnviados} aparelho(s) aceitos.`,
      );
      if (d.bloqueadosPorFrequencia > 0) {
        toast.warning(
          `${d.bloqueadosPorFrequencia} ficaram de fora pela trava de frequência — ${d.motivosFrequencia?.[0] ?? "limite atingido"}.`,
          { duration: 9000 },
        );
      }
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao disparar");
      void carregar();
    } finally {
      setAgindo(false);
    }
  }

  /** Baixa o lead sem sair da campanha — o pós-venda ligou daqui mesmo. */
  async function atender(envioId: string) {
    try {
      const res = await fetch(`/api/admin/mensagens/interessados/${envioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "ATENDER" }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Falha");
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar o lead");
    }
  }

  async function excluir() {
    if (!window.confirm("Excluir este rascunho?")) return;
    setAgindo(true);
    try {
      const res = await fetch(`/api/admin/mensagens/campanhas/${campanhaId}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Falha ao excluir");
      router.push("/admin/brasil-solar/mensagens");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setAgindo(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (!c) return <div className="py-10 text-sm text-muted-foreground">Campanha não encontrada.</div>;

  const abriram = c.envios.filter((e) => e.lidoEm).length;
  const interessados = c.envios.filter((e) => e.interesseEm);
  const rascunho = c.status === "RASCUNHO";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/brasil-solar/mensagens"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{c.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {c.publicoResumo}
              {c.enviadaEm && ` · enviada em ${formatInstantBR(new Date(c.enviadaEm))}`}
              {c.criadoPorNome && ` · por ${c.criadoPorNome}`}
            </p>
          </div>
        </div>
        {rascunho && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={excluir} disabled={agindo} className="gap-1.5">
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
            <Button onClick={disparar} disabled={agindo} className="gap-1.5">
              {agindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar agora
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="text-sm font-semibold">{c.titulo}</div>
          <div className="text-sm text-muted-foreground">{c.mensagem}</div>
          {c.ctaLabel && (
            <Badge className="mt-2" variant="secondary">
              Botão: {c.ctaLabel}
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { icone: Users, valor: c.envios.length, rotulo: "entregas na caixa de avisos" },
          { icone: Smartphone, valor: c.totalAparelhos, rotulo: "aparelhos aceitos pelo push" },
          { icone: Eye, valor: abriram, rotulo: "abriram o aviso" },
          { icone: HandHeart, valor: interessados.length, rotulo: "tocaram no botão" },
        ].map((k, i) => (
          <Card key={i} className={cn(i === 3 && interessados.length > 0 && "border-emerald-500")}>
            <CardContent className="flex items-center gap-3 py-4">
              <k.icone
                className={cn("h-5 w-5 text-muted-foreground", i === 3 && "text-emerald-600")}
              />
              <div>
                <div className="text-2xl font-bold leading-none">{k.valor}</div>
                <div className="text-[11px] text-muted-foreground">{k.rotulo}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {interessados.length > 0 && (
        <Card className="border-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <HandHeart className="h-4 w-4 text-emerald-600" /> Interessados — ligue para eles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {interessados.map((e) => {
              const wa = linkWhatsapp(e.telefone);
              return (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <Link
                    href={`/admin/brasil-solar/proprietarios/${e.proprietarioId}`}
                    className="font-medium hover:underline"
                  >
                    {e.nome}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {[e.cidade, e.uf].filter(Boolean).join(" · ")}
                    {e.telefone && ` · ${e.telefone}`}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {e.interesseEm && formatInstantBR(new Date(e.interesseEm))}
                  </span>
                  {wa && !e.atendidoEm && (
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> WhatsApp
                      </Button>
                    </a>
                  )}
                  {e.atendidoEm ? (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      atendido por {e.atendidoPorNome ?? "alguém"}
                    </span>
                  ) : (
                    <Button size="sm" className="gap-1.5" onClick={() => atender(e.id)}>
                      <CheckCheck className="h-3.5 w-3.5" /> Atendido
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {c.envios.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Quem recebeu ({c.envios.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {c.envios.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-2 border-b px-1 py-1.5 text-xs last:border-0"
              >
                <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                {e.aparelhos > 0 ? (
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Smartphone className="h-3 w-3" />
                    {e.aparelhos}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">só portal</span>
                )}
                {e.pushStatus === "FALHA" && (
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                    falha
                  </Badge>
                )}
                {e.lidoEm && <span className="text-muted-foreground">abriu</span>}
                {e.interesseEm && <Badge className="bg-emerald-600">interessado</Badge>}
                {e.dispensadoEm && <span className="text-muted-foreground">dispensou</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
