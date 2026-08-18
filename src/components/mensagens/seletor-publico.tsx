"use client";

/**
 * Montagem do público de uma campanha, com prévia ao vivo.
 *
 * A prévia é o coração da tela: enquanto o operador mexe nos filtros, ele vê
 * "37 clientes · 12 com app" mudando. Sem esse número na frente, o recorte é
 * chute e a primeira contagem real aparece só depois de o disparo sair.
 *
 * ⚠️ "Com app" é o que importa para o push. O total maior alcança pela caixa de
 * avisos do portal, que só é vista quando o cliente entra — a tela diz os dois
 * separados de propósito, para ninguém confundir alcance com toque no celular.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, Users, Smartphone } from "lucide-react";
import type { FiltroPublico } from "@/lib/mensagens-publico";

export interface PreviaPublicoUI {
  total: number;
  comApp: number;
  aparelhos: number;
  /** Quantos a trava de frequência barraria se o disparo fosse agora. */
  bloqueadosPorFrequencia: number;
  resumo: string;
  amostra: Array<{ id: string; nome: string; cidade: string | null; uf: string | null; aparelhos: number }>;
}

interface Opcoes {
  ufs: string[];
  cidades: string[];
  inversorMarcas: string[];
  tiposTelhado: string[];
}

const ROTULO_TELHADO: Record<string, string> = {
  TELHADO_METALICO: "Metálico",
  CERAMICO_CONCRETO: "Cerâmico/concreto",
  FIBROCIMENTO: "Fibrocimento",
  CALHETAO_METALICO: "Calhetão metálico",
  CALHETAO_FIBROCIMENTO: "Calhetão fibrocimento",
  LAJE: "Laje",
  ESTRUTURA_SOLO: "Solo",
  ESTRUTURA_ESTACIONAMENTO: "Estacionamento",
  PERSONALIZADA_MISTA: "Mista",
};

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        ativo
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-border bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Liga/desliga um valor dentro de uma lista do filtro. */
function alterna(lista: string[] | undefined, valor: string): string[] | undefined {
  const atual = lista ?? [];
  const nova = atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor];
  return nova.length ? nova : undefined;
}

function numeroOuUndefined(v: string): number | undefined {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || Number.isNaN(n) ? undefined : n;
}

export function SeletorPublico({
  filtro,
  onChange,
  onPrevia,
}: {
  filtro: FiltroPublico;
  onChange: (f: FiltroPublico) => void;
  /** Devolve a prévia para o pai usar na confirmação do disparo. */
  onPrevia?: (p: PreviaPublicoUI | null) => void;
}) {
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [previa, setPrevia] = useState<PreviaPublicoUI | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/mensagens/publico");
        if (res.ok) setOpcoes(await res.json());
      } catch {
        // Sem opções a tela ainda funciona nos filtros numéricos — não vale
        // bloquear a campanha inteira por causa dos seletores.
      }
    })();
  }, []);

  const buscarPrevia = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/admin/mensagens/publico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filtro }),
      });
      const d = res.ok ? ((await res.json()) as PreviaPublicoUI) : null;
      setPrevia(d);
      onPrevia?.(d);
    } catch {
      setPrevia(null);
      onPrevia?.(null);
    } finally {
      setCarregando(false);
    }
  }, [filtro, onPrevia]);

  // Debounce de 400 ms: o filtro muda a cada tecla nos campos numéricos e uma
  // consulta por tecla derruba a contagem em piscadas.
  useEffect(() => {
    const t = setTimeout(() => void buscarPrevia(), 400);
    return () => clearTimeout(t);
  }, [buscarPrevia]);

  const set = (parcial: Partial<FiltroPublico>) => onChange({ ...filtro, ...parcial });

  return (
    <div className="space-y-4">
      <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
              <div>
                <div className="text-2xl font-bold leading-none">
                  {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : (previa?.total ?? 0)}
                </div>
                <div className="text-[11px] text-muted-foreground">clientes no público</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
              <div>
                <div className="text-2xl font-bold leading-none">{previa?.comApp ?? 0}</div>
                <div className="text-[11px] text-muted-foreground">
                  com app — só esses tocam o celular
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground flex-1 min-w-[200px]">
              {previa?.resumo}
            </div>
          </div>

          {/* A trava é invisível até morder. Dizer aqui, antes de escrever a
              campanha, evita a descoberta no relatório de que metade do
              público ficou de fora. */}
          {previa && previa.bloqueadosPorFrequencia > 0 && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <strong>{previa.bloqueadosPorFrequencia}</strong> desse público ficaria de fora pela
              trava de frequência (já recebeu mensagem demais nos últimos dias). O limite está em{" "}
              <a href="/admin/personalizacoes/frequencia-mensagens" className="underline">
                Personalizações › Frequência de mensagens
              </a>
              .
            </div>
          )}

          {previa && previa.amostra.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
              {previa.amostra.map((d) => (
                <Badge key={d.id} variant="secondary" className="font-normal">
                  {d.nome}
                  {d.aparelhos > 0 && <Smartphone className="ml-1 h-3 w-3" />}
                </Badge>
              ))}
              {previa.total > previa.amostra.length && (
                <span className="text-xs text-muted-foreground self-center">
                  +{previa.total - previa.amostra.length} outros
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs">Canal do cliente</Label>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              ativo={!!filtro.somenteComApp}
              onClick={() => set({ somenteComApp: !filtro.somenteComApp || undefined, somenteSemApp: undefined })}
            >
              Só quem tem app
            </Chip>
            <Chip
              ativo={!!filtro.somenteSemApp}
              onClick={() => set({ somenteSemApp: !filtro.somenteSemApp || undefined, somenteComApp: undefined })}
            >
              Só quem NÃO tem app
            </Chip>
            <Chip
              ativo={filtro.acessoPortal === "ATIVO"}
              onClick={() => set({ acessoPortal: filtro.acessoPortal === "ATIVO" ? undefined : "ATIVO" })}
            >
              Portal pago ativo
            </Chip>
            <Chip
              ativo={filtro.acessoPortal === "SEM_ACESSO"}
              onClick={() =>
                set({ acessoPortal: filtro.acessoPortal === "SEM_ACESSO" ? undefined : "SEM_ACESSO" })
              }
            >
              Sem portal pago
            </Chip>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Obra</Label>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              ativo={filtro.executadoPor === "BRASIL_SOLAR"}
              onClick={() =>
                set({ executadoPor: filtro.executadoPor === "BRASIL_SOLAR" ? undefined : "BRASIL_SOLAR" })
              }
            >
              Executada pela Brasil Solar
            </Chip>
            <Chip
              ativo={filtro.executadoPor === "TERCEIRO"}
              onClick={() =>
                set({ executadoPor: filtro.executadoPor === "TERCEIRO" ? undefined : "TERCEIRO" })
              }
            >
              Executada por terceiro
            </Chip>
          </div>
        </div>

        {opcoes && opcoes.ufs.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Estado</Label>
            <div className="flex flex-wrap gap-1.5">
              {opcoes.ufs.map((uf) => (
                <Chip key={uf} ativo={!!filtro.uf?.includes(uf)} onClick={() => set({ uf: alterna(filtro.uf, uf) })}>
                  {uf}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {opcoes && opcoes.inversorMarcas.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Marca do inversor</Label>
            <div className="flex flex-wrap gap-1.5">
              {opcoes.inversorMarcas.map((m) => (
                <Chip
                  key={m}
                  ativo={!!filtro.inversorMarcas?.includes(m)}
                  onClick={() => set({ inversorMarcas: alterna(filtro.inversorMarcas, m) })}
                >
                  {m}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {opcoes && opcoes.tiposTelhado.length > 0 && (
          <div className="space-y-2 md:col-span-2">
            <Label className="text-xs">
              Tipo de telhado <span className="text-muted-foreground">— define o preço da limpeza</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {opcoes.tiposTelhado.map((t) => (
                <Chip
                  key={t}
                  ativo={!!filtro.tiposTelhado?.includes(t)}
                  onClick={() => set({ tiposTelhado: alterna(filtro.tiposTelhado, t) })}
                >
                  {ROTULO_TELHADO[t] ?? t}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Potência da usina (kWp)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="mín."
              value={filtro.potenciaMin ?? ""}
              onChange={(e) => set({ potenciaMin: numeroOuUndefined(e.target.value) })}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              placeholder="máx."
              value={filtro.potenciaMax ?? ""}
              onChange={(e) => set({ potenciaMax: numeroOuUndefined(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            Sem leitura há (dias) <span className="text-muted-foreground">— reconexão de wi-fi</span>
          </Label>
          <Input
            type="number"
            placeholder="ex.: 5"
            value={filtro.semLeituraDias ?? ""}
            onChange={(e) => set({ semLeituraDias: numeroOuUndefined(e.target.value) })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            Instalada há pelo menos (meses){" "}
            <span className="text-muted-foreground">— limpeza/manutenção</span>
          </Label>
          <Input
            type="number"
            placeholder="ex.: 6"
            value={filtro.idadeMesesMin ?? ""}
            onChange={(e) => set({ idadeMesesMin: numeroOuUndefined(e.target.value) })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            Garantia vence em (dias) <span className="text-muted-foreground">— extensão/seguro</span>
          </Label>
          <Input
            type="number"
            placeholder="ex.: 90"
            value={filtro.garantiaVenceEmDias ?? ""}
            onChange={(e) => set({ garantiaVenceEmDias: numeroOuUndefined(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
