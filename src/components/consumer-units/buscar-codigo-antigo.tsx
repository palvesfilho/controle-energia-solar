"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { isCodigoUcNovo } from "@/lib/uc-codigo";

/**
 * "Buscar código": pega o código de instalação ANTIGO no site da CPFL/RGE a
 * partir do número novo da UC, para o operador não ter de ir à concessionária.
 *
 * A consulta pode levar um minuto (a CPFL limita rajadas e o servidor
 * enfileira — ver `lib/cpfl-busca-uc.ts`), então NÃO é cancelada quando o
 * operador troca de aba, abre outra janela ou segue preenchendo: a resposta
 * chega em `onAchou` quando chegar. Só é descartada se o código novo mudou no
 * meio do caminho — aí o antigo que voltou é de outra UC.
 *
 * ⚠️ `onAchou` roda bem depois do clique: grave com atualização funcional
 * (`setForm((f) => ...)`), senão apaga o que foi digitado durante a espera.
 */
export interface BuscaCodigoAntigo {
  estado: "parado" | "buscando" | "achou" | "falhou";
  texto: string;
  podeBuscar: boolean;
  buscar: () => void;
}

const PARADO = { estado: "parado", texto: "" } as const;

export function useBuscaCodigoAntigo(
  codigoNovo: string,
  onAchou: (antigo: string) => void,
): BuscaCodigoAntigo {
  const [situacao, setSituacao] = useState<Pick<BuscaCodigoAntigo, "estado" | "texto">>(PARADO);
  const digitos = codigoNovo.replace(/\D/g, "");
  const atual = useRef(digitos);
  useEffect(() => {
    atual.current = digitos;
  }, [digitos]);

  const buscar = async () => {
    const pedido = digitos;
    setSituacao({ estado: "buscando", texto: "" });
    let proxima: Pick<BuscaCodigoAntigo, "estado" | "texto">;
    try {
      const res = await fetch(`/api/consumer-units/buscar-codigo-cpfl?codigo=${pedido}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        proxima = { estado: "falhou", texto: data.error || "Não consegui consultar a CPFL." };
      } else if (!data.encontrado) {
        proxima = {
          estado: "falhou",
          texto: "A CPFL/RGE não encontrou esse código de UC. Confira o número.",
        };
      } else {
        if (atual.current === pedido) onAchou(data.antigo);
        proxima = {
          estado: "achou",
          texto: [data.status, data.endereco].filter(Boolean).join(" · "),
        };
      }
    } catch {
      proxima = { estado: "falhou", texto: "Não consegui consultar a CPFL. Tente de novo." };
    }
    setSituacao(atual.current === pedido ? proxima : PARADO);
  };

  return { ...situacao, podeBuscar: isCodigoUcNovo(digitos), buscar };
}

export function BotaoBuscarCodigoAntigo({ busca }: { busca: BuscaCodigoAntigo }) {
  const buscando = busca.estado === "buscando";
  return (
    <button
      type="button"
      onClick={busca.buscar}
      disabled={!busca.podeBuscar || buscando}
      title={
        busca.podeBuscar
          ? "Consulta o código antigo no site da CPFL/RGE"
          : "Preencha antes o código novo da UC"
      }
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
    >
      {buscando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Search className="h-3.5 w-3.5" />
      )}
      {buscando ? "Buscando…" : "Buscar código"}
    </button>
  );
}

/** Linha de retorno abaixo do campo. Nada enquanto ninguém clicou. */
export function MensagemBuscaCodigoAntigo({ busca }: { busca: BuscaCodigoAntigo }) {
  if (busca.estado === "buscando") {
    return (
      <p className="text-xs text-muted-foreground">
        Consultando a CPFL/RGE — pode levar até um minuto. Pode seguir
        preenchendo ou trocar de janela: o campo se preenche sozinho.
      </p>
    );
  }
  if (busca.estado === "achou") {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-500">
        Preenchido pela CPFL/RGE — {busca.texto}. Confira o endereço.
      </p>
    );
  }
  if (busca.estado === "falhou") {
    return <p className="text-xs text-red-700 dark:text-red-500">{busca.texto}</p>;
  }
  return null;
}
