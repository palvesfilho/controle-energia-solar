"use client";

/**
 * Painel de sugestão de percentuais do rateio, pedido em 22/08/2026.
 *
 * Enquanto o modo está em "auto", cada UC que entra ou sai recalcula os
 * percentuais na tela — é o que o pedido descreve: "na hora que eu cadastro
 * outra unidade, você vai atualizar os percentuais sugeridos". Os dois botões
 * fecham o ciclo: **Aceitar** congela o que está sugerido, **Editar** devolve
 * os campos para a mão do usuário sem apagar o ponto de partida.
 *
 * ⚠️ Digitar em qualquer campo também sai do "auto". Se não saísse, a próxima
 * UC adicionada apagaria o número digitado sem avisar.
 *
 * A conta em si mora em `@/lib/rateio-sugestao` — aqui é só a leitura na tela.
 */
import { Info, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SugestaoRateio } from "@/lib/rateio-sugestao";

export type ModoSugestao = "auto" | "manual";

function kwh(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh/mês`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

export function SugestaoPercentuais({
  sugestao,
  modo,
  totalUcs,
  onAceitar,
  onEditar,
}: {
  sugestao: SugestaoRateio;
  modo: ModoSugestao;
  /** UCs no rateio, contando geradora e as sem consumo — só para o texto. */
  totalUcs: number;
  onAceitar: () => void;
  onEditar: () => void;
}) {
  if (totalUcs === 0) return null;

  const contabilizadas = sugestao.linhas.filter((l) => l.contabilizada).length;

  // Sem nenhuma UC com consumo médio não há o que sugerir. Nada de estimar um
  // consumo "típico": o número é realidade do cliente, não nossa.
  if (sugestao.indisponivel) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Nenhuma UC deste rateio tem <b>consumo médio</b> no cadastro — sem ele
          não dá para sugerir percentuais. Preencha o consumo médio na UC ou
          informe os percentuais na mão.
        </span>
      </div>
    );
  }

  const o = sugestao.ocupacao;
  const leitura =
    o === null
      ? "A usina está sem geração média mensal no cadastro: dá para sugerir a divisão pelo consumo, mas não dá para dizer quanto cabe."
      : o > 1.02
        ? `O consumo somado passa da geração em ${kwh(sugestao.consumoTotal - sugestao.geracaoMediaMensal!)} — as UCs não vão compensar tudo.`
        : o < 0.85
          ? `Sobram ${kwh(sugestao.geracaoMediaMensal! - sugestao.consumoTotal)} de geração sem consumo para absorver.`
          : "O consumo somado ocupa bem a geração da usina.";

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            Sugestão de percentuais
            {modo === "auto" && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                aplicada
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Divide os 100% na proporção do <b>consumo médio</b> das{" "}
            {contabilizadas} UC{contabilizadas === 1 ? "" : "s"} — valores de
            contrato, do cadastro.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={onAceitar}>
            {modo === "auto" ? "Aceitar sugestão" : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Aplicar sugestão
              </>
            )}
          </Button>
          {modo === "auto" && (
            <Button type="button" size="sm" variant="outline" onClick={onEditar}>
              Editar percentuais
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span>
          <span className="text-muted-foreground">Geração de contrato: </span>
          <b>
            {sugestao.geracaoMediaMensal !== null
              ? kwh(sugestao.geracaoMediaMensal)
              : "não cadastrada"}
          </b>
        </span>
        <span>
          <span className="text-muted-foreground">Consumo somado: </span>
          <b>{kwh(sugestao.consumoTotal)}</b>
          {o !== null && (
            <span className={o > 1.02 ? "text-red-600" : "text-muted-foreground"}>
              {" "}
              ({pct(o)} da geração)
            </span>
          )}
        </span>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {leitura}
      </p>

      {/* Falha calada seria deixar a UC sem consumo em 0% sem dizer nada. */}
      {sugestao.semConsumo.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {sugestao.semConsumo.length} UC
          {sugestao.semConsumo.length === 1 ? " ficou" : "s ficaram"} em 0% por
          não ter consumo médio no cadastro — informe o percentual na mão ou
          tire do rateio.
        </p>
      )}
    </div>
  );
}
