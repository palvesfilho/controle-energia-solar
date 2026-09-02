"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportarXlsx, lerTabela } from "@/lib/exportar-tabela";

type Props = {
  /**
   * Valor do `data-tabela` da `<table>` que vai ser exportada. O botão acha a
   * tabela por esse atributo em vez de por proximidade no DOM porque, na maior
   * parte das telas, ele mora no cabeçalho do card e a tabela está vários
   * níveis abaixo — e há telas com mais de uma tabela no mesmo card.
   */
  tabela: string;
  /** Nome do arquivo, sem extensão. A data do dia é acrescentada. */
  nome: string;
  /** Nome da aba dentro do Excel. Cai no `nome` quando não informado. */
  aba?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "xs" | "sm" | "default";
  /** Só o ícone, para cabeçalhos apertados. */
  apenasIcone?: boolean;
  /**
   * Tela cuja lista é paginada no servidor. Muda o rótulo para "Exportar
   * página": o botão só alcança as linhas que estão listadas, e prometer o total
   * seria mentira — o operador levaria 50 de 800 sem perceber.
   */
  paginada?: boolean;
  className?: string;
};

/**
 * Botão "Exportar" padrão das tabelas.
 *
 * Exporta o que está NA TELA: o filtro e a ordenação em vigor já valem, porque
 * a leitura é do DOM renderizado (ver `lib/exportar-tabela.ts`).
 */
export function ExportarTabela({
  tabela,
  nome,
  aba,
  variant = "outline",
  size = "sm",
  apenasIcone = false,
  paginada = false,
  className,
}: Props) {
  const [gerando, setGerando] = useState(false);

  const exportar = async () => {
    // A tabela some do DOM quando a tela cai no estado vazio ("nenhum resultado
    // para os filtros"), então não achar não é defeito — é lista vazia.
    const el = document.querySelector<HTMLTableElement>(`table[data-tabela="${tabela}"]`);
    const lida = el ? lerTabela(el) : null;
    if (!lida) {
      toast.info("Não há nada para exportar com os filtros atuais.");
      return;
    }

    setGerando(true);
    try {
      await exportarXlsx(lida, { nome, aba });
      toast.success(
        `${lida.linhas.length} ${lida.linhas.length === 1 ? "linha exportada" : "linhas exportadas"}.`,
      );
    } catch (e) {
      console.error("[exportar-tabela] falha ao gerar o arquivo", e);
      toast.error("Não foi possível gerar o arquivo.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={apenasIcone ? (size === "xs" ? "icon-xs" : "icon-sm") : size}
      onClick={exportar}
      disabled={gerando}
      title={
        paginada
          ? "Exportar para Excel as linhas listadas nesta página"
          : "Exportar para Excel o que está na tela (respeita os filtros)"
      }
      className={className}
    >
      {gerando ? (
        <Loader2 className="animate-spin" data-icon="inline-start" />
      ) : (
        <Download data-icon="inline-start" />
      )}
      {!apenasIcone && (gerando ? "Gerando..." : paginada ? "Exportar página" : "Exportar")}
    </Button>
  );
}
