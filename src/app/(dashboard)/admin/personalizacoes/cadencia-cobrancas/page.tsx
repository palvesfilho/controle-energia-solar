"use client";

/**
 * Cadência de cobranças — quando falar com quem tem fatura em aberto.
 *
 * A tela existe porque isto não é parâmetro técnico: é decisão de relação com o
 * cliente. Por isso ela mostra, em português e o tempo todo, a frase do que vai
 * acontecer — não só os números nos campos.
 *
 * ⚠️ Nasce desligada. Ligar aqui faz o celular de todo cliente com fatura
 * aberta tocar no dia seguinte.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Save, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface Cadencia {
  ativos: boolean;
  antesDias: number[];
  atrasoDias: number[];
  canais: { email: boolean; whatsapp: boolean };
  descricao: string;
  modoNotificacao: "off" | "simulacao" | "real";
}

export default function CadenciaCobrancasPage() {
  const [dados, setDados] = useState<Cadencia | null>(null);
  const [antes, setAntes] = useState("");
  const [atraso, setAtraso] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/cadencia-cobranca");
      if (!r.ok) throw new Error("Falha ao carregar a cadência");
      const j = (await r.json()) as Cadencia;
      setDados(j);
      setAntes(j.antesDias.join(", "));
      setAtraso(j.atrasoDias.join(", "));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = async () => {
    if (!dados) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/cadencia-cobranca", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativos: dados.ativos,
          antesDias: antes,
          atrasoDias: atraso,
          canais: dados.canais,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "Não foi possível salvar");
        return;
      }
      toast.success("Cadência salva");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  };

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
          <h1 className="text-2xl font-bold">Cadência de cobranças</h1>
          <p className="text-sm text-muted-foreground">
            Quando lembrar o cliente de uma fatura que vence ou já venceu.
          </p>
        </div>
      </div>

      {carregando && !dados ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : !dados ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Não foi possível carregar a configuração.
        </p>
      ) : (
        <>
          {/* O que vai acontecer, em uma frase. Vem do servidor para a tela e o
              log dizerem exatamente a mesma coisa. */}
          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{dados.descricao}</p>
                {dados.ativos && dados.modoNotificacao !== "real" && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    O disparo geral está em <strong>{dados.modoNotificacao}</strong> — mesmo
                    com a cadência ligada, nada será enviado ao cliente enquanto isso não
                    mudar.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-5 p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={dados.ativos}
                  onChange={(e) => setDados({ ...dados, ativos: e.target.checked })}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="text-sm font-medium">Enviar lembretes automaticamente</span>
                  <span className="block text-xs text-muted-foreground">
                    Uma vez por dia, às 9h. Nunca envia para fatura paga ou cancelada.
                  </span>
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Dias ANTES do vencimento
                  </label>
                  <input
                    type="text"
                    value={antes}
                    onChange={(e) => setAntes(e.target.value)}
                    placeholder="3"
                    className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separe por vírgula. Ex.: <code>5, 1</code> avisa cinco dias antes e na
                    véspera. Vazio = não avisa antes.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Dias DEPOIS do vencimento
                  </label>
                  <input
                    type="text"
                    value={atraso}
                    onChange={(e) => setAtraso(e.target.value)}
                    placeholder="1, 5, 10"
                    className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ex.: <code>1, 5, 10</code> cobra no dia seguinte, no quinto e no décimo
                    dia de atraso. Vazio = não cobra atraso.
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Canais
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={dados.canais.email}
                      onChange={(e) =>
                        setDados({ ...dados, canais: { ...dados.canais, email: e.target.checked } })
                      }
                      className="h-4 w-4"
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={dados.canais.whatsapp}
                      onChange={(e) =>
                        setDados({
                          ...dados,
                          canais: { ...dados.canais, whatsapp: e.target.checked },
                        })
                      }
                      className="h-4 w-4"
                    />
                    WhatsApp
                  </label>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quem não tem o canal cadastrado simplesmente não recebe por ele — o
                  lembrete não falha por isso.
                </p>
              </div>

              <div className="flex items-center gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => void salvar()}
                  disabled={salvando}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {salvando ? "Salvando..." : "Salvar cadência"}
                </button>
                <span className="text-xs text-muted-foreground">
                  Muda só os avisos futuros — o que já saiu não é reenviado.
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
