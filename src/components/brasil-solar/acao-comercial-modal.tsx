"use client";

/**
 * Painel "Ação comercial" — o relatório do cliente lido pelo lado da venda.
 *
 * Só exibe: toda a lógica é determinística e vive em `@/lib/acao-comercial`,
 * que deriva as oportunidades do MESMO diagnóstico que sai no PDF do cliente.
 * Se um número aparece aqui, ele também aparece (ou sustenta) o relatório —
 * a equipe pode mostrar a tela e o relatório sem risco de divergir.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  X,
  Target,
  Copy,
  FileBarChart2,
  AlertTriangle,
  Mail,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { formatCodigoUc } from "@/lib/uc-codigo";
import type {
  AcaoComercialData,
  AcaoComercialPrioridade,
  OportunidadeComercial,
} from "@/lib/acao-comercial";

const PRIORIDADE_CLS: Record<AcaoComercialPrioridade, string> = {
  ALTA: "bg-orange-100 text-orange-700 border-orange-200",
  MEDIA: "bg-amber-50 text-amber-700 border-amber-200",
  BAIXA: "bg-muted text-muted-foreground border-transparent",
};

const PRIORIDADE_ROTULO: Record<AcaoComercialPrioridade, string> = {
  ALTA: "Prioridade alta",
  MEDIA: "Oportunidade",
  BAIXA: "Relacionamento",
};

/** Borda esquerda colorida — dá pra varrer a lista sem ler os badges. */
const PRIORIDADE_BARRA: Record<AcaoComercialPrioridade, string> = {
  ALTA: "border-l-orange-500",
  MEDIA: "border-l-amber-400",
  BAIXA: "border-l-muted-foreground/30",
};

/** Texto pronto pra colar no CRM/WhatsApp — evita retrabalho de digitação. */
function montarResumo(data: AcaoComercialData): string {
  const linhas: string[] = [
    `AÇÃO COMERCIAL — ${data.proprietario.nome}`,
    data.mesesConsiderados != null
      ? `Base: diagnóstico do relatório (${data.mesesConsiderados} meses de fatura)`
      : "Base: diagnóstico do relatório",
    "",
  ];
  data.oportunidades.forEach((op, i) => {
    linhas.push(`${i + 1}. [${PRIORIDADE_ROTULO[op.prioridade]}] ${op.titulo}`);
    linhas.push(`   Origem: ${op.origem}`);
    linhas.push(`   Evidência: ${op.evidencia}`);
    for (const n of op.numeros) linhas.push(`   • ${n.label}: ${n.valor}`);
    linhas.push(`   Próximo passo: ${op.acao}`);
    linhas.push("");
  });
  return linhas.join("\n");
}

function OportunidadeCard({ op }: { op: OportunidadeComercial }) {
  return (
    <div className={`rounded-lg border border-l-4 ${PRIORIDADE_BARRA[op.prioridade]} p-3 space-y-2`}>
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold text-sm leading-snug">{op.titulo}</h4>
        <span
          className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${PRIORIDADE_CLS[op.prioridade]}`}
        >
          {PRIORIDADE_ROTULO[op.prioridade]}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground">{op.origem}</p>

      {op.numeros.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {op.numeros.map((n, i) => (
            <span
              key={i}
              className="text-xs bg-muted/60 rounded px-2 py-1 border"
            >
              <span className="text-muted-foreground">{n.label}: </span>
              <span className="font-medium">{n.valor}</span>
            </span>
          ))}
        </div>
      )}

      {/* A evidência é o texto que o cliente lê no relatório — mostrar igual
          evita o vendedor inventar uma justificativa própria. */}
      <div className="text-xs bg-muted/30 border-l-2 border-muted-foreground/20 pl-2 py-1 text-muted-foreground">
        {op.evidencia}
      </div>

      <p className="text-xs">
        <span className="font-medium">Próximo passo: </span>
        {op.acao}
      </p>
    </div>
  );
}

interface Props {
  proprietarioId: string;
  proprietarioNome: string;
  open: boolean;
  onClose: () => void;
}

export function AcaoComercialModal({
  proprietarioId,
  proprietarioNome,
  open,
  onClose,
}: Props) {
  const [data, setData] = useState<AcaoComercialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErro(null);
    fetch(`/api/brasil-solar/proprietarios/${proprietarioId}/acao-comercial`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error ?? "Falha ao analisar o cliente");
        setData(d as AcaoComercialData);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, proprietarioId]);

  if (!open) return null;

  const semDiagnostico = data?.ucsAnalisadas.filter((u) => !u.diagnosticada) ?? [];

  const handleCopiar = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(montarResumo(data));
      toast.success("Resumo copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-orange-100 text-orange-600">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Ação comercial</h3>
              <p className="text-xs text-muted-foreground">{proprietarioNome}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analisando faturas e geração do cliente...
            </div>
          )}

          {erro && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {data && !loading && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {data.escopo === "AGREGADO"
                    ? "Diagnóstico do rateio (cliente com beneficiárias)"
                    : "Diagnóstico por unidade consumidora"}
                </span>
                {data.mesesConsiderados != null && (
                  <span>{data.mesesConsiderados} meses de fatura analisados</span>
                )}
                {data.proprietario.telefone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {data.proprietario.telefone}
                  </span>
                )}
                {data.proprietario.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {data.proprietario.email}
                  </span>
                )}
              </div>

              {data.oportunidades.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-10">
                  Nenhuma oportunidade identificada — não há diagnóstico
                  disponível para este cliente ainda.
                </div>
              ) : (
                data.oportunidades.map((op, i) => (
                  <OportunidadeCard key={i} op={op} />
                ))
              )}

              {semDiagnostico.length > 0 && (
                <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                  <p className="font-medium">
                    Unidades fora da análise ({semDiagnostico.length})
                  </p>
                  {semDiagnostico.map((u) => (
                    <p key={u.ucId} className="text-muted-foreground">
                      {formatCodigoUc(u.codigoUc)} · {u.nome} — {u.motivo}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-3 border-t">
          <Link
            href={`/admin/brasil-solar/proprietarios/${proprietarioId}/relatorios`}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
          >
            <FileBarChart2 className="h-4 w-4" />
            Abrir relatório
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopiar}
              disabled={!data || data.oportunidades.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <Copy className="h-4 w-4" />
              Copiar resumo
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
