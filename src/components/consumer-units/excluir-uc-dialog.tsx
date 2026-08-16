"use client";

import { ExcluirCadastroDialog } from "@/components/shared/excluir-cadastro-dialog";

const FRASE_CONFIRMACAO = "quero mesmo excluir uc";

// Exclusão de unidade consumidora — mesmo diálogo e mesmas regras da usina.
export function ExcluirUcDialog({
  ucId,
  ucNome,
  open,
  onOpenChange,
  onExcluida,
}: {
  ucId: string | null;
  ucNome: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExcluida: (id: string) => void;
}) {
  return (
    <ExcluirCadastroDialog
      registroId={ucId}
      nome={ucNome}
      rotulo="unidade consumidora"
      frase={FRASE_CONFIRMACAO}
      basePath="/api/consumer-units"
      open={open}
      onOpenChange={onOpenChange}
      onExcluido={onExcluida}
    />
  );
}
