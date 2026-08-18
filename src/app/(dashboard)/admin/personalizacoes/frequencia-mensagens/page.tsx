"use client";

/**
 * Personalizações › Frequência de mensagens.
 *
 * Três números que respondem uma pergunta de negócio, não de sistema: com que
 * insistência a empresa pode falar com a mesma pessoa. A tela mostra o efeito
 * em uma frase ("no máximo 2 mensagens a cada 30 dias, nunca duas em menos de
 * 7") porque três campos isolados não deixam ninguém enxergar o ritmo que está
 * configurando.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, RotateCcw, Gauge, ArrowLeft, TriangleAlert } from "lucide-react";

interface Dados {
  maxPorPeriodo: number;
  periodoDias: number;
  intervaloMinimoDias: number;
  defaults: { maxPorPeriodo: number; periodoDias: number; intervaloMinimoDias: number };
  situacao: { clientesAtivos: number; receberamNoPeriodo: number; noLimite: number };
}

export default function FrequenciaMensagensPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [max, setMax] = useState("2");
  const [periodo, setPeriodo] = useState("30");
  const [intervalo, setIntervalo] = useState("7");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/admin/personalizacoes/frequencia-mensagens");
      if (!res.ok) throw new Error();
      const d = (await res.json()) as Dados;
      setDados(d);
      setMax(String(d.maxPorPeriodo));
      setPeriodo(String(d.periodoDias));
      setIntervalo(String(d.intervaloMinimoDias));
    } catch {
      toast.error("Não foi possível carregar a configuração");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/personalizacoes/frequencia-mensagens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxPorPeriodo: Number(max),
          periodoDias: Number(periodo),
          intervaloMinimoDias: Number(intervalo),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Falha ao salvar");
      toast.success("Trava de frequência atualizada.");
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  function restaurar() {
    if (!dados) return;
    setMax(String(dados.defaults.maxPorPeriodo));
    setPeriodo(String(dados.defaults.periodoDias));
    setIntervalo(String(dados.defaults.intervaloMinimoDias));
  }

  const desligada = Number(max) === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/personalizacoes" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-600 to-indigo-600 text-white">
          <Gauge className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Frequência de mensagens</h1>
          <p className="text-sm text-muted-foreground">
            Com que insistência podemos falar com o mesmo cliente.
          </p>
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Limites</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Máximo de mensagens</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">0 desliga a trava.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">A cada (dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Intervalo mínimo (dias)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={intervalo}
                    onChange={(e) => setIntervalo(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Entre duas mensagens seguidas.</p>
                </div>
              </div>

              <div
                className={
                  desligada
                    ? "rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"
                    : "rounded-lg border bg-muted/40 p-3 text-sm"
                }
              >
                {desligada ? (
                  <span className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>Trava desligada.</strong> Nada impede disparar várias campanhas para
                      o mesmo cliente no mesmo dia.
                    </span>
                  </span>
                ) : (
                  <>
                    O mesmo cliente recebe no máximo <strong>{max}</strong> mensagem(ns) a cada{" "}
                    <strong>{periodo}</strong> dias, e nunca duas separadas por menos de{" "}
                    <strong>{intervalo}</strong> dia(s).
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={salvar} disabled={salvando} className="gap-1.5">
                  {salvando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar
                </Button>
                <Button variant="outline" onClick={restaurar} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" /> Restaurar padrão
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Como a trava se aplica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Bloqueia campanhas.</strong> Quem estourou o
                limite fica de fora do disparo — e continua no público das próximas. O disparo
                sempre informa quantos ficaram de fora e por quê.
              </p>
              <p>
                <strong className="text-foreground">Não bloqueia ativações.</strong> Segurar
                &ldquo;sua usina parou de comunicar&rdquo; porque o cliente já recebeu duas ofertas
                no mês seria trocar a coisa certa pela errada. Cada ativação tem o próprio
                cooldown.
              </p>
              <p>
                <strong className="text-foreground">Mas conta as ativações.</strong> O barulho que
                o cliente sente é a soma de tudo que chega, então toda mensagem entra na contagem.
              </p>
            </CardContent>
          </Card>

          {dados && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Situação da base agora</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-2xl font-bold">{dados.situacao.clientesAtivos}</div>
                  <div className="text-[11px] text-muted-foreground">clientes ativos</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{dados.situacao.receberamNoPeriodo}</div>
                  <div className="text-[11px] text-muted-foreground">
                    receberam algo nos últimos {dados.periodoDias} dias
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{dados.situacao.noLimite}</div>
                  <div className="text-[11px] text-muted-foreground">
                    já no limite — ficariam de fora de uma campanha hoje
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
