"use client";

/**
 * Aba "Transferências" da tela de Rateios: o saldo PRESO numa geradora que foi,
 * de uma vez, para outras UCs (troca de titularidade + documento enviado à RGE
 * por email). Ver `src/lib/transferencia-creditos.ts` para a regra que separa,
 * na fatura do destino, o crédito transferido da geração própria e do rateio.
 *
 * Só cadastro e acompanhamento — nada aqui gera repasse nem cobrança.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportarTabela } from "@/components/ui/exportar-tabela";
import { AdicionarUc, type UnidadeDisponivel } from "@/components/rateios/adicionar-uc";
import { formatCodigoUc } from "@/lib/uc-codigo";
import {
  SITUACAO_DESTINO_LABEL,
  STATUS_TRANSFERENCIA,
  STATUS_TRANSFERENCIA_LABEL,
  TOLERANCIA_SOMA_KWH,
  type Acompanhamento,
  type AnoMes,
  type SituacaoDestino,
  type StatusTransferencia,
} from "@/lib/transferencia-creditos";

// ─────────────────────────── tipos da API (datas em string) ───────────────────────────

interface Destino {
  itemId: string;
  kwh: number;
  uc: { id: string; nome: string; codigoUc: string; codigoUcAntigo: string | null; temGeracaoPropria: boolean };
  acompanhamento: Acompanhamento;
}

interface Transferencia {
  id: string;
  plant: { id: string; name: string } | null;
  ucOrigemCodigo: string;
  kwhTotal: number;
  status: StatusTransferencia;
  enviadoEm: string | null;
  aceitoEm: string | null;
  observacao: string | null;
  documentoUrl: string | null;
  documentoNome: string | null;
  destinos: Destino[];
  usadoKwh: number;
  restanteKwh: number;
}

interface UsinaOpcao {
  id: string;
  name: string;
  unidadeConsumidora: string | null;
  unidadeConsumidoraAntiga: string | null;
  numeroUsina: string | null;
}

interface Resposta {
  transferencias: Transferencia[];
  opcoes: { usinas: UsinaOpcao[]; ucs: UnidadeDisponivel[] };
}

// ─────────────────────────── formatação ───────────────────────────

const kwhFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const kwh = (v: number | null | undefined) => (v == null ? "—" : `${kwhFmt.format(v)} kWh`);
const mesAno = (m: AnoMes | null) => (m ? `${String(m.mes).padStart(2, "0")}/${m.ano}` : "—");
/** Datas vêm ao meio-dia UTC: lidas em UTC para não virar o dia anterior. */
const data = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const paraInput = (s: string | null) => (s ? s.slice(0, 10) : "");

const TOM_SITUACAO: Record<SituacaoDestino, string> = {
  AGUARDANDO_ACEITE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  AGUARDANDO_FATURA: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  EM_CONSUMO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ESGOTADA: "bg-muted text-muted-foreground",
  REJEITADA: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const TOM_STATUS: Record<StatusTransferencia, string> = {
  ENVIADA: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ACEITA: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJEITADA: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

function fileHref(relativePath: string): string {
  return `/api/files/${relativePath.replace(/^uploads\//, "")}`;
}

/** A fatura mais recente no sistema está atrasada? (mais de 2 meses atrás de hoje) */
function faturaAtrasada(ultima: AnoMes | null): boolean {
  if (!ultima) return false;
  const hoje = new Date();
  const atual = hoje.getFullYear() * 12 + hoje.getMonth();
  return atual - (ultima.ano * 12 + ultima.mes - 1) > 2;
}

// ─────────────────────────── aba ───────────────────────────

export function TransferenciasCredito() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<Transferencia | "nova" | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/transferencias-credito");
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
      setDados(await r.json());
    } catch (e) {
      toast.error(`Não foi possível carregar as transferências: ${(e as Error).message}`);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const lista = useMemo(() => dados?.transferencias ?? [], [dados]);
  const resumo = useMemo(() => {
    const aceitas = lista.filter((t) => t.status === "ACEITA");
    return {
      total: lista.length,
      transferido: aceitas.reduce((s, t) => s + t.kwhTotal, 0),
      usado: aceitas.reduce((s, t) => s + t.usadoKwh, 0),
      restante: aceitas.reduce((s, t) => s + t.restanteKwh, 0),
      aguardando: lista.filter((t) => t.status === "ENVIADA").length,
    };
  }, [lista]);

  const alternar = (id: string) =>
    setAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const excluir = async (t: Transferencia) => {
    if (!window.confirm(`Excluir a transferência da UC ${formatCodigoUc(t.ucOrigemCodigo)}? O acompanhamento some junto.`)) return;
    const r = await fetch(`/api/transferencias-credito/${t.id}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error("Não foi possível excluir.");
      return;
    }
    toast.success("Transferência excluída.");
    carregar();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Créditos que ficaram presos numa geradora e foram enviados, de uma vez, para outras UCs (troca
          de titularidade + documento de transferência enviado à RGE). O acompanhamento lê as faturas do
          destino: o crédito transferido chega com mês de origem <b>anterior ao aceite</b>, separado da
          geração própria e do rateio.
        </p>
        <Button onClick={() => setEditando("nova")} disabled={!dados}>
          <Plus className="mr-1 h-4 w-4" /> Nova transferência
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi titulo="Transferências" valor={String(resumo.total)} sub={resumo.aguardando ? `${resumo.aguardando} aguardando aceite` : "registradas"} />
        <Kpi titulo="Transferido (aceitas)" valor={kwh(resumo.transferido)} />
        <Kpi titulo="Já compensado" valor={kwh(resumo.usado)} sub={resumo.transferido ? `${Math.round((resumo.usado / resumo.transferido) * 100)}% do transferido` : undefined} />
        <Kpi titulo="Saldo a consumir" valor={kwh(resumo.restante)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {carregando && !dados ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : lista.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma transferência registrada. Use <b>Nova transferência</b> para cadastrar a primeira.
            </div>
          ) : (
            <>
              <div className="flex justify-end border-b p-2">
                <ExportarTabela tabela="transferencias-credito" nome="transferencias-de-credito" aba="Transferências" variant="ghost" size="xs" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-tabela="transferencias-credito">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="w-8 p-2" />
                      <th className="p-2">Origem</th>
                      <th className="p-2">Destino(s)</th>
                      <th className="p-2 text-right">Transferido</th>
                      <th className="p-2 text-right">Compensado</th>
                      <th className="p-2 text-right">Saldo</th>
                      <th className="p-2" title="Previsão pela média dos últimos 3 meses de cada destino">Acaba em</th>
                      <th className="p-2">Situação</th>
                      <th className="p-2">Aceite RGE</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((t) => {
                      const aberta = abertas.has(t.id);
                      return (
                        <Fragment key={t.id}>
                          <tr className="cursor-pointer border-t hover:bg-muted/30" onClick={() => alternar(t.id)}>
                            <td className="p-2 text-muted-foreground">
                              {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </td>
                            <td className="p-2">
                              {t.plant ? (
                                <Link
                                  href={`/admin/usinas/${t.plant.id}`}
                                  className="font-medium hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {t.plant.name}
                                </Link>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Usina não identificada
                                </span>
                              )}
                              <div className="text-xs text-muted-foreground">UC {formatCodigoUc(t.ucOrigemCodigo)}</div>
                            </td>
                            <td className="p-2">
                              {t.destinos.map((d) => (
                                <div key={d.itemId} className="truncate">
                                  {d.uc.nome}
                                </div>
                              ))}
                            </td>
                            <td className="p-2 text-right tabular-nums">{kwh(t.kwhTotal)}</td>
                            <td className="p-2 text-right tabular-nums">{t.status === "ACEITA" ? kwh(t.usadoKwh) : "—"}</td>
                            <td className="p-2 text-right font-medium tabular-nums">{t.status === "ACEITA" ? kwh(t.restanteKwh) : "—"}</td>
                            <td className="p-2 tabular-nums">
                              {t.status === "ACEITA"
                                ? t.destinos.map((d) => (
                                    <div key={d.itemId}>
                                      <AcabaEm a={d.acompanhamento} />
                                    </div>
                                  ))
                                : "—"}
                            </td>
                            <td className="p-2">
                              <span className={`rounded px-2 py-0.5 text-xs font-medium ${TOM_STATUS[t.status]}`}>
                                {STATUS_TRANSFERENCIA_LABEL[t.status]}
                              </span>
                            </td>
                            <td className="p-2 tabular-nums">{data(t.aceitoEm)}</td>
                            <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                {t.documentoUrl && (
                                  <a href={fileHref(t.documentoUrl)} target="_blank" rel="noreferrer" title={t.documentoNome ?? "Documento"}>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  </a>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => setEditando(t)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" title="Excluir" onClick={() => excluir(t)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {aberta && (
                            <tr className="border-t bg-muted/20">
                              <td />
                              <td colSpan={9} className="space-y-4 p-3">
                                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                                  <span>Email à RGE: <b>{data(t.enviadoEm)}</b></span>
                                  <span>Aceite: <b>{data(t.aceitoEm)}</b></span>
                                  {t.observacao && <span>Obs.: {t.observacao}</span>}
                                  {!t.documentoUrl && <span className="text-amber-700 dark:text-amber-400">Sem documento anexado</span>}
                                </div>
                                {t.destinos.map((d) => (
                                  <DetalheDestino key={d.itemId} d={d} />
                                ))}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {editando && dados && (
        <FormularioTransferencia
          inicial={editando === "nova" ? null : editando}
          opcoes={dados.opcoes}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

/** Previsão de esgotar; em vermelho quando o crédito vence antes de ser todo usado. */
function AcabaEm({ a }: { a: Acompanhamento }) {
  if (a.situacao === "ESGOTADA") return <span className="text-muted-foreground">Esgotada</span>;
  if (!a.previsaoEsgotar) return <span className="text-muted-foreground">—</span>;
  const n = (m: AnoMes) => m.ano * 12 + m.mes;
  const venceAntes = a.venceEm != null && n(a.venceEm) < n(a.previsaoEsgotar);
  return venceAntes ? (
    <span
      className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400"
      title={`O crédito vence em ${mesAno(a.venceEm)}, antes de ser todo compensado`}
    >
      <AlertTriangle className="h-3.5 w-3.5" /> {mesAno(a.previsaoEsgotar)}
    </span>
  ) : (
    <span>{mesAno(a.previsaoEsgotar)}</span>
  );
}

function Kpi({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{titulo}</div>
        <div className="text-lg font-semibold tabular-nums">{valor}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── acompanhamento de um destino ───────────────────────────

function DetalheDestino({ d }: { d: Destino }) {
  const a = d.acompanhamento;
  const pct = d.kwh > 0 ? Math.min(100, (a.usadoKwh / d.kwh) * 100) : 0;
  const atrasada = faturaAtrasada(a.ultimaFatura);

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{d.uc.nome}</span>
        <span className="text-xs text-muted-foreground">
          UC {formatCodigoUc(d.uc.codigoUc)}
          {d.uc.codigoUcAntigo ? ` · antigo ${d.uc.codigoUcAntigo}` : ""}
        </span>
        {d.uc.temGeracaoPropria && <Badge variant="outline">geração própria</Badge>}
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${TOM_SITUACAO[a.situacao]}`}>
          {SITUACAO_DESTINO_LABEL[a.situacao]}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <Info rotulo="Recebeu" valor={kwh(d.kwh)} />
        <Info rotulo="Compensado" valor={kwh(a.usadoKwh)} />
        <Info rotulo="Saldo" valor={kwh(a.restanteKwh)} forte />
        <Info rotulo="Média/mês" valor={a.mediaMensalKwh ? kwh(a.mediaMensalKwh) : "—"} />
        <Info rotulo="Acaba em (previsão)" valor={mesAno(a.previsaoEsgotar)} />
        <Info
          rotulo="Vence em"
          valor={a.venceEm ? `${mesAno(a.venceEm)}${a.origens.length ? ` (origem ${a.origens[0]})` : ""}` : "—"}
        />
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>

      {atrasada && (
        <p className="mt-2 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> A última fatura no sistema é de {mesAno(a.ultimaFatura)} — o saldo pode estar
          desatualizado. Suba as faturas que faltam.
        </p>
      )}

      {a.meses.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Fatura</th>
                <th className="py-1 pr-3 text-right">Consumo</th>
                <th className="py-1 pr-3 text-right">Compensado total</th>
                <th className="py-1 pr-3 text-right">Da transferência</th>
                <th className="py-1 pr-3">Origem</th>
                <th className="py-1 pr-3 text-right">Saldo da transferência</th>
                <th className="py-1 pr-3 text-right" title="Saldo de créditos impresso na fatura — inclui o que não é da transferência">
                  Saldo na fatura
                </th>
              </tr>
            </thead>
            <tbody>
              {a.meses.map((m) => {
                const difere = m.saldoFaturaKwh != null && Math.abs(m.saldoFaturaKwh - m.restanteKwh) > TOLERANCIA_SOMA_KWH;
                return (
                  <tr key={`${m.ano}-${m.mes}`} className="border-t">
                    <td className="py-1 pr-3 tabular-nums">{mesAno(m)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{kwh(m.consumoKwh)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{kwh(m.compensadoKwh)}</td>
                    <td className="py-1 pr-3 text-right font-medium tabular-nums">{m.kwhTransferencia ? kwh(m.kwhTransferencia) : "—"}</td>
                    <td className="py-1 pr-3">{m.origens.join(", ") || "—"}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{kwh(m.restanteKwh)}</td>
                    <td
                      className={`py-1 pr-3 text-right tabular-nums ${difere ? "text-amber-700 dark:text-amber-400" : ""}`}
                      title={difere ? "Diferente do saldo da transferência: a UC tem crédito de outra fonte, ou falta fatura" : undefined}
                    >
                      {kwh(m.saldoFaturaKwh)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Info({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{rotulo}</div>
      <div className={`tabular-nums ${forte ? "font-semibold" : ""}`}>{valor}</div>
    </div>
  );
}

// ─────────────────────────── formulário ───────────────────────────

interface LinhaDestino {
  uc: UnidadeDisponivel;
  kwh: string;
}

const SEM_USINA = "__sem_usina__";

function FormularioTransferencia({
  inicial,
  opcoes,
  onFechar,
  onSalvo,
}: {
  inicial: Transferencia | null;
  opcoes: Resposta["opcoes"];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const ucPorId = useMemo(() => new Map(opcoes.ucs.map((u) => [u.id, u])), [opcoes.ucs]);

  const [plantId, setPlantId] = useState(inicial?.plant?.id ?? SEM_USINA);
  const [ucOrigem, setUcOrigem] = useState(inicial?.ucOrigemCodigo ?? "");
  const [kwhTotal, setKwhTotal] = useState(inicial ? String(inicial.kwhTotal) : "");
  const [status, setStatus] = useState<StatusTransferencia>(inicial?.status ?? "ENVIADA");
  const [enviadoEm, setEnviadoEm] = useState(paraInput(inicial?.enviadoEm ?? null));
  const [aceitoEm, setAceitoEm] = useState(paraInput(inicial?.aceitoEm ?? null));
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");
  const [destinos, setDestinos] = useState<LinhaDestino[]>(
    () =>
      inicial?.destinos.map((d) => ({
        // UC desativada depois do cadastro não vem nas opções: monta com o que a transferência tem.
        uc: ucPorId.get(d.uc.id) ?? { id: d.uc.id, nome: d.uc.nome, codigoUc: d.uc.codigoUc, codigoUcAntigo: d.uc.codigoUcAntigo, cidade: null, distribuidora: null },
        kwh: String(d.kwh),
      })) ?? [],
  );
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [documento, setDocumento] = useState({ url: inicial?.documentoUrl ?? null, nome: inicial?.documentoNome ?? null });
  const [salvando, setSalvando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const total = Number(kwhTotal.replace(",", ".")) || 0;
  const soma = destinos.reduce((s, d) => s + (Number(d.kwh.replace(",", ".")) || 0), 0);
  const fecha = destinos.length > 0 && Math.abs(soma - total) <= TOLERANCIA_SOMA_KWH;

  const escolherUsina = (id: string) => {
    setPlantId(id);
    const u = opcoes.usinas.find((x) => x.id === id);
    // O código da geradora vem do cadastro da usina; o operador pode trocar
    // pelo que está no documento.
    if (u && !ucOrigem.trim()) setUcOrigem(u.unidadeConsumidora ?? u.numeroUsina ?? u.unidadeConsumidoraAntiga ?? "");
  };

  const adicionar = (uc: UnidadeDisponivel) =>
    setDestinos((prev) => {
      const restante = Math.max(0, total - prev.reduce((s, d) => s + (Number(d.kwh.replace(",", ".")) || 0), 0));
      return [...prev, { uc, kwh: restante ? String(restante) : "" }];
    });

  const salvar = async () => {
    setSalvando(true);
    try {
      const corpo = {
        plantId: plantId === SEM_USINA ? null : plantId,
        ucOrigemCodigo: ucOrigem,
        kwhTotal: total,
        status,
        enviadoEm: enviadoEm || null,
        aceitoEm: aceitoEm || null,
        observacao,
        itens: destinos.map((d) => ({ consumerUnitId: d.uc.id, kwh: Number(d.kwh.replace(",", ".")) })),
      };
      const r = await fetch(inicial ? `/api/transferencias-credito/${inicial.id}` : "/api/transferencias-credito", {
        method: inicial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(j?.error ?? "Não foi possível salvar.");
        return;
      }
      if (arquivo) {
        const fd = new FormData();
        fd.append("file", arquivo);
        const rd = await fetch(`/api/transferencias-credito/${j.id}/documento`, { method: "POST", body: fd });
        if (!rd.ok) toast.error("Transferência salva, mas o documento não subiu. Tente anexar de novo.");
      }
      toast.success(inicial ? "Transferência atualizada." : "Transferência registrada.");
      onSalvo();
    } finally {
      setSalvando(false);
    }
  };

  const removerDocumento = async () => {
    if (!inicial) return;
    const r = await fetch(`/api/transferencias-credito/${inicial.id}/documento`, { method: "DELETE" });
    if (r.ok) setDocumento({ url: null, nome: null });
    else toast.error("Não foi possível remover o documento.");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar transferência de créditos" : "Nova transferência de créditos"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Usina de origem</Label>
              <Select value={plantId} onValueChange={(v) => v && escolherUsina(v)}>
                <SelectTrigger>
                  {/* Base UI mostra o VALOR cru sem isto — aqui o id da usina. */}
                  <SelectValue>
                    {(v: string) => opcoes.usinas.find((u) => u.id === v)?.name ?? "— ainda não identificada —"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_USINA}>— ainda não identificada —</SelectItem>
                  {opcoes.usinas.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">A dona do crédito. Pode ficar em branco até descobrir.</p>
            </div>
            <div className="space-y-1">
              <Label>UC de origem (que cedeu o crédito)</Label>
              <Input value={ucOrigem} onChange={(e) => setUcOrigem(e.target.value)} placeholder="Código novo ou antigo, como está no documento" />
            </div>
            <div className="space-y-1">
              <Label>Total transferido (kWh)</Label>
              <Input inputMode="decimal" value={kwhTotal} onChange={(e) => setKwhTotal(e.target.value)} placeholder="Ex.: 63800" />
            </div>
            <div className="space-y-1">
              <Label>Situação</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as StatusTransferencia)}>
                <SelectTrigger>
                  <SelectValue>{STATUS_TRANSFERENCIA_LABEL[status]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_TRANSFERENCIA.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_TRANSFERENCIA_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Email enviado à RGE em</Label>
              <Input type="date" value={enviadoEm} onChange={(e) => setEnviadoEm(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Aceite da RGE em {status === "ACEITA" && <span className="text-red-600">*</span>}</Label>
              <Input type="date" value={aceitoEm} onChange={(e) => setAceitoEm(e.target.value)} />
              <p className="text-xs text-muted-foreground">É o marco: nas faturas a partir deste mês, o crédito de origem anterior conta como transferência.</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>UCs de destino</Label>
              <AdicionarUc unidades={opcoes.ucs} jaSelecionadas={new Set(destinos.map((d) => d.uc.id))} onAdicionar={adicionar} />
            </div>
            {destinos.length === 0 ? (
              <p className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">Nenhuma UC de destino ainda.</p>
            ) : (
              <div className="space-y-1">
                {destinos.map((d, i) => (
                  <div key={d.uc.id} className="flex items-center gap-2 rounded border p-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.uc.nome}</div>
                      <div className="text-xs text-muted-foreground">UC {formatCodigoUc(d.uc.codigoUc)}</div>
                    </div>
                    <Input
                      className="w-32 text-right"
                      inputMode="decimal"
                      value={d.kwh}
                      onChange={(e) => setDestinos((prev) => prev.map((x, j) => (j === i ? { ...x, kwh: e.target.value } : x)))}
                    />
                    <span className="text-xs text-muted-foreground">kWh</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDestinos((prev) => prev.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className={`text-right text-xs ${fecha ? "text-muted-foreground" : "text-red-600"}`}>
                  Soma dos destinos: {kwh(soma)} de {kwh(total)} {fecha ? "✓" : "— precisa fechar com o total"}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Documento de transferência enviado à RGE</Label>
            <div className="flex flex-wrap items-center gap-2">
              {documento.url && !arquivo && (
                <>
                  <a href={fileHref(documento.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm hover:underline">
                    <FileText className="h-4 w-4" /> {documento.nome ?? "documento"}
                  </a>
                  <Button variant="ghost" size="sm" onClick={removerDocumento}>
                    Remover
                  </Button>
                </>
              )}
              {arquivo && <span className="text-sm">{arquivo.name}</span>}
              <input ref={inputArquivo} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
              <Button variant="outline" size="sm" onClick={() => inputArquivo.current?.click()}>
                <Upload className="mr-1 h-4 w-4" /> {documento.url || arquivo ? "Trocar" : "Anexar"}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Observação</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !fecha || !ucOrigem.trim() || (status === "ACEITA" && !aceitoEm)}>
            {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
