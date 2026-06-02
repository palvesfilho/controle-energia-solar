"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileX,
  Eye,
} from "lucide-react";
import {
  FaturaPreviewDialog,
  type FaturaPreviewData,
} from "./fatura-preview-dialog";

interface Competencia {
  mes: number;
  ano: number;
}

interface UcRow {
  consumerUnitId: string;
  codigoUc: string;
  nome: string;
  tipo: "TITULAR" | "BENEFICIARIA";
  percentual: number | null;
  credencial: {
    statusSync: string | null;
    ultimaSync: string | null;
    erroSync: string | null;
    distribuidora: string;
  } | null;
  ultimaFatura: {
    id: string;
    mesReferencia: number;
    anoReferencia: number;
    valorTotal: number | null;
    energiaCompensada: number | null;
    descontoValor: number | null;
    contaPaga: boolean;
    hasPdf: boolean;
    pdfUrl: string | null;
  } | null;
}

interface Resumo {
  totalUcs: number;
  mesReferencia: Competencia | null;
  baixadasNoMes: number;
  compensadoKwh: number;
  descontoValor: number;
}

interface Response {
  proprietario: { id: string; nome: string };
  competenciasDisponiveis: Competencia[];
  competenciaSelecionada: Competencia | null;
  ucs: UcRow[];
  resumo: Resumo;
}

function fmtBR(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mesAno(mes: number, ano: number): string {
  const meses = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${meses[mes - 1]}/${String(ano).slice(-2)}`;
}

function sameComp(a: Competencia | null, b: Competencia | null): boolean {
  return !!a && !!b && a.mes === b.mes && a.ano === b.ano;
}

export function StatusFaturasCard({ proprietarioId }: { proprietarioId: string }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<Response | null>(null);
  const [selected, setSelected] = useState<Competencia | null>(null);
  const [preview, setPreview] = useState<FaturaPreviewData | null>(null);

  const load = useCallback(
    async (comp?: Competencia | null) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (comp) {
          qs.set("mes", String(comp.mes));
          qs.set("ano", String(comp.ano));
        }
        const url = `/api/brasil-solar/proprietarios/${proprietarioId}/status-faturas${
          qs.toString() ? `?${qs}` : ""
        }`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const json: Response = await res.json();
        setData(json);
        setSelected(json.competenciaSelecionada);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [proprietarioId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function syncAll() {
    if (!data) return;
    setSyncing(true);
    let ok = 0;
    let fail = 0;
    for (const u of data.ucs) {
      try {
        const res = await fetch(
          `/api/consumer-units/${u.consumerUnitId}/bills/sync`,
          { method: "POST" },
        );
        const j = await res.json().catch(() => ({}));
        if (res.ok && j?.success !== false) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setSyncing(false);
    toast.success(`Sincronização concluída: ${ok} OK, ${fail} falha(s)`);
    await load(selected);
  }

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Carregando status de faturas...
        </CardContent>
      </Card>
    );
  }

  if (!data || data.ucs.length === 0) {
    return null;
  }

  const compsDisp = data.competenciasDisponiveis;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-700" />
            <CardTitle className="text-base">
              Status de faturas — todas as UCs
            </CardTitle>
          </div>
          <Button
            size="sm"
            className="bg-green-700 hover:bg-green-800"
            onClick={syncAll}
            disabled={syncing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Sincronizando..." : "Sincronizar todas"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {compsDisp.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">
              Competência:
            </span>
            {compsDisp.map((c) => {
              const isActive = sameComp(c, selected);
              return (
                <button
                  key={`${c.ano}-${c.mes}`}
                  type="button"
                  onClick={() => load(c)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border text-foreground"
                  }`}
                >
                  {mesAno(c.mes, c.ano)}
                </button>
              );
            })}
          </div>
        )}

        {selected && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Competência</p>
              <p className="text-base font-semibold">
                {mesAno(selected.mes, selected.ano)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Faturas baixadas</p>
              <p className="text-base font-semibold">
                {data.resumo.baixadasNoMes}/{data.resumo.totalUcs}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Total compensado</p>
              <p className="text-base font-semibold">
                {fmtBR(data.resumo.compensadoKwh)} kWh
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Desconto total</p>
              <p className="text-base font-semibold text-emerald-700">
                R$ {fmtBR(data.resumo.descontoValor)}
              </p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">UC</th>
                <th className="text-left font-medium px-3 py-2">Tipo</th>
                <th className="text-left font-medium px-3 py-2">
                  Sincronização
                </th>
                <th className="text-left font-medium px-3 py-2">Fatura</th>
                <th className="text-right font-medium px-3 py-2">
                  Compensado
                </th>
                <th className="text-right font-medium px-3 py-2">Desconto</th>
                <th className="text-right font-medium px-3 py-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.ucs.map((u) => (
                <tr key={u.consumerUnitId} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{u.codigoUc}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.nome}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {u.tipo === "TITULAR" ? (
                      <Badge variant="secondary">Titular</Badge>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Badge variant="outline">Beneficiária</Badge>
                        {u.percentual != null && (
                          <span className="text-xs text-muted-foreground">
                            {fmtBR(u.percentual)}%
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!u.credencial ? (
                      <span className="text-xs text-muted-foreground">
                        sem credencial
                      </span>
                    ) : u.credencial.statusSync === "SUCCESS" ? (
                      <Badge className="bg-green-600 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        OK
                      </Badge>
                    ) : u.credencial.statusSync === "ERROR" ? (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Erro
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Pendente
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {u.ultimaFatura ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-600 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Baixada
                        </Badge>
                        <button
                          type="button"
                          onClick={() =>
                            setPreview({
                              ucNome: u.nome,
                              ucCodigo: u.codigoUc,
                              mes: u.ultimaFatura!.mesReferencia,
                              ano: u.ultimaFatura!.anoReferencia,
                              valorTotal: u.ultimaFatura!.valorTotal,
                              energiaCompensada:
                                u.ultimaFatura!.energiaCompensada,
                              descontoValor: u.ultimaFatura!.descontoValor,
                              contaPaga: u.ultimaFatura!.contaPaga,
                              pdfUrl: u.ultimaFatura!.pdfUrl,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border bg-background hover:bg-muted transition-colors"
                          title="Ver fatura"
                        >
                          <Eye className="h-3 w-3" />
                          Ver
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-700 inline-flex items-center gap-1">
                        <FileX className="h-3 w-3" /> sem fatura nesta
                        competência
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {u.ultimaFatura?.energiaCompensada != null
                      ? `${fmtBR(u.ultimaFatura.energiaCompensada)} kWh`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-emerald-700 font-medium">
                    {u.ultimaFatura?.descontoValor != null
                      ? `R$ ${fmtBR(u.ultimaFatura.descontoValor)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {u.ultimaFatura?.valorTotal != null
                      ? `R$ ${fmtBR(u.ultimaFatura.valorTotal)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <FaturaPreviewDialog
        open={!!preview}
        onOpenChange={(v) => {
          if (!v) setPreview(null);
        }}
        fatura={preview}
      />
    </Card>
  );
}
