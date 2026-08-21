"use client";

/**
 * Aviso da primeira compensação — "esta UC começou a receber desconto, pode
 * cobrar".
 *
 * O mesmo card serve duas telas de propósito: **Unidades Consumidoras** (onde o
 * operador acompanha a implantação) e **Faturamento → UCs** (onde ele de fato
 * cobra). São dois momentos diferentes do mesmo trabalho, e quem está cobrando
 * não deveria precisar lembrar de ir conferir a outra tela.
 *
 * Ele some sozinho quando não há nada pendente. Card que fica sempre na tela,
 * mesmo vazio, vira moldura — e moldura ninguém lê.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatCodigoUc } from "@/lib/uc-codigo";

interface NovaCompensacao {
  id: string;
  nome: string;
  codigoUc: string;
  consumidor: string | null;
  primeiraCompensacao: string;
  faturasSemCompensacao: number;
}

interface Resposta {
  total: number;
  novas: NovaCompensacao[];
  emImplantacao: number;
  atrasadas: number;
}

export function AvisoPrimeirasCompensacoes({
  onLiberada,
  mostrarLinkImplantacao = true,
}: {
  /** Chamado após liberar uma UC, pra tela recarregar a lista dela. */
  onLiberada?: () => void;
  mostrarLinkImplantacao?: boolean;
}) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [liberando, setLiberando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/consumer-units/primeiras-compensacoes");
      if (!res.ok) return;
      setDados((await res.json()) as Resposta);
    } catch {
      // Silêncio: o aviso não pode derrubar a tela que o hospeda.
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function liberar(uc: NovaCompensacao) {
    setLiberando(uc.id);
    try {
      const res = await fetch(`/api/consumer-units/${uc.id}/liberar-cobranca`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Não foi possível liberar a cobrança.");
        return;
      }
      toast.success(`${uc.nome} liberada para cobrança.`);
      await carregar();
      onLiberada?.();
    } catch {
      toast.error("Falha de rede ao liberar a cobrança.");
    } finally {
      setLiberando(null);
    }
  }

  if (!dados || dados.total === 0) return null;

  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-emerald-900">
            {dados.total === 1
              ? "1 UC teve a primeira compensação — já pode cobrar"
              : `${dados.total} UCs tiveram a primeira compensação — já podem ser cobradas`}
          </div>
          <div className="text-[11px] text-emerald-800">
            O desconto apareceu na fatura da distribuidora. Libere a cobrança
            para tirar o aviso daqui e do sino.
          </div>

          <div className="mt-2 space-y-1.5">
            {dados.novas.map((uc) => (
              <div
                key={uc.id}
                className="flex flex-wrap items-center gap-2 rounded border border-emerald-200 bg-white px-2.5 py-1.5"
              >
                <Link
                  href={`/admin/unidades-consumidoras/${uc.id}/editar`}
                  className="text-sm font-medium hover:text-primary hover:underline underline-offset-2"
                >
                  {uc.nome}
                </Link>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {formatCodigoUc(uc.codigoUc)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  1ª compensação em {uc.primeiraCompensacao}
                  {uc.faturasSemCompensacao > 0 &&
                    ` · esperou ${uc.faturasSemCompensacao} ${
                      uc.faturasSemCompensacao === 1 ? "conta" : "contas"
                    }`}
                </span>
                <button
                  onClick={() => void liberar(uc)}
                  disabled={liberando === uc.id}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  {liberando === uc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BadgeCheck className="h-3.5 w-3.5" />
                  )}
                  Liberar cobrança
                </button>
              </div>
            ))}
          </div>

          {mostrarLinkImplantacao && dados.emImplantacao > 0 && (
            <div className="mt-2 text-[11px] text-emerald-800">
              Outras {dados.emImplantacao} UCs seguem em implantação
              {dados.atrasadas > 0 && (
                <>
                  {" "}
                  — <strong>{dados.atrasadas}</strong> esperando há tempo demais
                </>
              )}
              .{" "}
              <Link
                href="/admin/unidades-consumidoras?fase=implantacao"
                className="font-medium underline underline-offset-2"
              >
                Ver lista
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
