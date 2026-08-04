"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PencilLine, Plus, Trash2, X, Info, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/formatters";

export type TipoPeriodo = "MENSAL" | "PERSONALIZADO";

export interface LancamentoManualDTO {
  id: string;
  tipoPeriodo: TipoPeriodo;
  /** Início da janela (inclusive), ISO. */
  dataInicio: string;
  /** Fim da janela (EXCLUSIVO), ISO. */
  dataFim: string;
  ano: number;
  mes: number;
  kwhTotal: number;
  kwhRateado: number;
  diasRateados: number;
  fonte: string | null;
  observacao: string | null;
  registradoPor: string;
  updatedAt: string;
  diasManuaisRestantes: number;
  kwhTotalAtual: number;
  kwhApiAtual: number;
  status: "ATIVO" | "PARCIAL" | "SUPERADO";
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const inputCls =
  "text-sm border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all w-full";

const STATUS_META: Record<
  LancamentoManualDTO["status"],
  { label: string; cls: string; hint: string }
> = {
  ATIVO: {
    label: "Em uso",
    cls: "bg-amber-100 text-amber-800 border-amber-200",
    hint: "Todo o período está sendo contado a partir do valor informado à mão.",
  },
  PARCIAL: {
    label: "Parcial",
    cls: "bg-sky-100 text-sky-800 border-sky-200",
    hint: "O sync já trouxe parte dos dias medidos e substituiu o rateio nesses dias.",
  },
  SUPERADO: {
    label: "Superado",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
    hint: "A plataforma passou a enviar o período inteiro; o lançamento manual não conta mais.",
  },
};

/** dd/mm/aaaa de uma data ISO, sempre em UTC (dia de calendário). */
function fmtDia(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Valor pro `<input type="date">` (aaaa-mm-dd) a partir de ISO. */
function isoParaInput(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export function rotuloPeriodoDTO(l: {
  tipoPeriodo: TipoPeriodo;
  dataInicio: string;
  dataFim: string;
  ano: number;
  mes: number;
}) {
  if (l.tipoPeriodo === "MENSAL") return `${MESES[l.mes - 1]}/${l.ano}`;
  return `${fmtDia(l.dataInicio)} a ${fmtDia(l.dataFim)}`;
}

/**
 * Lançamento manual de geração por período — paliativo enquanto a plataforma de
 * monitoramento da usina não integra.
 *
 * O card deixa explícito o que é estimativa e o que já foi substituído por dado
 * medido; esconder isso faria número digitado passar por leitura de inversor.
 */
export function GeracaoManualCard({
  clientId,
  clientNome,
  onChanged,
  recarregarToken,
}: {
  clientId: string;
  clientNome: string;
  /** Chamado após lançar/excluir — a página recarrega os logs e os gráficos. */
  onChanged?: () => void;
  /** Muda de valor pra forçar releitura (ex.: lançamento feito pelo botão do topo). */
  recarregarToken?: number;
}) {
  const [lancamentos, setLancamentos] = useState<LancamentoManualDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<LancamentoManualDTO | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/brasil-solar/${clientId}/geracao-manual`);
      const d = await r.json();
      setLancamentos(Array.isArray(d.lancamentos) ? d.lancamentos : []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    carregar();
  }, [carregar, recarregarToken]);

  const excluir = async (l: LancamentoManualDTO) => {
    if (
      !confirm(
        `Excluir o lançamento manual de ${rotuloPeriodoDTO(l)}?\n\nA geração informada à mão sai dos relatórios. Dados medidos pela plataforma não são afetados.`,
      )
    ) {
      return;
    }
    const r = await fetch(`/api/brasil-solar/${clientId}/geracao-manual?entryId=${l.id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      toast.error("Erro ao excluir lançamento");
      return;
    }
    toast.success(`Lançamento de ${rotuloPeriodoDTO(l)} excluído`);
    await carregar();
    onChanged?.();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Geração informada manualmente</CardTitle>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Para quando a plataforma de monitoramento não envia dados. Informe o total de kWh do
              período (mês fechado ou ciclo de leitura da fatura) e o sistema distribui pelos dias,
              de modo que relatórios e portal do cliente passem a mostrar geração.
            </p>
          </div>
          <button
            onClick={() => {
              setEditando(null);
              setFormAberto(true);
            }}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="h-4 w-4" />
            Lançar período
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando lançamentos...
          </div>
        ) : lancamentos.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Nenhum período informado à mão para esta usina.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left font-medium py-2 pr-3">Período</th>
                  <th className="text-right font-medium py-2 pr-3">Total informado</th>
                  <th className="text-right font-medium py-2 pr-3">Manual / medido</th>
                  <th className="text-left font-medium py-2 pr-3">Situação</th>
                  <th className="text-left font-medium py-2 pr-3">Fonte</th>
                  <th className="text-left font-medium py-2 pr-3">Lançado por</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((l) => {
                  const meta = STATUS_META[l.status];
                  const divergente = Math.abs(l.kwhTotalAtual - l.kwhTotal) > 1;
                  return (
                    <tr key={l.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {rotuloPeriodoDTO(l)}
                        {l.tipoPeriodo === "PERSONALIZADO" && (
                          <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <CalendarRange className="h-3 w-3" />
                            ciclo personalizado
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {formatNumber(l.kwhTotal)} kWh
                        {divergente && (
                          <div className="text-[11px] text-amber-700">
                            hoje no sistema: {formatNumber(l.kwhTotalAtual)} kWh
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap text-xs">
                        <div>
                          {formatNumber(l.kwhRateado)} kWh em {l.diasRateados} dia(s)
                        </div>
                        {l.kwhApiAtual > 0 && (
                          <div className="text-muted-foreground">
                            medido: {formatNumber(l.kwhApiAtual)} kWh
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          title={meta.hint}
                          className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                        {l.status === "PARCIAL" && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {l.diasManuaisRestantes} de {l.diasRateados} dias ainda manuais
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs max-w-[180px]">
                        {l.fonte || "—"}
                        {l.observacao && (
                          <div className="text-muted-foreground">{l.observacao}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">
                        {l.registradoPor}
                        <div className="text-muted-foreground">
                          {new Date(l.updatedAt).toLocaleDateString("pt-BR")}
                        </div>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setEditando(l);
                            setFormAberto(true);
                          }}
                          title="Corrigir valor"
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => excluir(l)}
                          title="Excluir lançamento"
                          className="p-1.5 hover:bg-muted rounded transition-colors text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {formAberto && (
        <LancamentoManualModal
          clientId={clientId}
          clientNome={clientNome}
          inicial={editando}
          onClose={() => setFormAberto(false)}
          onSaved={async () => {
            setFormAberto(false);
            await carregar();
            onChanged?.();
          }}
        />
      )}
    </Card>
  );
}

/**
 * Formulário de lançamento. Exportado porque o botão "Geração manual" no topo da
 * página da usina abre este mesmo modal, sem obrigar a rolar até o card.
 */
export function LancamentoManualModal({
  clientId,
  clientNome,
  inicial,
  onClose,
  onSaved,
}: {
  clientId: string;
  clientNome: string;
  inicial: LancamentoManualDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const hoje = new Date();
  // Padrão: mês anterior. É o mês que normalmente se fecha à mão — o corrente
  // ainda está correndo.
  const refPadrao = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));

  const [tipo, setTipo] = useState<TipoPeriodo>(inicial?.tipoPeriodo ?? "MENSAL");
  const [ano, setAno] = useState(inicial?.ano ?? refPadrao.getUTCFullYear());
  const [mes, setMes] = useState(inicial?.mes ?? refPadrao.getUTCMonth() + 1);
  const [inicioStr, setInicioStr] = useState(
    inicial?.tipoPeriodo === "PERSONALIZADO" ? isoParaInput(inicial.dataInicio) : "",
  );
  const [fimStr, setFimStr] = useState(
    inicial?.tipoPeriodo === "PERSONALIZADO" ? isoParaInput(inicial.dataFim) : "",
  );
  const [kwh, setKwh] = useState(inicial ? String(inicial.kwhTotal) : "");
  const [fonte, setFonte] = useState(inicial?.fonte ?? "");
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");
  const [salvando, setSalvando] = useState(false);

  const editando = inicial != null;
  const kwhNum = Number(kwh.replace(",", "."));

  // Dias que vão receber rateio. Espelha o cálculo do servidor
  // (src/lib/geracao-manual.ts): janela [início, fim) e nada em dia futuro.
  const previsao = (() => {
    const hojeUtc = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
    let ini: number;
    let fim: number;
    if (tipo === "MENSAL") {
      ini = Date.UTC(ano, mes - 1, 1);
      fim = Date.UTC(ano, mes, 1);
    } else {
      if (!inicioStr || !fimStr) return null;
      const [ai, mi, di] = [
        Number(inicioStr.slice(0, 4)),
        Number(inicioStr.slice(5, 7)),
        Number(inicioStr.slice(8, 10)),
      ];
      const [af, mf, df] = [
        Number(fimStr.slice(0, 4)),
        Number(fimStr.slice(5, 7)),
        Number(fimStr.slice(8, 10)),
      ];
      ini = Date.UTC(ai, mi - 1, di);
      fim = Date.UTC(af, mf - 1, df);
      if (!(fim > ini)) return null;
    }
    const limite = Math.min(fim, hojeUtc + 86400000);
    const dias = Math.max(0, Math.round((limite - ini) / 86400000));
    const diasTotais = Math.round((fim - ini) / 86400000);
    const ultimoCoberto = new Date(limite - 86400000);
    return {
      dias,
      diasTotais,
      emCurso: dias < diasTotais,
      ultimoCoberto: `${String(ultimoCoberto.getUTCDate()).padStart(2, "0")}/${String(ultimoCoberto.getUTCMonth() + 1).padStart(2, "0")}`,
    };
  })();

  const previewDia =
    previsao && previsao.dias > 0 && Number.isFinite(kwhNum) && kwhNum > 0
      ? kwhNum / previsao.dias
      : null;

  const anos = [hoje.getUTCFullYear(), hoje.getUTCFullYear() - 1, hoje.getUTCFullYear() - 2];

  const salvar = async () => {
    if (!Number.isFinite(kwhNum) || kwhNum < 0) {
      toast.error("Informe o total de geração do período em kWh");
      return;
    }
    if (tipo === "PERSONALIZADO" && (!inicioStr || !fimStr)) {
      toast.error("Informe a data inicial e a data final");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/brasil-solar/${clientId}/geracao-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoPeriodo: tipo,
          ...(tipo === "MENSAL"
            ? { ano, mes }
            : { dataInicio: inicioStr, dataFim: fimStr }),
          kwhTotal: kwhNum,
          fonte: fonte.trim() || null,
          observacao: observacao.trim() || null,
          entryId: inicial?.id,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Erro ao lançar geração", { duration: 9000 });
        return;
      }
      toast.success(
        `${formatNumber(d.kwhRateado)} kWh distribuídos em ${d.diasRateados} dia(s)`,
      );
      for (const aviso of (d.avisos ?? []) as string[]) toast.warning(aviso, { duration: 9000 });
      onSaved();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-base">
              {editando ? "Corrigir geração informada" : "Lançar geração manual"}
            </h3>
            <p className="text-xs text-muted-foreground">{clientNome}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-3">
          {/* Tipo de período. Ao corrigir, a janela é fixa: mudar o intervalo
              criaria outro lançamento em vez de editar este. */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Período</label>
            <div className="flex gap-1">
              {(
                [
                  ["MENSAL", "Mensal"],
                  ["PERSONALIZADO", "Personalizado"],
                ] as [TipoPeriodo, string][]
              ).map(([valor, label]) => (
                <button
                  key={valor}
                  type="button"
                  disabled={editando}
                  onClick={() => setTipo(valor)}
                  className={`flex-1 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-60 ${
                    tipo === valor
                      ? "bg-primary text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {tipo === "MENSAL"
                ? "Mês calendário fechado: do dia 1º ao último dia."
                : "Ciclo de leitura da fatura: de um dia do mês até o dia correspondente do mês seguinte."}
            </p>
          </div>

          {tipo === "MENSAL" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mês</label>
                <select
                  value={mes}
                  onChange={(e) => setMes(Number(e.target.value))}
                  disabled={editando}
                  className={`${inputCls} disabled:opacity-60`}
                >
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ano</label>
                <select
                  value={ano}
                  onChange={(e) => setAno(Number(e.target.value))}
                  disabled={editando}
                  className={`${inputCls} disabled:opacity-60`}
                >
                  {anos.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">De</label>
                <input
                  type="date"
                  value={inicioStr}
                  onChange={(e) => setInicioStr(e.target.value)}
                  disabled={editando}
                  className={`${inputCls} disabled:opacity-60`}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Até</label>
                <input
                  type="date"
                  value={fimStr}
                  onChange={(e) => setFimStr(e.target.value)}
                  disabled={editando}
                  className={`${inputCls} disabled:opacity-60`}
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Geração total do período (kWh)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={kwh}
              onChange={(e) => setKwh(e.target.value)}
              placeholder="ex.: 4120"
              className={inputCls}
              autoFocus
            />
            {previsao && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {previewDia != null
                  ? `Vira ${formatNumber(previewDia)} kWh/dia em ${previsao.dias} dia(s)`
                  : `${previsao.dias} dia(s) no período`}
                {tipo === "PERSONALIZADO" &&
                  ` (até ${previsao.ultimoCoberto} — a data final abre o ciclo seguinte, igual à leitura da fatura)`}
                {previsao.emCurso && " · período em curso: só até hoje"}. Dias que a plataforma já
                mediu são preservados e descontados do total.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              De onde veio o número
            </label>
            <input
              type="text"
              value={fonte}
              onChange={(e) => setFonte(e.target.value)}
              placeholder="ex.: print do app do cliente, foto do inversor"
              className={inputCls}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>

          <div className="flex gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              O valor diário é uma média, não medição — aparece marcado como manual nos gráficos.
              Quando a integração da plataforma entrar, o dado medido substitui automaticamente os
              dias que ela trouxer. O status de monitoramento da usina não muda com este
              lançamento.
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editando ? "Salvar correção" : "Lançar"}
          </button>
        </div>
      </div>
    </div>
  );
}
