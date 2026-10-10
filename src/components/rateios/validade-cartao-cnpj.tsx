"use client";

/**
 * Como a validade do cartão CNPJ aparece nas telas. A regra (5 meses avisa, 6
 * meses a RGE recusa) mora em [[cartao-cnpj]]; aqui é só a apresentação, igual
 * no cadastro, na janela do ZIP e no aviso do rateio.
 */

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataBr, type ValidadeCartaoCnpj } from "@/lib/cartao-cnpj";

/** Uma linha de texto com a situação. `curto` = para célula de tabela. */
export function TextoValidadeCartaoCnpj({
  validade,
  curto = false,
  className,
}: {
  validade: ValidadeCartaoCnpj;
  curto?: boolean;
  className?: string;
}) {
  const { situacao, emitidoEm, aceitoAte } = validade;
  const cor =
    situacao === "vencido"
      ? "text-red-700 dark:text-red-400"
      : situacao === "vencendo"
        ? "text-amber-700 dark:text-amber-500"
        : "text-muted-foreground";

  const texto =
    situacao === "sem_data"
      ? curto
        ? "emissão não lida — confira"
        : "Não consegui ler a data de emissão neste arquivo."
      : situacao === "vencido"
        ? curto
          ? `emitido em ${dataBr(emitidoEm)} — vencido`
          : `Emitido em ${dataBr(emitidoEm)}. A RGE aceitava até ${dataBr(aceitoAte)} — emita outro.`
        : situacao === "vencendo"
          ? curto
            ? `emitido em ${dataBr(emitidoEm)} — vence ${dataBr(aceitoAte)}`
            : `Emitido em ${dataBr(emitidoEm)}. A RGE só aceita até ${dataBr(aceitoAte)} — hora de emitir outro.`
          : curto
            ? `emitido em ${dataBr(emitidoEm)}`
            : `Emitido em ${dataBr(emitidoEm)}. A RGE aceita até ${dataBr(aceitoAte)}.`;

  return <span className={cn(cor, situacao !== "ok" && situacao !== "sem_data" && "font-medium", className)}>{texto}</span>;
}

/**
 * Aviso do cartão CNPJ da ASSOCIAÇÃO, para as telas onde se monta um rateio.
 * Busca sozinho o estado do cadastro; calado enquanto o cartão está em dia.
 */
export function AvisoCartaoCnpjAssociacao() {
  const [validade, setValidade] = useState<ValidadeCartaoCnpj | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/rateios/documentos-fixos")
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: { chave: string; validade: ValidadeCartaoCnpj | null }[]) => {
        if (cancelado || !Array.isArray(lista)) return;
        setValidade(lista.find((d) => d.chave === "cartao_cnpj")?.validade ?? null);
      })
      // Aviso é complemento: se a consulta falhar, a tela do rateio segue.
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  if (!validade || (validade.situacao !== "vencido" && validade.situacao !== "vencendo")) return null;
  const vencido = validade.situacao === "vencido";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-xs",
        vencido
          ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
      )}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">
          {vencido
            ? "O cartão CNPJ da associação passou de 6 meses — a RGE não aceita mais."
            : "O cartão CNPJ da associação já tem mais de 5 meses."}
        </p>
        <p>
          Emitido em {dataBr(validade.emitidoEm)};{" "}
          {vencido ? "era aceito" : "a RGE só aceita"} até {dataBr(validade.aceitoAte)}. Emita
          outro na Receita e troque em{" "}
          <a
            href="/admin/personalizacoes/documentos-associacao"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            Personalizações → Documentos da associação
          </a>
          .
        </p>
      </div>
    </div>
  );
}
