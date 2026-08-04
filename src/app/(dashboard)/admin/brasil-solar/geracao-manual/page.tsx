"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  KeyboardIcon,
  Loader2,
  Save,
  AlertTriangle,
  ExternalLink,
  CalendarRange,
} from "lucide-react";
import { toast } from "sonner";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { matchBusca } from "@/lib/busca";
import { formatNumber } from "@/lib/formatters";

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

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

interface UsinaDoMesDTO {
  id: string;
  nome: string;
  codigoUc: string | null;
  cidade: string | null;
  plataformaMonitoramento: string | null;
  potenciaInstalada: number | null;
  statusMonitoramento: string;
  kwhMes: number;
  kwhApi: number;
  kwhManual: number;
  diasComDado: number;
  lancamento: {
    id: string;
    tipoPeriodo: "MENSAL" | "PERSONALIZADO";
    /** Rótulo do período — no personalizado mostra as datas. */
    periodoLabel: string;
    kwhTotal: number;
    fonte: string | null;
    observacao: string | null;
    registradoPor: string;
    atualizadoEm: string;
    status: "ATIVO" | "PARCIAL" | "SUPERADO";
  } | null;
}

/**
 * Lançamento manual de geração em lote — um mês, várias usinas.
 *
 * Existe porque a integração com algumas plataformas de monitoramento ainda não
 * está pronta: sem isso, essas usinas ficam sem geração no relatório do cliente.
 * Por padrão lista só as usinas SEM nenhum kWh medido no mês, que é exatamente
 * o buraco a tapar.
 */
export default function GeracaoManualLotePage() {
  const hoje = new Date();
  // Padrão: mês anterior — o corrente ainda está correndo.
  const refPadrao = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));

  const [ano, setAno] = useState(refPadrao.getUTCFullYear());
  const [mes, setMes] = useState(refPadrao.getUTCMonth() + 1);
  const [somenteSemDado, setSomenteSemDado] = useState(true);
  const [busca, setBusca] = useState("");
  const [usinas, setUsinas] = useState<UsinaDoMesDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [fonte, setFonte] = useState("");
  /** kWh digitado por usina; string vazia = limpar o lançamento existente. */
  const [valores, setValores] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/brasil-solar/geracao-manual?ano=${ano}&mes=${mes}&somenteSemDado=${somenteSemDado ? 1 : 0}`,
      );
      const d = await r.json();
      setUsinas(Array.isArray(d.usinas) ? d.usinas : []);
      setValores({});
    } finally {
      setLoading(false);
    }
  }, [ano, mes, somenteSemDado]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const anos = useMemo(() => {
    const arr: number[] = [];
    for (let y = hoje.getUTCFullYear(); y >= hoje.getUTCFullYear() - 3; y--) arr.push(y);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtradas = useMemo(
    () =>
      usinas.filter((u) =>
        matchBusca(busca, [u.nome, u.codigoUc, u.cidade, u.plataformaMonitoramento]),
      ),
    [usinas, busca],
  );

  // Só vai pro servidor o que o operador realmente tocou: linha intocada não
  // pode disparar regravação (regravar recria o rateio e perde nada, mas gasta
  // transação e polui o "lançado por").
  const alteracoes = useMemo(() => {
    const itens: { clientId: string; kwhTotal: string }[] = [];
    for (const u of usinas) {
      // Lançamento de ciclo personalizado não é editável por uma coluna de mês:
      // salvar aqui trocaria a janela dele por um mês fechado sem o operador
      // perceber. Só na tela da usina.
      if (u.lancamento?.tipoPeriodo === "PERSONALIZADO") continue;
      const digitado = valores[u.id];
      if (digitado === undefined) continue;
      const atual = u.lancamento ? String(u.lancamento.kwhTotal) : "";
      if (digitado.trim() === atual.trim()) continue;
      itens.push({ clientId: u.id, kwhTotal: digitado.trim() });
    }
    return itens;
  }, [usinas, valores]);

  const salvar = async () => {
    if (alteracoes.length === 0) {
      toast.info("Nenhum valor alterado");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/brasil-solar/geracao-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ano,
          mes,
          fonte: fonte.trim() || null,
          itens: alteracoes.map((a) => ({
            clientId: a.clientId,
            kwhTotal: a.kwhTotal === "" ? null : Number(a.kwhTotal.replace(",", ".")),
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Erro ao salvar");
        return;
      }
      if (d.lancados?.length) toast.success(`${d.lancados.length} usina(s) lançada(s)`);
      if (d.removidos?.length) toast.success(`${d.removidos.length} lançamento(s) removido(s)`);
      for (const e of (d.erros ?? []) as { clientId: string; erro: string }[]) {
        const nome = usinas.find((u) => u.id === e.clientId)?.nome ?? e.clientId;
        toast.error(`${nome}: ${e.erro}`, { duration: 9000 });
      }
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  const totalDigitado = alteracoes.reduce(
    (s, a) => s + (a.kwhTotal ? Number(a.kwhTotal.replace(",", ".")) || 0 : 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <KeyboardIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Geração Manual</h1>
          <p className="text-sm text-muted-foreground">
            Informe o total de kWh do mês para usinas cuja plataforma de monitoramento não está
            enviando dados. O total é distribuído pelos dias do mês e passa a alimentar relatórios,
            portal do cliente e análise de créditos — sempre marcado como manual. Quando a
            integração começar a trazer o dado medido, ele substitui o lançamento automaticamente.
            Esta tela trabalha por mês fechado; para lançar por ciclo de leitura da fatura (ex.:
            10/04 a 11/05), use o botão <strong>Geração manual</strong> na página da usina.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Mês
              </label>
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className={selectClass}
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ano
              </label>
              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className={selectClass}
              >
                {anos.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Usinas
              </label>
              <select
                value={somenteSemDado ? "sem" : "todas"}
                onChange={(e) => setSomenteSemDado(e.target.value === "sem")}
                className={selectClass}
              >
                <option value="sem">Sem geração medida no mês</option>
                <option value="todas">Todas as usinas ativas</option>
              </select>
            </div>
            <div className="space-y-1.5 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Fonte do número
              </label>
              <input
                value={fonte}
                onChange={(e) => setFonte(e.target.value)}
                placeholder="ex.: planilha do consultor"
                className={`${selectClass} w-full`}
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Buscar
              </label>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Usina, UC, cidade, plataforma..."
                className={`${selectClass} w-full`}
              />
            </div>
            <button
              onClick={salvar}
              disabled={salvando || alteracoes.length === 0}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar {alteracoes.length > 0 && `(${alteracoes.length})`}
            </button>
          </div>

          {alteracoes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {alteracoes.length} usina(s) alterada(s), somando{" "}
              {formatNumber(totalDigitado)} kWh. Campo apagado remove o lançamento manual do mês.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-12">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando usinas...
            </div>
          ) : filtradas.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">
              {somenteSemDado
                ? `Nenhuma usina ativa ficou sem geração medida em ${MESES[mes - 1]}/${ano}.`
                : "Nenhuma usina encontrada."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b bg-muted/30">
                    <th className="text-left font-medium p-3">Usina</th>
                    <th className="text-left font-medium p-3">Plataforma</th>
                    <th className="text-right font-medium p-3">kWp</th>
                    <th className="text-right font-medium p-3">Medido no mês</th>
                    <th className="text-right font-medium p-3">Manual atual</th>
                    <th className="text-left font-medium p-3 w-[170px]">Total do mês (kWh)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((u) => {
                    const valorAtual = u.lancamento ? String(u.lancamento.kwhTotal) : "";
                    const digitado = valores[u.id] ?? valorAtual;
                    const alterado = digitado.trim() !== valorAtual.trim();
                    const personalizado = u.lancamento?.tipoPeriodo === "PERSONALIZADO";
                    return (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-3">
                          <Link
                            href={`/admin/brasil-solar/${u.id}`}
                            className="font-medium hover:underline inline-flex items-center gap-1"
                          >
                            {u.nome}
                            <ExternalLink className="h-3 w-3 opacity-50" />
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {u.codigoUc ? formatCodigoUc(u.codigoUc) : "sem UC"}
                            {u.cidade ? ` · ${u.cidade}` : ""}
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          {u.plataformaMonitoramento || (
                            <span className="text-muted-foreground">não informada</span>
                          )}
                          <div className="text-muted-foreground">{u.statusMonitoramento}</div>
                        </td>
                        <td className="p-3 text-right text-xs">
                          {u.potenciaInstalada ? formatNumber(u.potenciaInstalada) : "—"}
                        </td>
                        <td className="p-3 text-right text-xs">
                          {u.kwhApi > 0 ? (
                            <span className="text-emerald-700">
                              {formatNumber(u.kwhApi)} kWh
                              <div className="text-muted-foreground">
                                {u.diasComDado} dia(s) com dado
                              </div>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              nada
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right text-xs">
                          {u.lancamento ? (
                            <>
                              {formatNumber(u.lancamento.kwhTotal)} kWh
                              <div className="text-muted-foreground">
                                {u.lancamento.tipoPeriodo === "PERSONALIZADO"
                                  ? u.lancamento.periodoLabel
                                  : u.lancamento.status === "SUPERADO"
                                    ? "superado pelo medido"
                                    : u.lancamento.status === "PARCIAL"
                                      ? "parcialmente medido"
                                      : u.lancamento.registradoPor}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {personalizado ? (
                            <Link
                              href={`/admin/brasil-solar/${u.id}`}
                              className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
                              title="Lançamento de ciclo personalizado — editável só na tela da usina"
                            >
                              <CalendarRange className="h-3.5 w-3.5" />
                              ciclo personalizado
                            </Link>
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={digitado}
                              onChange={(e) =>
                                setValores((prev) => ({ ...prev, [u.id]: e.target.value }))
                              }
                              placeholder="ex.: 4120"
                              className={`${selectClass} w-full text-right ${
                                alterado ? "border-primary ring-2 ring-primary/20" : ""
                              }`}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
