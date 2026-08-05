"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  History,
} from "lucide-react";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { BackfillInicioDialog } from "./backfill-inicio-dialog";
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

/** Por extenso, para a mensagem de "o portal só tem a partir de ...". */
const MESES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

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

export function StatusFaturasCard({
  proprietarioId,
  /**
   * Avisa o pai que faturas novas entraram no banco, para ele recarregar os
   * outros cards da página que também as mostram (a "Lista de faturas" da UC,
   * logo abaixo). Sem isto o backfill só apareceria lá depois de um F5.
   */
  onFaturasImportadas,
}: {
  proprietarioId: string;
  onFaturasImportadas?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<Response | null>(null);
  const [selected, setSelected] = useState<Competencia | null>(null);
  const [preview, setPreview] = useState<FaturaPreviewData | null>(null);
  const [syncingAntigas, setSyncingAntigas] = useState(false);
  const [escolhendoInicio, setEscolhendoInicio] = useState(false);
  // Última linha do log do robô + em que UC ele está. É o sinal de vida durante
  // um backfill, que pode levar muitos minutos. Vive só enquanto a tela está
  // aberta: fechar NÃO cancela o robô — o job segue, e clicar de novo depois é
  // seguro porque a importação é idempotente (não duplica fatura).
  const [progressoAntigas, setProgressoAntigas] = useState("");
  const naTela = useRef(true);
  useEffect(() => {
    naTela.current = true;
    return () => {
      naTela.current = false;
    };
  }, []);

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

  /**
   * Baixa as faturas de meses anteriores de TODAS as UCs com credencial.
   *
   * UMA UC DE CADA VEZ, esperando a anterior terminar: cada job abre um navegador
   * inteiro no servidor e o robô os executa em fila de qualquer jeito. Disparar
   * tudo junto só multiplicaria o acesso simultâneo ao portal — que é o que atrai
   * bloqueio — sem terminar mais cedo.
   *
   * A cada UC concluída a tabela é recarregada, então as competências novas vão
   * APARECENDO no seletor e as faturas vão preenchendo a tabela conforme descem,
   * em vez de tudo surgir de uma vez no fim.
   */
  async function syncAntigas(
    meses: number,
    rotuloInicio: string,
    inicio: { ano: number; mes: number },
  ) {
    if (!data) return;
    const alvos = data.ucs.filter((u) => u.credencial);
    if (alvos.length === 0) {
      toast.error("Nenhuma UC com credencial da concessionária cadastrada.");
      return;
    }

    setSyncingAntigas(true);
    const total = { criadas: 0, jaExistiam: 0, semSegundaVia: 0, erros: 0, incompletas: 0 };
    // Competência mais antiga que o portal ofereceu, entre TODAS as UCs. Se ela
    // for mais recente que o mês pedido, o histórico acabou antes — e isso não é
    // falha: a concessionária só guarda a segunda via por um tempo.
    let maisAntiga: { ano: number; mes: number } | null = null;

    try {
      for (let i = 0; i < alvos.length; i++) {
        const u = alvos[i];
        const posicao = alvos.length > 1 ? `UC ${i + 1}/${alvos.length} — ` : "";
        setProgressoAntigas(`${posicao}${u.nome}: iniciando...`);

        let jobId: string;
        try {
          const res = await fetch(
            `/api/consumer-units/${u.consumerUnitId}/bills/backfill`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ meses }),
            },
          );
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j?.error || "falha ao iniciar");
          jobId = j.jobId;
        } catch (e) {
          total.erros++;
          toast.error(
            `${u.nome}: ${e instanceof Error ? e.message : "falha ao iniciar"}`,
          );
          continue; // uma UC problemática não interrompe as outras
        }

        // Polling. Sem prazo: só a fila de acesso da CPFL pode levar 45 min —
        // demora NÃO é erro, por isso não há timeout aqui.
        let concluido = false;
        while (!concluido) {
          if (!naTela.current) return; // saiu da tela: para de acompanhar
          await new Promise((r) => setTimeout(r, 5000));

          let j: Record<string, unknown>;
          try {
            const res = await fetch(
              `/api/consumer-units/${u.consumerUnitId}/bills/backfill/status?jobId=${encodeURIComponent(jobId)}`,
            );
            j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((j?.error as string) || "falha ao consultar");
          } catch (e) {
            total.erros++;
            toast.error(
              `${u.nome}: ${e instanceof Error ? e.message : "falha ao consultar"}`,
            );
            break;
          }

          if (!j.terminou) {
            setProgressoAntigas(
              `${posicao}${u.nome}: ${(j.progresso as string) || "trabalhando..."}`,
            );
            continue;
          }
          concluido = true;

          if (j.status === "falhou") {
            total.erros++;
            toast.error(`${u.nome}: o robô falhou — ${j.erro || "sem detalhe"}`);
          } else if (j.erro && Number(j.encontradas ?? 0) === 0) {
            // Terminou "bem" mas sem achar nada, e o robô disse por quê (conta sem
            // UC vinculada, por exemplo). O motivo vale mais que o silêncio: sem
            // ele a pessoa repete o botão sem saber que o problema é no portal.
            total.erros++;
            toast.warning(`${u.nome}: ${j.erro}`, { duration: 15000 });
          } else if (j.status === "cancelado") {
            toast.info(`${u.nome}: cancelado — o que já baixou foi preservado.`);
          } else {
            total.criadas += Number(j.criadas ?? 0);
            total.jaExistiam += Number(j.jaExistiam ?? 0);
            total.semSegundaVia += Number(j.semSegundaVia ?? 0);
            total.erros += Number(j.erros ?? 0);

            const ano = Number(j.maisAntigaAno);
            const mesA = Number(j.maisAntigaMes);
            if (ano && mesA) {
              if (!maisAntiga || ano < maisAntiga.ano ||
                  (ano === maisAntiga.ano && mesA < maisAntiga.mes)) {
                maisAntiga = { ano, mes: mesA };
              }
            }
            // `completo: false` = o robô não varreu tudo (o portal caiu no meio).
            // Não é sucesso: contar à parte evita um "pronto" enganoso no fim.
            if (j.completo === false) total.incompletas++;
          }

          // Recarrega já: as faturas desta UC entram na tabela e os meses novos
          // aparecem no seletor de competência antes da próxima UC começar.
          await load(selected);
          // E avisa a página, para a "Lista de faturas" logo abaixo mostrar as
          // novas sem exigir F5.
          if (Number(j.criadas ?? 0) > 0) onFaturasImportadas?.();
        }
      }
    } finally {
      setSyncingAntigas(false);
      setProgressoAntigas("");
    }

    const partes = [`${total.criadas} fatura(s) nova(s)`];
    if (total.jaExistiam) partes.push(`${total.jaExistiam} já existia(m)`);
    if (total.semSegundaVia) partes.push(`${total.semSegundaVia} sem segunda via`);
    if (total.erros) partes.push(`${total.erros} com erro`);

    // O portal acabou antes do mês pedido? Avisa em separado, porque a pessoa
    // pediu 2021, recebeu de 2024 e sem isto não sabe se foi limite da
    // concessionária ou defeito. Vale mesmo quando o resto correu bem.
    const antiga: { ano: number; mes: number } | null = maisAntiga;
    if (
      antiga &&
      (antiga.ano > inicio.ano ||
        (antiga.ano === inicio.ano && antiga.mes > inicio.mes))
    ) {
      const nome = MESES_EXTENSO[antiga.mes - 1];
      toast.warning(
        `A concessionária só tem segunda via a partir de ${nome}/${antiga.ano}. ` +
          `As faturas anteriores a essa data não estão mais no portal — para ` +
          `essas, use o upload manual.`,
        { duration: 12000 },
      );
    }

    if (total.incompletas) {
      toast.warning(
        `${partes.join(", ")}. ${total.incompletas} UC(s) não foram varridas por inteiro — dá para repetir.`,
      );
    } else if (total.criadas === 0 && total.erros === 0) {
      // Dizer DESDE QUANDO se procurou: sem isso "nada novo" parece falha, quando
      // muitas vezes só significa que o período pedido já estava completo.
      toast.info(
        `Nada novo desde ${rotuloInicio} (${partes.join(", ")}). ` +
          `Para buscar mais fundo, escolha um mês anterior.`,
      );
    } else {
      toast.success(partes.join(", ") + ".");
    }
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEscolhendoInicio(true)}
              disabled={syncing || syncingAntigas}
              title="Baixa as faturas de meses anteriores no portal da concessionária e grava cada uma na sua UC"
            >
              <History
                className={`h-4 w-4 mr-1.5 ${syncingAntigas ? "animate-spin" : ""}`}
              />
              {syncingAntigas ? "Baixando antigas..." : "Sincronizar faturas antigas"}
            </Button>
            <Button
              size="sm"
              className="bg-green-700 hover:bg-green-800"
              onClick={syncAll}
              disabled={syncing || syncingAntigas}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Sincronizando..." : "Sincronizar todas"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sinal de vida do robô. Um backfill leva minutos (a fila de acesso da
            CPFL sozinha pode levar 45): sem isto a tela parece travada. */}
        {syncingAntigas && (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <History className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-spin" />
            <span className="break-words">
              {progressoAntigas || "conversando com o robô..."}
            </span>
          </div>
        )}

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
                    <div className="font-mono text-xs">{formatCodigoUc(u.codigoUc)}</div>
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
      <BackfillInicioDialog
        open={escolhendoInicio}
        onOpenChange={setEscolhendoInicio}
        totalUcs={data.ucs.filter((u) => u.credencial).length}
        onConfirmar={syncAntigas}
      />
    </Card>
  );
}
