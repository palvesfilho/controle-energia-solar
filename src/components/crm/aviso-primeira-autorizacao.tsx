"use client";

/**
 * Card que aparece quando a PRIMEIRA adesão com Autorização de Acesso é
 * assinada — e traz o veredito do que dá para conferir sozinho.
 *
 * Existe porque o caminho dos três documentos subiu em 21/08/2026 numa janela
 * sem nenhum envelope em voo: nunca rodou com cliente real. Sem este card,
 * alguém teria que lembrar de olhar. Ver `@/lib/crm-primeira-autorizacao`.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSignature, HelpCircle, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PrimeiraAutorizacao {
  envelopeId: string;
  adesaoId: number | null;
  cliente: string | null;
  assinadoEm: string | null;
  temTermo: boolean;
  temProcuracao: boolean;
  temAutorizacao: boolean;
  colunasTrocadas: boolean | null;
  conferidoEm: string;
}

interface Estado {
  chegou: boolean;
  primeira?: PrimeiraAutorizacao;
  total: number;
  dispensados: number;
}

function dataBrt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Uma linha de conferência: verde quando confirmada, âmbar quando não dá para afirmar. */
function Linha({
  estado,
  children,
}: {
  estado: "ok" | "alerta" | "indefinido";
  children: React.ReactNode;
}) {
  const Icone =
    estado === "ok" ? CheckCircle2 : estado === "alerta" ? AlertTriangle : HelpCircle;
  const cor =
    estado === "ok"
      ? "text-emerald-600"
      : estado === "alerta"
        ? "text-red-600"
        : "text-amber-600";
  return (
    <li className="flex items-start gap-2">
      <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} />
      <span>{children}</span>
    </li>
  );
}

export function AvisoPrimeiraAutorizacao() {
  const [estado, setEstado] = useState<Estado | null>(null);

  const carregar = useCallback(() => {
    fetch("/api/crm/autorizacoes/primeira")
      .then((r) => (r.ok ? r.json() : null))
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function arquivar(envelopeId: string) {
    try {
      await fetch("/api/crm/autorizacoes/primeira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envelopeId }),
      });
      toast.success("Aviso arquivado — a próxima adesão com autorização volta a avisar.");
      carregar();
    } catch {
      toast.error("Não consegui arquivar o aviso.");
    }
  }

  if (!estado?.chegou || !estado.primeira) return null;

  const p = estado.primeira;
  const tresDocumentos = p.temTermo && p.temProcuracao && p.temAutorizacao;
  const quando = dataBrt(p.assinadoEm) ?? dataBrt(p.conferidoEm);

  return (
    <Card className="border-emerald-300 bg-emerald-50/60">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold text-emerald-900">
                Chegou a 1ª adesão assinada com Autorização de Acesso
              </p>
              <p className="text-sm text-emerald-800">
                {p.cliente ?? "Cliente não identificado"}
                {quando ? ` · ${quando}` : ""}
                {estado.total > 1 ? ` · já são ${estado.total} envelopes` : ""}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => arquivar(p.envelopeId)}
            title="Arquivar este aviso"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ul className="space-y-1.5 text-sm text-emerald-900">
          <Linha estado={tresDocumentos ? "ok" : "alerta"}>
            {tresDocumentos ? (
              <>Os <strong>três documentos</strong> estão guardados no envelope.</>
            ) : (
              <>
                Falta documento no envelope: termo {p.temTermo ? "✓" : "✗"} · procuração{" "}
                {p.temProcuracao ? "✓" : "✗"} · autorização {p.temAutorizacao ? "✓" : "✗"}.
                O botão <strong>&ldquo;Buscar no Clicksign&rdquo;</strong> força a busca na hora.
              </>
            )}
          </Linha>

          {/* O ponto que só uma adesão nova podia provar: em 15/08/2026, 14 de
              22 vinham com termo e procuração em colunas trocadas. */}
          {p.colunasTrocadas === false && (
            <Linha estado="ok">
              <strong>Termo e procuração vieram nas colunas certas</strong> — conferido pelo
              conteúdo do PDF. A correção de casar documento pelo nome, e não pela posição,
              funcionou.
            </Linha>
          )}
          {p.colunasTrocadas === true && (
            <Linha estado="alerta">
              🚨 <strong>Termo e procuração vieram TROCADOS</strong> — o defeito das 14 de 22
              continua nas adesões novas. Aqui dentro o desembaralhador corrige na leitura,
              então os documentos aparecem certos; a causa segue no CRM.
            </Linha>
          )}
          {p.colunasTrocadas === null && (
            <Linha estado="indefinido">
              Não deu para afirmar se termo e procuração vieram nas colunas certas (PDF
              ilegível ou faltando) — conferir na mão vale a pena.
            </Linha>
          )}

          <Linha estado="indefinido">
            Falta conferir com o olho: que os <strong>três baixam</strong> pela janela de
            documentos e que a venda fechou sozinha, sem parar em{" "}
            <code className="rounded bg-emerald-100 px-1">falta_autorizacao</code>.
          </Linha>
        </ul>
      </CardContent>
    </Card>
  );
}
