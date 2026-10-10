"use client";

/**
 * Como a validade do cartão CNPJ aparece nas telas. A regra (5 meses avisa, 6
 * meses a RGE recusa) mora em [[cartao-cnpj]]; aqui é só a apresentação, igual
 * no cadastro, na janela do ZIP e no aviso do rateio.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, TriangleAlert, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataBr, urlReceitaCartaoCnpj, type ValidadeCartaoCnpj } from "@/lib/cartao-cnpj";

const BOTAO_ATALHO =
  "inline-flex items-center gap-1 rounded border border-current/30 bg-background/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-background disabled:opacity-50";

/**
 * Os dois passos de trocar um cartão CNPJ vencido, lado a lado:
 *
 *   "Emitir na Receita" — abre a página do comprovante já com o CNPJ preenchido
 *     (e copiado, caso o site não aproveite). A emissão pede captcha, então o
 *     operador resolve e baixa o PDF; não há como buscar sozinho.
 *   "Enviar novo"       — sobe o PDF baixado para a UC. Só aparece quando a UC
 *     é informada; o cartão da associação é trocado no cadastro dela.
 */
export function AtalhoCartaoCnpj({
  cnpj,
  consumerUnitId,
  onTrocado,
  className,
}: {
  cnpj?: string | null;
  consumerUnitId?: string;
  onTrocado?: () => void;
  className?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const digitos = (cnpj ?? "").replace(/\D/g, "");
  const temCnpj = digitos.length === 14;

  async function abrirReceita() {
    // A aba abre ANTES de copiar: depois de um `await` o navegador já não trata
    // o clique como gesto do usuário e bloqueia a janela como pop-up.
    window.open(urlReceitaCartaoCnpj(digitos), "_blank", "noopener,noreferrer");
    if (temCnpj) {
      try {
        await navigator.clipboard.writeText(digitos);
        toast.success("CNPJ copiado. Se o site não vier preenchido, é só colar.");
      } catch {
        // Sem permissão de área de transferência: o link já leva o CNPJ.
      }
    }
  }

  async function enviar(arquivo: File) {
    if (!consumerUnitId) return;
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const res = await fetch(`/api/consumer-units/${consumerUnitId}/cartao-cnpj`, {
        method: "POST",
        body: form,
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
      const v = dados.validade as ValidadeCartaoCnpj | undefined;
      toast.success(
        `Cartão CNPJ trocado${dados.ucsAtualizadas > 1 ? ` em ${dados.ucsAtualizadas} UCs do mesmo titular` : ""}.` +
          (v?.emitidoEm ? ` Emitido em ${dataBr(v.emitidoEm)}.` : ""),
      );
      if (v?.situacao === "sem_data") {
        toast.warning("Não consegui ler a data de emissão neste arquivo — confira se é o PDF baixado da Receita.");
      } else if (v?.situacao === "vencido" || v?.situacao === "vencendo") {
        toast.warning("O arquivo enviado também já tem mais de 5 meses.");
      }
      onTrocado?.();
    } catch (err) {
      toast.error(`Falha ao enviar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <button type="button" onClick={abrirReceita} className={BOTAO_ATALHO}>
        <ExternalLink className="h-3 w-3" />
        Emitir na Receita
      </button>
      {consumerUnitId && (
        <>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void enviar(f);
            }}
          />
          <button
            type="button"
            disabled={enviando}
            onClick={() => input.current?.click()}
            className={BOTAO_ATALHO}
          >
            {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Enviar novo
          </button>
        </>
      )}
    </span>
  );
}

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
  const [cnpj, setCnpj] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/rateios/documentos-fixos")
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: { chave: string; validade: ValidadeCartaoCnpj | null; cnpj?: string | null }[]) => {
        if (cancelado || !Array.isArray(lista)) return;
        const cartao = lista.find((d) => d.chave === "cartao_cnpj");
        setValidade(cartao?.validade ?? null);
        setCnpj(cartao?.cnpj ?? null);
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
        <AtalhoCartaoCnpj cnpj={cnpj} />
      </div>
    </div>
  );
}
