"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  Save,
  Settings2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatMonthYear, formatNumber } from "@/lib/formatters";

type TipoPeriodo = "mensal" | "trimestral" | "semestral" | "anual";

interface CustoItem {
  label: string;
  valor: number;
  rubricaId?: string;
  categoria?: string | null;
  confirmado?: boolean;
  valorPadrao?: number;
}

interface InadimplenciaFaixa {
  label: string;
  qtd: number;
  valor: number;
}

interface InadimplenciaFatura {
  id: string;
  consumerUnitId: string;
  ucCodigo: string | null;
  consumidorNome: string | null;
  ano: number;
  mes: number;
  valorCobranca: number;
  dataVencimento: string | null;
  diasAtraso: number;
}

interface Inadimplencia {
  total: number;
  qtdTotal: number;
  pctSobreReceita: number;
  faixas: InadimplenciaFaixa[];
  faturas: InadimplenciaFatura[];
}

interface MesResultado {
  ano: number;
  mes: number;
  receitaAsaas: number;
  receitaGestao: number;
  receitaBruta: number;
  custoUsinas: number;
  custoInvestidorBruto: number;
  custoDireto: number;
  margemBruta: number;
  margemBrutaPct: number;
  custosFixosTotal: number;
  rubricas: CustoItem[];
  taxRatePercentual: number | null;
  imposto: number;
  lucroLiquido: number;
  margemLiquidaPct: number;
  kwhInjetado: number;
  kwhCompensado: number;
  custoUsinasItems: CustoItem[];
  custoInvestidorItems: CustoItem[];
}

interface DreAgregado {
  tipo: TipoPeriodo;
  ano: number;
  mes: number;
  periodoLabel: string;
  meses: MesResultado[];
  totais: {
    receitaAsaas: number;
    receitaGestao: number;
    receitaBruta: number;
    custoUsinas: number;
    custoInvestidorBruto: number;
    custoDireto: number;
    margemBruta: number;
    margemBrutaPct: number;
    custosFixosTotal: number;
    imposto: number;
    lucroLiquido: number;
    margemLiquidaPct: number;
    kwhInjetado: number;
    kwhCompensado: number;
  };
  inadimplencia: Inadimplencia;
  alertas: string[];
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

const MES_CURTO = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function pctText(v: number): string {
  return `${v.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
}

// ============================================================
// Indicador card
// ============================================================

function Indicador({
  titulo,
  valor,
  subtitulo,
  cor,
  icon: Icon,
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
  cor: "emerald" | "rose" | "slate" | "amber";
  icon: React.ElementType;
}) {
  const colorMap = {
    emerald: "from-emerald-500 to-emerald-700",
    rose: "from-rose-500 to-rose-700",
    slate: "from-slate-500 to-slate-700",
    amber: "from-amber-500 to-amber-700",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${colorMap[cor]} text-white`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {titulo}
          </p>
          <p className="truncate text-xl font-bold">{valor}</p>
          {subtitulo ? (
            <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Linha DRE
// ============================================================

function DreLinha({
  label,
  valor,
  sinal = "neutro",
  destaque = false,
  indent = false,
}: {
  label: string;
  valor: number | string;
  sinal?: "positivo" | "negativo" | "neutro";
  destaque?: boolean;
  indent?: boolean;
}) {
  const valorStr = typeof valor === "string" ? valor : formatBRL(valor);
  const corValor =
    sinal === "positivo"
      ? "text-emerald-700"
      : sinal === "negativo"
        ? "text-rose-700"
        : "text-foreground";
  return (
    <div
      className={`flex items-center justify-between gap-3 py-1.5 ${
        destaque
          ? "border-t border-foreground/20 pt-3 font-semibold"
          : indent
            ? "pl-6 text-sm"
            : ""
      }`}
    >
      <span className={indent ? "text-muted-foreground" : ""}>{label}</span>
      <span className={`tabular-nums ${corValor} ${destaque ? "text-base" : ""}`}>
        {valorStr}
      </span>
    </div>
  );
}

// ============================================================
// Painel de rubricas — sempre mostra o ÚLTIMO mês do período
// (pra evitar overhead no UX; o usuário pode trocar pra mensal pra editar
// qualquer mês específico)
// ============================================================

function RubricasPanel({
  ano,
  mes,
  rubricas,
  custosFixosTotal,
  editavel,
  onConfirmed,
}: {
  ano: number;
  mes: number;
  rubricas: CustoItem[];
  custosFixosTotal: number;
  editavel: boolean;
  onConfirmed: () => void;
}) {
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEdicoes({});
    setEditando(false);
  }, [ano, mes]);

  function startEdit() {
    const init: Record<string, string> = {};
    for (const r of rubricas) {
      if (r.rubricaId) init[r.rubricaId] = String(r.valor);
    }
    setEdicoes(init);
    setEditando(true);
  }

  function cancelEdit() {
    setEdicoes({});
    setEditando(false);
  }

  async function confirmar() {
    const entries = rubricas
      .filter((r) => r.rubricaId)
      .map((r) => {
        const raw = edicoes[r.rubricaId!];
        const parsed =
          raw !== undefined ? Number(raw.replace(",", ".")) : r.valor;
        return { recurringCostId: r.rubricaId!, valor: parsed };
      });

    for (const e of entries) {
      if (!Number.isFinite(e.valor) || e.valor < 0) {
        toast.error("Há rubricas com valor inválido.");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/financeiro/recurring-cost-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, mes, entries }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao confirmar");
      toast.success("Rubricas confirmadas para o mês");
      setEditando(false);
      setEdicoes({});
      onConfirmed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar");
    } finally {
      setSaving(false);
    }
  }

  const todasConfirmadas =
    rubricas.length > 0 && rubricas.every((r) => r.confirmado);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">
            Custos fixos {editavel ? `· ${formatMonthYear(mes, ano)}` : ""}
          </CardTitle>
          {editavel && !editando ? (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="h-4 w-4" />
              {todasConfirmadas ? "Editar valores" : "Confirmar valores"}
            </Button>
          ) : editavel ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={confirmar} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </Button>
            </div>
          ) : null}
        </div>
        {!editavel ? (
          <p className="text-xs text-muted-foreground">
            Edite rubricas trocando o tipo de período para <b>mensal</b>.
          </p>
        ) : rubricas.length > 0 && !todasConfirmadas && !editando ? (
          <p className="text-xs text-amber-700">
            Algumas rubricas ainda usam o valor padrão. Clique em <b>Confirmar
            valores</b> para registrar os valores efetivos do mês.
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {rubricas.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma rubrica ativa cadastrada.{" "}
            <Link
              href="/admin/faturamento/fechamento-financeiro/configuracao"
              className="text-primary underline-offset-4 hover:underline"
            >
              Cadastrar
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-1.5">
            {rubricas.map((r) => (
              <div
                key={r.rubricaId}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {r.label}
                    </span>
                    {r.confirmado ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                        title="Valor confirmado para este mês"
                      >
                        <CheckCircle2 className="h-3 w-3" /> confirmado
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                        title="Usando valor padrão"
                      >
                        padrão
                      </span>
                    )}
                  </div>
                  {r.categoria ? (
                    <p className="text-xs text-muted-foreground">
                      {r.categoria}
                    </p>
                  ) : null}
                </div>
                <div className="w-40 text-right">
                  {editando && r.rubricaId ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={edicoes[r.rubricaId] ?? String(r.valor)}
                      onChange={(e) =>
                        setEdicoes({
                          ...edicoes,
                          [r.rubricaId!]: e.target.value,
                        })
                      }
                      className="h-8 text-right tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums text-sm">
                      {formatBRL(r.valor)}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t pt-2">
              <span className="text-sm font-semibold">Total</span>
              <span className="tabular-nums text-sm font-semibold">
                {formatBRL(custosFixosTotal)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Página
// ============================================================

export default function FechamentoFinanceiroPage() {
  const now = useMemo(() => new Date(), []);
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [tipo, setTipo] = useState<TipoPeriodo>("mensal");
  const [dre, setDre] = useState<DreAgregado | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        ano: String(ano),
        mes: String(mes),
        tipo,
      });
      const res = await fetch(
        `/api/admin/financeiro/fechamento?${qs.toString()}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar");
      setDre(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
      setDre(null);
    } finally {
      setLoading(false);
    }
  }, [ano, mes, tipo]);

  useEffect(() => {
    load();
  }, [load]);

  const pdfHref =
    `/api/admin/financeiro/fechamento/pdf?ano=${ano}&mes=${mes}&tipo=${tipo}`;

  const ultimoMes = dre?.meses[dre.meses.length - 1] ?? null;
  const t = dre?.totais ?? null;

  return (
    <div className="space-y-6 p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 text-white">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Fechamento Financeiro</h1>
            <p className="text-sm text-muted-foreground">
              DRE · regime de caixa
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Período</Label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoPeriodo)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
            {tipo !== "anual" ? (
              <>
                <Label className="text-xs">Mês</Label>
                <select
                  value={mes}
                  onChange={(e) => setMes(Number(e.target.value))}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {MESES.map((nome, i) => (
                    <option key={i + 1} value={i + 1}>
                      {nome}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <Label className="text-xs">Ano</Label>
            <Input
              type="number"
              min={2000}
              max={2100}
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="h-9 w-24"
            />
          </div>
          <a href={pdfHref} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <Download className="h-4 w-4" />
              Exportar PDF
            </Button>
          </a>
          <Link href="/admin/faturamento/fechamento-financeiro/configuracao">
            <Button variant="outline">
              <Settings2 className="h-4 w-4" />
              Configurações
            </Button>
          </Link>
        </div>
      </div>

      {/* Label do período ativo */}
      {dre ? (
        <p className="-mt-2 text-sm text-muted-foreground">
          Exibindo: <span className="font-semibold text-foreground">{dre.periodoLabel}</span>
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando fechamento...
        </div>
      ) : !dre || !t || !ultimoMes ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Sem dados para o período selecionado.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              titulo="Receita bruta"
              valor={formatBRL(t.receitaBruta)}
              subtitulo={`Asaas + Gestão · ${dre.periodoLabel}`}
              cor="emerald"
              icon={ArrowUp}
            />
            <Indicador
              titulo="Custos totais"
              valor={formatBRL(
                t.custoDireto + t.custosFixosTotal + t.imposto,
              )}
              subtitulo="Direto + fixos + imposto"
              cor="rose"
              icon={ArrowDown}
            />
            <Indicador
              titulo={t.lucroLiquido >= 0 ? "Lucro líquido" : "Prejuízo"}
              valor={formatBRL(t.lucroLiquido)}
              subtitulo={pctText(t.margemLiquidaPct) + " de margem"}
              cor={t.lucroLiquido >= 0 ? "emerald" : "rose"}
              icon={t.lucroLiquido >= 0 ? TrendingUp : TrendingDown}
            />
            <Indicador
              titulo="Inadimplência atual"
              valor={formatBRL(dre.inadimplencia.total)}
              subtitulo={`${dre.inadimplencia.qtdTotal} fatura(s) · ${pctText(dre.inadimplencia.pctSobreReceita)} da receita`}
              cor={dre.inadimplencia.total > 0 ? "amber" : "slate"}
              icon={Wallet}
            />
          </div>

          {/* Atenções */}
          {dre.alertas.length > 0 ? (
            <Card className="border-amber-300 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-amber-900">
                  <AlertTriangle className="h-5 w-5" />
                  Pontos de atenção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-amber-900">
                  {dre.alertas.map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden>•</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {/* Grid: DRE + Rubricas */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">
                  DRE — {dre.periodoLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0.5">
                <DreLinha
                  label="Boletos Asaas pagos"
                  valor={t.receitaAsaas}
                  sinal="positivo"
                  indent
                />
                <DreLinha
                  label="Receita de gestão de energia"
                  valor={t.receitaGestao}
                  sinal="positivo"
                  indent
                />
                <DreLinha
                  label="Receita bruta"
                  valor={t.receitaBruta}
                  destaque
                />

                <DreLinha
                  label="Conta da usina (concessionária)"
                  valor={-t.custoUsinas}
                  sinal="negativo"
                  indent
                />
                <DreLinha
                  label="Pagamento investidor (bruto)"
                  valor={-t.custoInvestidorBruto}
                  sinal="negativo"
                  indent
                />
                <DreLinha
                  label="(=) Margem bruta"
                  valor={t.margemBruta}
                  destaque
                  sinal={t.margemBruta >= 0 ? "positivo" : "negativo"}
                />

                <DreLinha
                  label="Custos fixos (rubricas)"
                  valor={-t.custosFixosTotal}
                  sinal="negativo"
                  indent
                />
                <DreLinha
                  label={
                    ultimoMes.taxRatePercentual !== null
                      ? `Imposto (${ultimoMes.taxRatePercentual}% sobre receita)`
                      : "Imposto (sem alíquota vigente)"
                  }
                  valor={-t.imposto}
                  sinal="negativo"
                  indent
                />

                <DreLinha
                  label={
                    t.lucroLiquido >= 0
                      ? "Lucro líquido"
                      : "Prejuízo do período"
                  }
                  valor={t.lucroLiquido}
                  destaque
                  sinal={t.lucroLiquido >= 0 ? "positivo" : "negativo"}
                />

                {/* Indicadores físicos */}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      kWh injetado (referência)
                    </p>
                    <p className="font-semibold tabular-nums">
                      {formatNumber(t.kwhInjetado)} kWh
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      kWh compensado (referência)
                    </p>
                    <p className="font-semibold tabular-nums">
                      {formatNumber(t.kwhCompensado)} kWh
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <RubricasPanel
              ano={ultimoMes.ano}
              mes={ultimoMes.mes}
              rubricas={ultimoMes.rubricas}
              custosFixosTotal={ultimoMes.custosFixosTotal}
              editavel={tipo === "mensal"}
              onConfirmed={load}
            />
          </div>

          {/* Breakdown mês a mês (períodos agregados) */}
          {dre.meses.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Breakdown mês a mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Receita bruta</TableHead>
                      <TableHead className="text-right">Custo direto</TableHead>
                      <TableHead className="text-right">Custos fixos</TableHead>
                      <TableHead className="text-right">Imposto</TableHead>
                      <TableHead className="text-right">Lucro líquido</TableHead>
                      <TableHead className="text-right">Margem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dre.meses.map((m) => (
                      <TableRow key={`${m.ano}-${m.mes}`}>
                        <TableCell className="font-medium">
                          {MES_CURTO[m.mes - 1]}/{m.ano}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(m.receitaBruta)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(m.custoDireto)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(m.custosFixosTotal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(m.imposto)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-semibold ${
                            m.lucroLiquido >= 0
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {formatBRL(m.lucroLiquido)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {pctText(m.margemLiquidaPct)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40">
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell className="text-right tabular-nums font-bold">
                        {formatBRL(t.receitaBruta)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">
                        {formatBRL(t.custoDireto)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">
                        {formatBRL(t.custosFixosTotal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">
                        {formatBRL(t.imposto)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-bold ${
                          t.lucroLiquido >= 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {formatBRL(t.lucroLiquido)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">
                        {pctText(t.margemLiquidaPct)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {/* Inadimplência detalhada */}
          {dre.inadimplencia.qtdTotal > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Inadimplência por faixa
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Faixa</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dre.inadimplencia.faixas.map((f) => (
                        <TableRow key={f.label}>
                          <TableCell>{f.label}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {f.qtd}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBRL(f.valor)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40">
                        <TableCell className="font-bold">Total</TableCell>
                        <TableCell className="text-right tabular-nums font-bold">
                          {dre.inadimplencia.qtdTotal}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-bold">
                          {formatBRL(dre.inadimplencia.total)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">
                    Top 20 faturas em aberto
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>UC</TableHead>
                        <TableHead>Consumidor</TableHead>
                        <TableHead>Referência</TableHead>
                        <TableHead className="text-right">Dias</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dre.inadimplencia.faturas.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-mono text-xs">
                            {f.ucCodigo ?? "—"}
                          </TableCell>
                          <TableCell className="truncate">
                            {f.consumidorNome ?? "—"}
                          </TableCell>
                          <TableCell>
                            {MES_CURTO[f.mes - 1]}/{f.ano}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              f.diasAtraso > 90
                                ? "text-rose-700 font-semibold"
                                : f.diasAtraso > 60
                                  ? "text-amber-700"
                                  : ""
                            }`}
                          >
                            {f.diasAtraso}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBRL(f.valorCobranca)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Detalhamento custos diretos (só no mensal — em períodos agregados
              viraria poluição). */}
          {tipo === "mensal" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Detalhamento — conta da usina
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {ultimoMes.custoUsinasItems.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nenhum pagamento de usina no mês.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {ultimoMes.custoUsinasItems.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="truncate">{item.label}</span>
                          <span className="tabular-nums">
                            {formatBRL(item.valor)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Detalhamento — pagamento a investidores
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {ultimoMes.custoInvestidorItems.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nenhum settlement pago no mês.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {ultimoMes.custoInvestidorItems.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="truncate">{item.label}</span>
                          <span className="tabular-nums">
                            {formatBRL(item.valor)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
